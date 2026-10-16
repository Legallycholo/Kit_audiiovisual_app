use kit_file_index::{FileRecord, Index, Policy, Status};
use std::sync::{Arc, Mutex};
use tauri::Manager;
pub struct Files(pub Mutex<Option<Arc<Index>>>);
pub struct Cloud(pub tauri::async_runtime::Mutex<()>);
// Retry only deletion, never upload, without another user action. No index or
// vault is opened on startup until the user has entered file management.
pub async fn reconcile(app: tauri::AppHandle) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let index = {
            let state = app.state::<Files>();
            state.0.lock().ok().and_then(|slot| slot.clone())
        };
        let Some(index) = index else {
            continue;
        };
        let cloud = app.state::<Cloud>();
        let _guard = cloud.0.lock().await;
        let Ok(status) = index.status() else {
            continue;
        };
        let delete_all = credential("deletion-all").as_deref() == Ok("pending");
        if status.pending_deletions == 0 && !delete_all {
            continue;
        }
        let Ok(token) = credential("device") else {
            continue;
        };
        if delete_all {
            if let Ok(result) = gateway(reqwest::Method::DELETE, "sources", None, &token).await {
                if result["confirmed"] == true {
                    if let Ok(ids) = index.deletions() {
                        for id in ids {
                            let _ = index.deleted(&id);
                        }
                    }
                    if let Ok(entry) = vault("deletion-all") {
                        let _ = entry.delete_credential();
                    }
                    if let Ok(entry) = vault("device") {
                        let _ = entry.delete_credential();
                    }
                }
            }
        } else if let Ok(ids) = index.deletions() {
            for id in ids {
                if let Ok(result) = gateway(
                    reqwest::Method::DELETE,
                    &format!("sources/{id}"),
                    None,
                    &token,
                )
                .await
                {
                    if result["confirmed"] == true {
                        let _ = index.deleted(&id);
                    }
                }
            }
        }
    }
}
fn vault(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.kit.production.cloud-search", name).map_err(|e| e.to_string())
}
fn credential(name: &str) -> Result<String, String> {
    vault(name)?
        .get_password()
        .map_err(|_| "Connect a company search device first".into())
}
async fn gateway(
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
    token: &str,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client
        .request(
            method,
            format!("http://127.0.0.1:3001/api/search/device/{path}"),
        )
        .bearer_auth(token);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "Company service unavailable. Start the server on port 3001.")?;
    if !response.status().is_success() {
        return Err(format!(
            "Company search returned {}. Review connection, provider policy, or budget.",
            response.status()
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Invalid company response")?
    {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("Company response too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid company search response".into())
}
fn index(app: &tauri::AppHandle, state: &Files) -> Result<Arc<Index>, String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(i) = slot.as_ref() {
        return Ok(i.clone());
    }
    let i = Index::open(
        app.path().home_dir().map_err(|e| e.to_string())?,
        &app.path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("files.db"),
    )?;
    let policy = i.status()?.policy;
    if policy.granted {
        i.set_policy(policy)?;
    }
    i.start();
    *slot = Some(i.clone());
    Ok(i)
}
// Defense in depth in addition to the main-only capability manifest.
fn local(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Native files are available only in the local desktop window".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn file_status(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
) -> Result<Status, String> {
    local(&window)?;
    index(&app, &state)?.status()
}
#[tauri::command]
pub async fn file_policy(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    cloud: tauri::State<'_, Cloud>,
    mut policy: Policy,
    confirmed: bool,
) -> Result<Status, String> {
    let _guard = cloud.0.lock().await;
    local(&window)?;
    let i = index(&app, &state)?;
    let old = i.status()?.policy;
    if policy.granted && !old.granted && !confirmed {
        return Err("Read-only home access requires explicit confirmation".into());
    }
    // Cloud consent is separate from local folder consent.
    let changed = !policy.granted || policy.exclusions != old.exclusions || policy.ocr != old.ocr;
    policy.cloud_consent = old.cloud_consent && !changed;
    i.set_policy(policy)?;
    if changed {
        let _ = vault("policy")?.delete_credential();
        if let Ok(token) = credential("device") {
            for id in i.deletions()?.into_iter().take(20) {
                let result = gateway(
                    reqwest::Method::DELETE,
                    &format!("sources/{id}"),
                    None,
                    &token,
                )
                .await
                .map_err(|e| format!("Local policy saved. Cloud deletion needs retry: {e}"))?;
                if result["confirmed"] == true {
                    i.deleted(&id)?;
                }
            }
        }
    }
    i.status()
}
#[tauri::command]
pub async fn file_scan(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    cloud: tauri::State<'_, Cloud>,
    rebuild: bool,
) -> Result<(), String> {
    let _guard = cloud.0.lock().await;
    local(&window)?;
    let i = index(&app, &state)?;
    if rebuild {
        let policy = i.status()?.policy;
        i.set_policy(Policy::default())?;
        i.set_policy(policy)?;
    }
    i.request_scan();
    Ok(())
}
#[tauri::command]
pub async fn file_search(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    query: String,
) -> Result<Vec<FileRecord>, String> {
    local(&window)?;
    if query.len() > 1200 {
        return Err("Query too long".into());
    }
    let i = index(&app, &state)?;
    tauri::async_runtime::spawn_blocking(move || i.search(&query))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn file_preview(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    id: String,
) -> Result<FileRecord, String> {
    local(&window)?;
    let i = index(&app, &state)?;
    tauri::async_runtime::spawn_blocking(move || i.preview(&id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn file_image(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    id: String,
) -> Result<String, String> {
    local(&window)?;
    let i = index(&app, &state)?;
    tauri::async_runtime::spawn_blocking(move || i.image_preview(&id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn file_open(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    id: String,
    confirmed: bool,
) -> Result<(), String> {
    local(&window)?;
    if !confirmed {
        return Err("Confirm opening in an external application".into());
    }
    let path = index(&app, &state)?.open_path(&id)?;
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cloud_search(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Files>,
    cloud: tauri::State<'_, Cloud>,
    action: String,
    token: Option<String>,
    fingerprint: Option<String>,
    query: Option<String>,
) -> Result<serde_json::Value, String> {
    local(&window)?;
    let _guard = cloud.0.lock().await;
    let i = index(&app, &state)?;
    if action == "connect" {
        let token = token.ok_or("Device token required")?;
        if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Invalid device token".into());
        }
        let status = gateway(reqwest::Method::GET, "status", None, &token).await?;
        let account = format!(
            "{}:{}",
            status["account"]["tenant"]
                .as_str()
                .ok_or("Missing company identity")?,
            status["account"]["id"]
                .as_str()
                .ok_or("Missing account identity")?
        );
        if credential("device").is_ok() && credential("account").as_deref() != Ok(account.as_str())
        {
            return Err("Disconnect the existing device before connecting another account".into());
        }
        vault("account")?
            .set_password(&account)
            .map_err(|e| e.to_string())?;
        vault("device")?
            .set_password(&token)
            .map_err(|e| e.to_string())?;
        return Ok(status);
    }
    if action == "records" {
        let Ok(token) = credential("device") else {
            return Ok(serde_json::json!({"connected":false,"results":[]}));
        };
        return gateway(
            reqwest::Method::POST,
            "records",
            Some(serde_json::json!({"query":query.ok_or("Query required")?})),
            &token,
        )
        .await;
    }
    if action == "query" && !i.status()?.policy.cloud_consent {
        return Ok(serde_json::json!({"configured":false,"results":[]}));
    }
    let token = credential("device")?;
    if action == "disconnect" {
        vault("deletion-all")?
            .set_password("pending")
            .map_err(|e| e.to_string())?;
        let mut policy = i.status()?.policy;
        policy.cloud_consent = false;
        i.set_policy(policy)?;
        let _ = vault("policy")?.delete_credential();
        let result = gateway(reqwest::Method::DELETE, "sources", None, &token).await?;
        if result["confirmed"] == true {
            let _ = vault("deletion-all")?.delete_credential();
            for id in i.deletions()? {
                i.deleted(&id)?;
            }
            vault("device")?
                .delete_credential()
                .map_err(|e| e.to_string())?;
        }
        return Ok(result);
    }
    let status = gateway(reqwest::Method::GET, "status", None, &token).await?;
    if action == "status" {
        return Ok(status);
    }
    let current = status["policy"]["fingerprint"]
        .as_str()
        .ok_or("Missing provider policy")?;
    if action == "approve" {
        if credential("deletion-all").as_deref() == Ok("pending") {
            return Err("Wait for requested cloud deletion before reconnecting".into());
        }
        if status["policy"]["configured"] != true || fingerprint.as_deref() != Some(current) {
            return Err("Review a configured provider policy first".into());
        }
        let mut policy = i.status()?.policy;
        if !policy.granted {
            return Err("Grant local access first".into());
        }
        vault("policy")?
            .set_password(current)
            .map_err(|e| e.to_string())?;
        policy.cloud_consent = true;
        i.set_policy(policy)?;
        return Ok(status);
    }
    if credential("policy")? != current {
        return Err(
            "Provider policy changed. Review and approve it again before uploading or querying."
                .into(),
        );
    }
    if action == "query" {
        let query = query.ok_or("Query required")?;
        return gateway(
            reqwest::Method::POST,
            "query",
            Some(serde_json::json!({"query":query})),
            &token,
        )
        .await;
    }
    if action != "sync" {
        return Err("Unknown cloud operation".into());
    }
    for id in i.deletions()? {
        let result = gateway(
            reqwest::Method::DELETE,
            &format!("sources/{id}"),
            None,
            &token,
        )
        .await?;
        if result["confirmed"] != true {
            return Err("Cloud deletion still pending; uploads paused".into());
        }
        i.deleted(&id)?;
    }
    let mut uploaded = 0;
    for record in i.cloud_batch()? {
        // Persist a tombstone before network I/O, including ambiguous timeout cases.
        i.pending_upload(&record.id)?;
        let result=gateway(reqwest::Method::POST,"sources",Some(serde_json::json!({"id":record.id,"hash":record.hash,"title":record.title,"mime":record.mime,"text":record.text,"policy":current})),&token).await?;
        if result["state"] != "ready" {
            return Err(
                "Provider queued or failed the upload. Retry synchronization to reconcile.".into(),
            );
        }
        i.deleted(&record.id)?;
        i.mark_uploaded(&record.id, &record.hash)?;
        uploaded += 1;
    }
    Ok(serde_json::json!({"uploaded":uploaded,"batchLimit":20}))
}
