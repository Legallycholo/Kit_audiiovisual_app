// Copies a KIT SQLite file into the Postgres company database.
//
//   npm run migrate:sqlite -- --from path/to/kit.sqlite            (dry run: checks and counts only)
//   npm run migrate:sqlite -- --from path/to/kit.sqlite --apply    (writes, then verifies)
//
// The target is KIT_DATABASE (the Supabase pooler connection string). The SQLite
// file is opened read-only and is never modified.
import { resolve } from "node:path";
import { Repository } from "../server/database";
import { importSqlite } from "../server/sqlite-import";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const from = args[args.indexOf("--from") + 1];

if (!flag("--from") || !from || from.startsWith("--")) {
  console.error("Usage: npm run migrate:sqlite -- --from <kit.sqlite> [--apply] [--force]");
  process.exit(2);
}
if (!process.env.KIT_DATABASE) {
  console.error("Set KIT_DATABASE to the target Postgres connection string first.");
  process.exit(2);
}

const repo = await Repository.open(process.env.KIT_DATABASE);
try {
  const report = await importSqlite({
    from: resolve(from),
    repo,
    apply: flag("--apply"),
    force: flag("--force"),
  });
  console.log(report.applied ? "APPLIED" : "DRY RUN (nothing was written)");
  console.log(`Workspace revision: ${report.revision}`);
  console.table(
    Object.fromEntries(
      Object.entries(report.source).map(([table, count]) => [
        table,
        { source: count, target: report.target?.[table] ?? "-" },
      ]),
    ),
  );
  if (!report.applied) console.log("Run again with --apply to copy the data.");
} catch (error) {
  console.error("Import failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
} finally {
  await repo.close();
}
