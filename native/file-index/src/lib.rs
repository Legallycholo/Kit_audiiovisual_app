//! Read-only home-folder index. No ambient path supplied by the renderer is opened.
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::fs::{Dir, OpenOptions};
use globset::{Glob, GlobSetBuilder};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const MAX_FILE: u64 = 20 * 1024 * 1024;
pub const MAX_TEXT: usize = 1_000_000;
pub const DEFAULT_EXCLUSIONS: &[&str] = &[
    "**/.*/**",
    "**/.*",
    "**/Library/**",
    "**/AppData/**",
    "**/node_modules/**",
    "**/target/**",
    "**/vendor/**",
    "**/Cache/**",
    "**/Caches/**",
    "**/Trash/**",
    "**/*.pem",
    "**/*.key",
    "**/*.p12",
    "**/*.pfx",
    "**/*credential*",
    "**/*password*",
    "**/*.vmdk",
    "**/*.vdi",
    "**/*.exe",
    "**/*.dll",
];
pub type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as i64
}
fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub granted: bool,
    pub exclusions: Vec<String>,
    pub paused: bool,
    pub cloud_consent: bool,
    #[serde(default)]
    pub ocr: bool,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub home: String,
    pub policy: Policy,
    pub running: bool,
    pub scanned: usize,
    pub indexed: i64,
    pub skipped: usize,
    pub failed: usize,
    pub last_scan: Option<i64>,
    pub errors: Vec<String>,
    pub exclusions: Vec<String>,
    pub ocr_available: bool,
    pub pending_deletions: i64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub title: String,
    pub relative_path: String,
    pub mime: String,
    pub modified: i64,
    pub bytes: i64,
    pub hash: String,
    pub text: String,
    pub excerpt: String,
    pub reason: String,
    pub score: f64,
    pub cloud_hash: String,
}
struct Inner {
    db: Connection,
    policy: Policy,
    epoch: u64,
    status: Status,
    watcher: Option<RecommendedWatcher>,
}
pub struct Index {
    inner: Mutex<Inner>,
    home: PathBuf,
    directory: Dir,
    namespace: String,
    requested: Arc<AtomicBool>,
    shutdown: AtomicBool,
}

pub fn blocked(relative: &Path, extra: &[String]) -> bool {
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return true;
    }
    let value = relative.to_string_lossy().replace('\\', "/").to_lowercase();
    if relative.components().any(|c| {
        matches!(
            c.as_os_str().to_string_lossy().to_lowercase().as_str(),
            "library"
                | "appdata"
                | "node_modules"
                | "target"
                | "vendor"
                | "cache"
                | "caches"
                | "trash"
        )
    }) {
        return true;
    }
    let mut rules = GlobSetBuilder::new();
    for pattern in DEFAULT_EXCLUSIONS
        .iter()
        .map(|s| s.to_string())
        .chain(extra.iter().cloned())
    {
        match Glob::new(&pattern.to_lowercase()) {
            Ok(g) => {
                rules.add(g);
            }
            Err(_) => return true,
        }
    }
    rules.build().map(|g| g.is_match(&value)).unwrap_or(true)
        || relative
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
}
fn validate_policy(policy: &Policy) -> Result<()> {
    if policy.exclusions.len() > 100 {
        return Err("Maximum 100 exclusions".into());
    }
    for p in &policy.exclusions {
        if p.len() > 500 {
            return Err("Exclusion too long".into());
        }
        Glob::new(p).map_err(err)?;
    }
    Ok(())
}

impl Index {
    pub fn open(home: PathBuf, db_path: &Path) -> Result<Arc<Self>> {
        // Credentials stay in the OS vault; no plaintext fallback is permitted.
        let account = hash(db_path.to_string_lossy().as_bytes());
        let vault = keyring::Entry::new("com.kit.production.file-index", &account).map_err(err)?;
        let key = match vault.get_password() {
            Ok(key) => key,
            Err(keyring::Error::NoEntry) if !db_path.exists() => {
                let mut random = [0u8; 32];
                rand::rngs::OsRng.fill_bytes(&mut random);
                let key = hex::encode(random);
                vault.set_password(&key).map_err(err)?;
                key
            }
            Err(e) => return Err(format!("Index key unavailable in OS credential store: {e}")),
        };
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        Self::with_key(home, db_path, &key)
    }
    pub fn with_key(home: PathBuf, db_path: &Path, key: &str) -> Result<Arc<Self>> {
        let db = Connection::open(db_path).map_err(err)?;
        db.pragma_update(None, "key", key).map_err(err)?;
        let cipher: String = db
            .query_row("PRAGMA cipher_version", [], |r| r.get(0))
            .map_err(err)?;
        if cipher.is_empty() {
            return Err("Encrypted SQLite is required".into());
        }
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA temp_store=MEMORY;
            CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, path TEXT UNIQUE, title TEXT, mime TEXT, modified INTEGER, bytes INTEGER, hash TEXT, text TEXT, seen INTEGER, cloud_hash TEXT NOT NULL DEFAULT '');
            CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED, title, path, text, tokenize='unicode61 remove_diacritics 2');
            CREATE TABLE IF NOT EXISTS deletions(id TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS audit(at INTEGER, action TEXT, count INTEGER);").map_err(err)?;
        let policy = db
            .query_row("SELECT value FROM settings WHERE id=1", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(err)?
            .map(|s| serde_json::from_str::<Policy>(&s))
            .transpose()
            .map_err(err)?
            .unwrap_or_default();
        let home = home.canonicalize().map_err(err)?;
        let directory = Dir::open_ambient_dir(&home, cap_std::ambient_authority()).map_err(err)?;
        let namespace = match db
            .query_row("SELECT value FROM settings WHERE id=2", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(err)?
        {
            Some(v) => v,
            None => {
                // Upgrade pre-device-namespace indexes without colliding on path.
                db.execute_batch("INSERT OR IGNORE INTO deletions SELECT id FROM files WHERE cloud_hash<>''; DELETE FROM search; DELETE FROM files;").map_err(err)?;
                let mut random = [0u8; 32];
                rand::rngs::OsRng.fill_bytes(&mut random);
                let v = hex::encode(random);
                db.execute("INSERT INTO settings VALUES(2,?1)", [&v])
                    .map_err(err)?;
                v
            }
        };
        Ok(Arc::new(Self {
            inner: Mutex::new(Inner {
                db,
                policy,
                epoch: 0,
                status: Status::default(),
                watcher: None,
            }),
            home,
            directory,
            namespace,
            requested: Arc::new(AtomicBool::new(false)),
            shutdown: AtomicBool::new(false),
        }))
    }
    pub fn status(&self) -> Result<Status> {
        let inner = self.inner.lock().map_err(err)?;
        let mut status = inner.status.clone();
        status.home = self.home.to_string_lossy().into();
        status.policy = inner.policy.clone();
        status.indexed = inner
            .db
            .query_row("SELECT count(*) FROM files", [], |r| r.get(0))
            .map_err(err)?;
        status.pending_deletions = inner
            .db
            .query_row("SELECT count(*) FROM deletions", [], |r| r.get(0))
            .map_err(err)?;
        status.ocr_available = ocr_engine().is_some();
        status.exclusions = DEFAULT_EXCLUSIONS.iter().map(|s| s.to_string()).collect();
        Ok(status)
    }
    pub fn set_policy(self: &Arc<Self>, policy: Policy) -> Result<()> {
        validate_policy(&policy)?;
        if policy.ocr && ocr_engine().is_none() {
            return Err("OCR engine not configured. Set KIT_TESSERACT_PATH to a trusted absolute executable path.".into());
        }
        let mut inner = self.inner.lock().map_err(err)?;
        inner.epoch += 1;
        inner.watcher = None;
        // Stop new reads and mark all remote copies for deletion before clearing local data.
        if !policy.granted
            || policy.exclusions != inner.policy.exclusions
            || policy.ocr != inner.policy.ocr
        {
            inner.db.execute_batch("INSERT OR IGNORE INTO deletions SELECT id FROM files WHERE cloud_hash <> ''; DELETE FROM search; DELETE FROM files;").map_err(err)?;
        } else if !policy.cloud_consent {
            inner.db.execute_batch("INSERT OR IGNORE INTO deletions SELECT id FROM files WHERE cloud_hash <> ''; UPDATE files SET cloud_hash='';").map_err(err)?;
        }
        inner
            .db
            .execute(
                "INSERT OR REPLACE INTO settings VALUES(1,?1)",
                [serde_json::to_string(&policy).map_err(err)?],
            )
            .map_err(err)?;
        inner
            .db
            .execute(
                "INSERT INTO audit VALUES(?1,?2,0)",
                params![
                    now(),
                    if policy.granted {
                        "permission-updated"
                    } else {
                        "permission-revoked"
                    }
                ],
            )
            .map_err(err)?;
        inner.policy = policy;
        if !inner.policy.granted {
            inner
                .db
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(err)?;
        }
        if inner.policy.granted && !inner.policy.paused {
            let requested = self.requested.clone();
            let home = self.home.clone();
            let exclusions = inner.policy.exclusions.clone();
            let mut watcher =
                notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                    if let Ok(event) = event {
                        if !matches!(event.kind, notify::EventKind::Access(_))
                            && event.paths.iter().any(|p| {
                                p.strip_prefix(&home)
                                    .map(|p| !blocked(p, &exclusions))
                                    .unwrap_or(false)
                            })
                        {
                            requested.store(true, Ordering::Release);
                        }
                    }
                })
                .map_err(err)?;
            // OS event metadata only. File contents are always read through the capability boundary.
            match watcher.watch(&self.home, RecursiveMode::Recursive) {
                Ok(()) => inner.watcher = Some(watcher),
                Err(e) => inner
                    .status
                    .errors
                    .push(format!("Watcher unavailable; use Scan: {e}")),
            }
            self.requested.store(true, Ordering::Release);
        }
        Ok(())
    }
    pub fn request_scan(&self) {
        self.requested.store(true, Ordering::Release);
    }
    pub fn start(self: &Arc<Self>) {
        let weak = Arc::downgrade(self);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(2));
            let Some(index) = weak.upgrade() else {
                break;
            };
            if index.shutdown.load(Ordering::Acquire) {
                break;
            }
            if index.requested.swap(false, Ordering::AcqRel) {
                if let Err(e) = index.scan() {
                    if let Ok(mut i) = index.inner.lock() {
                        i.status.running = false;
                        i.status.errors.push(e);
                    }
                }
            }
        });
    }
    fn checked_read(&self, relative: &Path, policy: &Policy) -> Result<Vec<u8>> {
        if !policy.granted || blocked(relative, &policy.exclusions) {
            return Err("Access revoked or path excluded".into());
        }
        let mut dir = self.directory.try_clone().map_err(err)?;
        let parts: Vec<_> = relative.components().collect();
        for part in &parts[..parts.len().saturating_sub(1)] {
            dir = dir.open_dir_nofollow(part.as_os_str()).map_err(err)?;
        }
        let name = parts.last().ok_or("Empty path")?.as_os_str();
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No);
        let file = dir.open_with(name, &options).map_err(err)?;
        let metadata = file.metadata().map_err(err)?;
        if !metadata.is_file() || metadata.len() > MAX_FILE {
            return Err("Unsupported file or size exceeds 20 MB".into());
        }
        let mut bytes = Vec::new();
        file.take(MAX_FILE + 1)
            .read_to_end(&mut bytes)
            .map_err(err)?;
        if bytes.len() as u64 > MAX_FILE {
            return Err("File grew past limit".into());
        }
        Ok(bytes)
    }
    pub fn scan(&self) -> Result<()> {
        let (epoch, policy) = {
            let mut i = self.inner.lock().map_err(err)?;
            if !i.policy.granted || i.policy.paused || i.status.running {
                return Ok(());
            }
            i.status.running = true;
            i.status.scanned = 0;
            i.status.failed = 0;
            i.status.skipped = 0;
            i.status.errors.clear();
            (i.epoch, i.policy.clone())
        };
        let stamp = now();
        let mut queue = vec![PathBuf::new()];
        let mut count = 0;
        while let Some(folder) = queue.pop() {
            {
                let i = self.inner.lock().map_err(err)?;
                if i.epoch != epoch {
                    break;
                }
            }
            let dir = self.safe_directory(&folder);
            let entries = match dir.and_then(|d| d.entries().map_err(err)) {
                Ok(e) => e,
                Err(e) => {
                    self.failure(&folder, &e);
                    continue;
                }
            };
            for entry in entries {
                {
                    let i = self.inner.lock().map_err(err)?;
                    if i.epoch != epoch {
                        break;
                    }
                }
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                let relative = folder.join(entry.file_name());
                if blocked(&relative, &policy.exclusions) {
                    continue;
                }
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(e) => {
                        self.failure(&relative, &e.to_string());
                        continue;
                    }
                };
                if meta.is_symlink() {
                    continue;
                }
                if meta.is_dir() {
                    if relative.components().count() < 30 {
                        queue.push(relative);
                    }
                    continue;
                }
                count += 1;
                if count > 100_000 {
                    self.failure(
                        &relative,
                        "100,000 file scan limit reached; narrow exclusions",
                    );
                    break;
                }
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.into_std().duration_since(UNIX_EPOCH).ok())
                    .unwrap_or_default()
                    .as_micros() as i64;
                let path = relative.to_string_lossy().replace('\\', "/");
                let id = hash(format!("{}:{path}", self.namespace).as_bytes());
                let bytes = {
                    let mut i = self.inner.lock().map_err(err)?;
                    if i.epoch != epoch {
                        break;
                    }
                    i.status.scanned += 1;
                    if !supported(&relative) || meta.len() > MAX_FILE {
                        i.status.skipped += 1;
                        continue;
                    }
                    match self.checked_read(&relative, &i.policy) {
                        Ok(b) => b,
                        Err(e) => {
                            i.status.failed += 1;
                            if i.status.errors.len() < 30 {
                                i.status.errors.push(format!("{path}: {e}"));
                            }
                            continue;
                        }
                    }
                };
                let content_hash = hash(&bytes);
                {
                    let i = self.inner.lock().map_err(err)?;
                    let unchanged: bool =
                        i.db.query_row(
                            "SELECT count(*) > 0 FROM files WHERE id=?1 AND hash=?2",
                            params![id, content_hash],
                            |r| r.get(0),
                        )
                        .map_err(err)?;
                    if unchanged {
                        i.db.execute("UPDATE files SET seen=?2 WHERE id=?1", params![id, stamp])
                            .map_err(err)?;
                        continue;
                    }
                    i.db.execute("INSERT OR IGNORE INTO deletions SELECT id FROM files WHERE id=?1 AND cloud_hash<>''",[&id]).map_err(err)?;
                    i.db.execute("UPDATE files SET cloud_hash='' WHERE id=?1", [&id])
                        .map_err(err)?;
                }
                let parsed = isolated_extract(&relative, &bytes).and_then(|(mime, text)| {
                    if policy.ocr && mime.starts_with("image/") {
                        Ok((mime, ocr_text(&bytes)?))
                    } else {
                        Ok((mime, text))
                    }
                });
                let mut i = self.inner.lock().map_err(err)?;
                if i.epoch != epoch {
                    break;
                }
                match parsed {
                    Ok((mime, text)) => {
                        let title = relative
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let tx = i.db.transaction().map_err(err)?;
                        tx.execute("INSERT INTO files(id,path,title,mime,modified,bytes,hash,text,seen) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET path=excluded.path,title=excluded.title,mime=excluded.mime,modified=excluded.modified,bytes=excluded.bytes,hash=excluded.hash,text=excluded.text,seen=excluded.seen", params![id,path,title,mime,modified,meta.len() as i64,content_hash,text,stamp]).map_err(err)?;
                        tx.execute("DELETE FROM search WHERE id=?1", [&id])
                            .map_err(err)?;
                        tx.execute(
                            "INSERT INTO search VALUES(?1,?2,?3,?4)",
                            params![id, title, path, text],
                        )
                        .map_err(err)?;
                        tx.commit().map_err(err)?;
                    }
                    Err(e) => {
                        i.status.failed += 1;
                        if i.status.errors.len() < 30 {
                            i.status.errors.push(format!("{path}: {e}"));
                        }
                    }
                }
                drop(i);
                std::thread::sleep(Duration::from_millis(2));
            }
            if count > 100_000 {
                break;
            }
        }
        let mut i = self.inner.lock().map_err(err)?;
        i.status.running = false;
        if i.epoch == epoch && count <= 100_000 {
            i.db.execute("INSERT OR IGNORE INTO deletions SELECT id FROM files WHERE seen<>?1 AND cloud_hash<>''", [stamp]).map_err(err)?;
            i.db.execute(
                "DELETE FROM search WHERE id IN (SELECT id FROM files WHERE seen<>?1)",
                [stamp],
            )
            .map_err(err)?;
            i.db.execute("DELETE FROM files WHERE seen<>?1", [stamp])
                .map_err(err)?;
        }
        if i.epoch == epoch {
            i.status.last_scan = Some(stamp);
        }
        Ok(())
    }
    fn safe_directory(&self, relative: &Path) -> Result<Dir> {
        let mut dir = self.directory.try_clone().map_err(err)?;
        for component in relative.components() {
            if !matches!(component, Component::Normal(_)) {
                return Err("Unsafe directory".into());
            }
            dir = dir.open_dir_nofollow(component.as_os_str()).map_err(err)?;
        }
        Ok(dir)
    }
    fn failure(&self, path: &Path, message: &str) {
        if let Ok(mut i) = self.inner.lock() {
            i.status.failed += 1;
            if i.status.errors.len() < 30 {
                i.status
                    .errors
                    .push(format!("{}: {}", path.display(), message));
            }
        }
    }
    pub fn search(&self, query: &str) -> Result<Vec<FileRecord>> {
        let i = self.inner.lock().map_err(err)?;
        if !i.policy.granted {
            return Ok(vec![]);
        }
        let tokens: Vec<_> = query
            .split_whitespace()
            .take(12)
            .map(|t| format!("\"{}\"*", t.replace('"', "")))
            .collect();
        if tokens.is_empty() {
            return Ok(vec![]);
        }
        let mut stmt = i.db.prepare("SELECT f.id,f.title,f.path,f.mime,f.modified,f.bytes,f.hash,'',f.cloud_hash,bm25(search,0,8,4,1),snippet(search,3,'','',' … ',40) FROM search JOIN files f ON f.id=search.id WHERE search MATCH ?1 ORDER BY bm25(search,0,8,4,1) LIMIT 100").map_err(err)?;
        let records = stmt
            .query_map([tokens.join(" AND ")], |r| {
                Ok(FileRecord {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    relative_path: r.get(2)?,
                    mime: r.get(3)?,
                    modified: r.get(4)?,
                    bytes: r.get(5)?,
                    hash: r.get(6)?,
                    text: r.get(7)?,
                    cloud_hash: r.get(8)?,
                    score: -r.get::<_, f64>(9)?,
                    reason: "Texto o nombre local".into(),
                    excerpt: r.get(10)?,
                })
            })
            .map_err(err)?;
        let candidates = records
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        drop(stmt);
        drop(i);
        let mut out = vec![];
        let mut checked_bytes = 0i64;
        for mut record in candidates {
            let i = self.inner.lock().map_err(err)?;
            if !i.policy.granted {
                return Ok(vec![]);
            }
            checked_bytes += record.bytes;
            if checked_bytes > 50 * 1024 * 1024 {
                break;
            }
            if blocked(Path::new(&record.relative_path), &i.policy.exclusions) {
                continue;
            }
            // Recheck live access: a stale index never grants access to a removed source.
            if !self
                .checked_read(Path::new(&record.relative_path), &i.policy)
                .map(|b| hash(&b) == record.hash)
                .unwrap_or(false)
            {
                continue;
            }
            record.excerpt = record.excerpt.chars().take(500).collect();
            record.text.clear();
            out.push(record);
        }
        Ok(out)
    }
    pub fn preview(&self, id: &str) -> Result<FileRecord> {
        let i = self.inner.lock().map_err(err)?;
        let mut r = record(&i.db, id)?;
        let bytes = self.checked_read(Path::new(&r.relative_path), &i.policy)?;
        if hash(&bytes) != r.hash {
            return Err("File changed since indexing. Scan again before opening.".into());
        }
        r.text = r.text.chars().take(100_000).collect();
        Ok(r)
    }
    pub fn image_preview(&self, id: &str) -> Result<String> {
        use base64::Engine;
        let i = self.inner.lock().map_err(err)?;
        let r = record(&i.db, id)?;
        if !r.mime.starts_with("image/") {
            return Err("Not an image".into());
        }
        let bytes = self.checked_read(Path::new(&r.relative_path), &i.policy)?;
        if hash(&bytes) != r.hash {
            return Err("Image changed; rescan".into());
        }
        Ok(format!(
            "data:{};base64,{}",
            r.mime,
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    }
    pub fn open_path(&self, id: &str) -> Result<PathBuf> {
        let r = self.preview(id)?;
        Ok(self.home.join(r.relative_path))
    }
    pub fn cloud_batch(&self) -> Result<Vec<FileRecord>> {
        let i = self.inner.lock().map_err(err)?;
        if !i.policy.granted || !i.policy.cloud_consent || i.policy.paused {
            return Ok(vec![]);
        }
        let mut stmt =
            i.db.prepare("SELECT id FROM files WHERE hash<>cloud_hash LIMIT 20")
                .map_err(err)?;
        let ids: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        let mut out = vec![];
        for id in ids {
            let r = record(&i.db, &id)?;
            let bytes = self.checked_read(Path::new(&r.relative_path), &i.policy)?;
            if hash(&bytes) == r.hash {
                out.push(r);
            }
        }
        Ok(out)
    }
    pub fn mark_uploaded(&self, id: &str, content_hash: &str) -> Result<()> {
        let i = self.inner.lock().map_err(err)?;
        let live = record(&i.db, id)
            .ok()
            .and_then(|r| {
                self.checked_read(Path::new(&r.relative_path), &i.policy)
                    .ok()
            })
            .map(|b| hash(&b) == content_hash)
            .unwrap_or(false);
        if !i.policy.granted || !i.policy.cloud_consent || !live {
            i.db.execute("INSERT OR IGNORE INTO deletions VALUES(?1)", [id])
                .map_err(err)?;
        } else {
            let updated =
                i.db.execute(
                    "UPDATE files SET cloud_hash=?2 WHERE id=?1 AND hash=?2",
                    params![id, content_hash],
                )
                .map_err(err)?;
            if updated == 0 {
                i.db.execute("INSERT OR IGNORE INTO deletions VALUES(?1)", [id])
                    .map_err(err)?;
            }
        }
        Ok(())
    }
    pub fn pending_upload(&self, id: &str) -> Result<()> {
        self.inner
            .lock()
            .map_err(err)?
            .db
            .execute("INSERT OR IGNORE INTO deletions VALUES(?1)", [id])
            .map_err(err)?;
        Ok(())
    }
    pub fn deletions(&self) -> Result<Vec<String>> {
        let i = self.inner.lock().map_err(err)?;
        let mut s = i.db.prepare("SELECT id FROM deletions").map_err(err)?;
        let result = s
            .query_map([], |r| r.get(0))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        Ok(result)
    }
    pub fn deleted(&self, id: &str) -> Result<()> {
        self.inner
            .lock()
            .map_err(err)?
            .db
            .execute("DELETE FROM deletions WHERE id=?1", [id])
            .map_err(err)?;
        Ok(())
    }
}
fn record(db: &Connection, id: &str) -> Result<FileRecord> {
    db.query_row(
        "SELECT id,title,path,mime,modified,bytes,hash,text,cloud_hash FROM files WHERE id=?1",
        [id],
        |r| {
            Ok(FileRecord {
                id: r.get(0)?,
                title: r.get(1)?,
                relative_path: r.get(2)?,
                mime: r.get(3)?,
                modified: r.get(4)?,
                bytes: r.get(5)?,
                hash: r.get(6)?,
                text: r.get(7)?,
                cloud_hash: r.get(8)?,
                excerpt: String::new(),
                reason: String::new(),
                score: 0.0,
            })
        },
    )
    .map_err(err)
}
pub fn supported(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str(),
        "txt" | "md" | "csv" | "pdf" | "docx" | "pptx" | "xlsx" | "png" | "jpg" | "jpeg" | "webp"
    )
}

// Rich parsers run outside the GUI process. Input and output are bounded; a hung
// parser is killed. This is crash isolation, not a complete OS security sandbox.
fn bounded_process(mut command: std::process::Command, bytes: &[u8]) -> Result<Vec<u8>> {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(err)?;
    let mut input = child.stdin.take().ok_or("Parser input unavailable")?;
    let output = child.stdout.take().ok_or("Parser output unavailable")?;
    let data = bytes.to_vec();
    let writer = std::thread::spawn(move || input.write_all(&data));
    let reader = std::thread::spawn(move || {
        let mut b = Vec::new();
        output.take(8_000_001).read_to_end(&mut b).map(|_| b)
    });
    let deadline = std::time::Instant::now() + Duration::from_secs(15);
    let status = loop {
        if let Some(status) = child.try_wait().map_err(err)? {
            break status;
        }
        if std::time::Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Parser timed out after 15 seconds".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    writer
        .join()
        .map_err(|_| "Parser input failed")?
        .map_err(err)?;
    let output = reader
        .join()
        .map_err(|_| "Parser output failed")?
        .map_err(err)?;
    if !status.success() || output.len() > 8_000_000 {
        return Err("Parser failed or output limit exceeded".into());
    }
    Ok(output)
}
#[cfg(not(test))]
fn isolated_extract(path: &Path, bytes: &[u8]) -> Result<(String, String)> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or("Missing extension")?;
    if matches!(extension.to_lowercase().as_str(), "txt" | "md" | "csv") {
        return extract(path, bytes);
    }
    let mut command = std::process::Command::new(std::env::current_exe().map_err(err)?);
    command.args(["--kit-extract", extension]);
    serde_json::from_slice::<Result<(String, String)>>(&bounded_process(command, bytes)?)
        .map_err(err)?
}
#[cfg(test)]
fn isolated_extract(path: &Path, bytes: &[u8]) -> Result<(String, String)> {
    extract(path, bytes)
}
fn ocr_engine() -> Option<PathBuf> {
    let path = PathBuf::from(std::env::var_os("KIT_TESSERACT_PATH")?);
    if path.is_absolute() && path.is_file() {
        Some(path)
    } else {
        None
    }
}
fn ocr_text(bytes: &[u8]) -> Result<String> {
    let path = ocr_engine().ok_or("OCR unavailable")?;
    let mut command = std::process::Command::new(path);
    command.args(["stdin", "stdout", "-l", "eng+spa", "--psm", "3"]);
    let text = String::from_utf8(bounded_process(command, bytes)?).map_err(err)?;
    Ok(text.chars().take(MAX_TEXT).collect())
}

/// Called before initializing Tauri. Never receives an ambient source path.
pub fn extractor_main() -> bool {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("--kit-extract") {
        return false;
    }
    let result = (|| {
        let extension = args.get(2).ok_or("Missing parser type")?;
        if !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err("Invalid parser type".into());
        }
        let mut bytes = Vec::new();
        std::io::stdin()
            .take(MAX_FILE + 1)
            .read_to_end(&mut bytes)
            .map_err(err)?;
        if bytes.len() as u64 > MAX_FILE {
            return Err("Input too large".into());
        }
        extract(Path::new(&format!("input.{extension}")), &bytes)
    })();
    if let Ok(json) = serde_json::to_string(&result) {
        println!("{json}");
    }
    true
}
pub fn extract(path: &Path, bytes: &[u8]) -> Result<(String, String)> {
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let (mime, text) = match extension.as_str() {
        "txt" | "md" | "csv" => {
            let text = std::str::from_utf8(bytes).map_err(|_| "Only UTF-8 text is supported")?;
            if text.contains('\0') {
                return Err("Binary content rejected".into());
            }
            ("text/plain", text.to_string())
        }
        "pdf" => {
            if !bytes.starts_with(b"%PDF-") {
                return Err("PDF signature mismatch".into());
            }
            (
                "application/pdf",
                pdf_extract::extract_text_from_mem(bytes).map_err(err)?,
            )
        }
        "docx" | "pptx" | "xlsx" => {
            let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(err)?;
            if archive.len() > 5000 {
                return Err("Archive entry limit exceeded".into());
            }
            let mut text = String::new();
            let mut total = 0u64;
            for n in 0..archive.len() {
                let file = archive.by_index(n).map_err(err)?;
                let name = file.name().to_string();
                let wanted = match extension.as_str() {
                    "docx" => name == "word/document.xml",
                    "pptx" => name.starts_with("ppt/slides/slide") && name.ends_with(".xml"),
                    _ => {
                        name == "xl/sharedStrings.xml"
                            || name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml")
                    }
                };
                if !wanted {
                    continue;
                }
                total += file.size();
                if total > 8_000_000 {
                    return Err("Expanded document exceeds 8 MB".into());
                }
                let mut xml = String::new();
                file.take(8_000_001).read_to_string(&mut xml).map_err(err)?;
                let mut reader = quick_xml::Reader::from_str(&xml);
                reader.config_mut().trim_text(true);
                loop {
                    match reader.read_event().map_err(err)? {
                        quick_xml::events::Event::Text(t) => {
                            text.push_str(&t.decode().map_err(err)?);
                            text.push(' ');
                        }
                        quick_xml::events::Event::DocType(_) => {
                            return Err("Document type declarations are not allowed".into())
                        }
                        quick_xml::events::Event::Eof => break,
                        _ => {}
                    }
                }
                if text.len() > MAX_TEXT {
                    break;
                }
            }
            ("application/vnd.openxmlformats-officedocument", text)
        }
        "png" | "jpg" | "jpeg" | "webp" => {
            let reader = image::ImageReader::new(std::io::Cursor::new(bytes))
                .with_guessed_format()
                .map_err(err)?;
            let format = reader.format().ok_or("Unknown image signature")?;
            let expected = match extension.as_str() {
                "png" => image::ImageFormat::Png,
                "webp" => image::ImageFormat::WebP,
                _ => image::ImageFormat::Jpeg,
            };
            if format != expected {
                return Err("Image signature mismatch".into());
            }
            let (w, h) = reader.into_dimensions().map_err(err)?;
            if u64::from(w) * u64::from(h) > 40_000_000 {
                return Err("Image exceeds 40 megapixels".into());
            }
            (
                match format {
                    image::ImageFormat::Png => "image/png",
                    image::ImageFormat::WebP => "image/webp",
                    _ => "image/jpeg",
                },
                String::new(),
            )
        }
        _ => return Err("Unsupported type".into()),
    };
    Ok((mime.into(), text.chars().take(MAX_TEXT).collect()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Arc<Index>) {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        std::fs::create_dir(&home).unwrap();
        let index =
            Index::with_key(home, &temp.path().join("index.db"), "test-only-secret").unwrap();
        (temp, index)
    }
    #[test]
    fn grant_search_revoke_and_cipher() {
        let (t, i) = fixture();
        std::fs::write(i.home.join("proposal.txt"), "Rolando audio proposal").unwrap();
        i.scan().unwrap();
        assert!(i.search("Rolando").unwrap().is_empty());
        i.set_policy(Policy {
            granted: true,
            ..Default::default()
        })
        .unwrap();
        i.scan().unwrap();
        let found = i.search("Rolando").unwrap();
        assert_eq!(found.len(), 1);
        assert!(!std::fs::read(t.path().join("index.db"))
            .unwrap()
            .starts_with(b"SQLite format"));
        i.set_policy(Policy::default()).unwrap();
        assert!(i.preview(&found[0].id).is_err());
        assert!(i.search("Rolando").unwrap().is_empty());
    }
    #[test]
    fn exclusions_and_literals() {
        assert!(blocked(Path::new(".ssh/key.txt"), &[]));
        assert!(blocked(Path::new("Documents/.env"), &[]));
        assert!(blocked(Path::new("../secret.txt"), &[]));
        assert!(blocked(Path::new("Library/test.txt"), &[]));
        assert!(blocked(
            Path::new("Documents/payroll.csv"),
            &["Documents/payroll*".into()]
        ));
        assert!(!blocked(Path::new("Documents/Rolando.txt"), &[]));
    }
    #[test]
    fn changed_file_not_previewed() {
        let (_temp, i) = fixture();
        std::fs::write(i.home.join("file.txt"), "Rolando").unwrap();
        i.set_policy(Policy {
            granted: true,
            ..Default::default()
        })
        .unwrap();
        i.scan().unwrap();
        let id = i.search("Rolando").unwrap()[0].id.clone();
        std::fs::write(i.home.join("file.txt"), "different").unwrap();
        assert!(i.preview(&id).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn links_cannot_escape_scope() {
        let (t, i) = fixture();
        std::fs::write(t.path().join("secret.txt"), "Rolando").unwrap();
        std::os::unix::fs::symlink(t.path().join("secret.txt"), i.home.join("link.txt")).unwrap();
        i.set_policy(Policy {
            granted: true,
            ..Default::default()
        })
        .unwrap();
        i.scan().unwrap();
        assert!(i.search("Rolando").unwrap().is_empty());
    }
    #[test]
    fn signatures_and_binary_content() {
        assert!(extract(Path::new("fake.pdf"), b"not a pdf").is_err());
        assert!(extract(Path::new("binary.txt"), b"a\0b").is_err());
        assert!(extract(Path::new("fake.png"), b"script").is_err());
    }
    #[test]
    fn cloud_consent_and_deletion_survive_revoke() {
        let (_temp, i) = fixture();
        std::fs::write(i.home.join("file.txt"), "Rolando").unwrap();
        i.set_policy(Policy {
            granted: true,
            ..Default::default()
        })
        .unwrap();
        i.scan().unwrap();
        assert!(i.cloud_batch().unwrap().is_empty());
        i.set_policy(Policy {
            granted: true,
            cloud_consent: true,
            ..Default::default()
        })
        .unwrap();
        let batch = i.cloud_batch().unwrap();
        assert_eq!(batch.len(), 1);
        i.pending_upload(&batch[0].id).unwrap();
        i.mark_uploaded(&batch[0].id, &batch[0].hash).unwrap();
        i.set_policy(Policy::default()).unwrap();
        assert!(i.cloud_batch().unwrap().is_empty());
        assert_eq!(i.deletions().unwrap(), vec![batch[0].id.clone()]);
    }
    #[test]
    fn same_size_edits_and_deletion_are_reconciled() {
        let (_temp, i) = fixture();
        let p = i.home.join("file.txt");
        std::fs::write(&p, "Rolando").unwrap();
        i.set_policy(Policy {
            granted: true,
            ..Default::default()
        })
        .unwrap();
        i.scan().unwrap();
        std::fs::write(&p, "changed").unwrap();
        i.scan().unwrap();
        assert!(i.search("Rolando").unwrap().is_empty());
        assert_eq!(i.search("changed").unwrap().len(), 1);
        std::fs::remove_file(p).unwrap();
        i.scan().unwrap();
        assert_eq!(i.status().unwrap().indexed, 0);
    }
    #[test]
    fn office_xml_is_extracted_but_dtd_is_rejected() {
        use std::io::Write;
        for (xml, valid) in [
            ("<document><p>Rolando proposal</p></document>", true),
            ("<!DOCTYPE foo><document>Rolando</document>", false),
        ] {
            let mut archive = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
            archive
                .start_file(
                    "word/document.xml",
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
            archive.write_all(xml.as_bytes()).unwrap();
            let bytes = archive.finish().unwrap().into_inner();
            let result = extract(Path::new("proposal.docx"), &bytes);
            assert_eq!(result.is_ok(), valid);
            if valid {
                assert!(result.unwrap().1.contains("Rolando"));
            }
        }
    }
    #[test]
    fn database_requires_correct_key() {
        let (t, i) = fixture();
        let path = t.path().join("index.db");
        assert!(Index::with_key(i.home.clone(), &path, "wrong-key").is_err());
        assert!(Index::with_key(i.home.clone(), &path, "test-only-secret").is_ok());
    }
}
