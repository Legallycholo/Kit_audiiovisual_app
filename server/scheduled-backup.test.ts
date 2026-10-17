import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repository, emptyWorkspace } from "./database";
import { readWorkspaceBackup } from "./backup";
import { runScheduledBackup } from "./scheduled-backup";

describe("scheduled backups", () => {
  const dirs: string[] = [];
  const repos: Repository[] = [];
  afterEach(() => {
    repos.splice(0).forEach((repo) => repo.close());
    dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true }));
  });
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), "kit-backup-"));
    dirs.push(dir);
    const repo = new Repository(":memory:");
    repos.push(repo);
    repo.db
      .prepare("INSERT INTO workspace VALUES (1,0,?)")
      .run(JSON.stringify(emptyWorkspace("Producciones de prueba")));
    return { dir, repo };
  };

  it("writes a verifiable private backup file and audits it", () => {
    const { dir, repo } = setup();
    const result = runScheduledBackup(repo, {
      dir,
      keep: 3,
      now: new Date("2026-10-17T12:30:00.000Z"),
    });

    expect(result.file).toBe(join(dir, "kit-backup-20261017T123000Z-r0.json"));
    const backup = readWorkspaceBackup(
      JSON.parse(readFileSync(result.file, "utf8")),
    );
    expect(backup.checksum).toBe(result.checksum);
    expect(backup.workspace.settings.company).toBe("Producciones de prueba");
    if (process.platform !== "win32")
      expect(statSync(result.file).mode & 0o777).toBe(0o600);
    expect(repo.read().workspace.activity[0].title).toBe(
      "Scheduled workspace backup written",
    );
  });

  it("keeps only the newest backups and ignores unrelated files", () => {
    const { dir, repo } = setup();
    for (let hour = 10; hour < 15; hour++)
      runScheduledBackup(repo, {
        dir,
        keep: 2,
        now: new Date(`2026-10-17T${hour}:00:00.000Z`),
      });
    const { removed } = runScheduledBackup(repo, {
      dir,
      keep: 2,
      now: new Date("2026-10-17T15:00:00.000Z"),
    });

    expect(readdirSync(dir).sort()).toEqual([
      "kit-backup-20261017T140000Z-r0.json",
      "kit-backup-20261017T150000Z-r0.json",
    ]);
    expect(removed).toEqual(["kit-backup-20261017T130000Z-r0.json"]);
  });

  it("refuses to overwrite an existing file or keep zero files", () => {
    const { dir, repo } = setup();
    const now = new Date("2026-10-17T12:00:00.000Z");
    runScheduledBackup(repo, { dir, keep: 2, now });
    expect(() => runScheduledBackup(repo, { dir, keep: 2, now })).toThrow();
    expect(() => runScheduledBackup(repo, { dir, keep: 0, now })).toThrow(
      "at least one",
    );
  });
});
