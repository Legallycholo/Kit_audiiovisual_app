import {
  chmodSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Repository } from "./database";
import { createWorkspaceBackup } from "./backup";

const backupName = /^kit-backup-\d{8}T\d{6}Z-r\d+\.json$/;

// Writes a checksummed backup in the admin export format and prunes older files.
export function runScheduledBackup(
  repo: Repository,
  options: { dir: string; keep: number; now?: Date },
) {
  if (!Number.isInteger(options.keep) || options.keep < 1)
    throw new Error("Backup retention must keep at least one file.");
  const now = options.now || new Date();
  const current = repo.read();
  const backup = createWorkspaceBackup(
    current.workspace,
    current.revision,
    now.toISOString(),
  );
  mkdirSync(options.dir, { recursive: true, mode: 0o700 });
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const file = join(
    options.dir,
    `kit-backup-${stamp}-r${current.revision}.json`,
  );
  writeFileSync(file, JSON.stringify(backup), { mode: 0o600, flag: "wx" });
  chmodSync(file, 0o600);
  const removed = readdirSync(options.dir)
    .filter((name) => backupName.test(name))
    .sort()
    .reverse()
    .slice(options.keep)
    .map((name) => {
      rmSync(join(options.dir, name));
      return name;
    });
  repo.audit(
    "system",
    "Scheduled workspace backup written",
    `Revision ${current.revision} · ${backup.checksum.slice(0, 12)}`,
  );
  return { file, checksum: backup.checksum, removed };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const repo = new Repository(
    resolve(process.env.KIT_DATABASE || "data/kit.sqlite"),
  );
  try {
    const result = runScheduledBackup(repo, {
      dir: resolve(process.env.KIT_BACKUP_DIR || "data/backups"),
      keep: Number(process.env.KIT_BACKUP_KEEP || 14),
    });
    console.log(`Backup written: ${result.file}`);
    if (result.removed.length)
      console.log(`Removed older backups: ${result.removed.join(", ")}`);
  } catch (error) {
    console.error(
      "Backup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  } finally {
    repo.close();
  }
}
