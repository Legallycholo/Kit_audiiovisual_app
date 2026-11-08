# Deploy KIT on Vercel: the owner's step-by-step

This is everything that needs **your** accounts or secrets. The code is done; nothing here has been pushed or deployed. Follow the parts in order. Each step says what you should see when it worked.

Background: [implementationplan_vercel_migration.md](implementationplan_vercel_migration.md). Never paste passwords or keys into chat, commits or screenshots.

**How the pieces fit:** the website files are served by Vercel's CDN; every `/api/...` request runs one serverless function (the same Express app as before); the company data lives in your Supabase project, in a private schema called `kit`.

---

## Before you start: check how big your data is

Vercel limits one request or response to **4.5 MB**. Normal use is far below that (each image is capped at 1.5 MB). The exception is the whole-workspace operations: **Export backup, Restore backup and the full export** send the entire workspace in one go.

How to check (2 minutes), on the app you use today: **Configuración → Export backup** and look at the size of the downloaded `kit-workspace-backup.json`.

- **Under 3 MB:** nothing to do.
- **3 to 4 MB:** it works, but you will outgrow it as you add images. Tell me and I will plan a fix.
- **Over 4 MB:** tell me **before deploying**. Backups and restores would fail on Vercel until I change how they work (for example by streaming them or moving images to storage).

Everyday saving, AI features and search are not affected by this.

---

## Part 1: Supabase (about 10 minutes)

Project: `hgugkgbpsrbqusazmthb` (the same one the portal uses).

### 1.1 Create the tables

1. Open the Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Open the file `supabase/migrations/20261107000012_kit_company_schema.sql` from this repo, copy **all** of it, paste it into the editor, and click **Run**.
3. **You should see:** "Success. No rows returned".

### 1.2 Check it worked

Run this in a new query:

```sql
select count(*) as tables from information_schema.tables where table_schema = 'kit';
```

**You should see:** `11`.

Then run:

```sql
select rolname, rolconfig from pg_roles where rolname = 'kit_server';
```

**You should see:** one row, and `rolconfig` contains `search_path=kit`.

### 1.3 Give the server its own login

The server connects as a limited user (`kit_server`), never as the Supabase admin.

1. On your computer, make a password: open Terminal and run `openssl rand -hex 32`. Copy the result (64 letters and numbers). Keep it in your password manager. It has no special characters on purpose, so it is safe inside a connection string.
2. In the SQL Editor run (paste your password between the quotes):

```sql
alter role kit_server with login password 'PASTE-THE-64-CHARACTER-PASSWORD-HERE';
```

**You should see:** "Success. No rows returned".

### 1.4 Copy the connection string

1. Click **Connect** (top of the dashboard) → choose **Transaction pooler** (port **6543**).
2. Copy the string. It looks like:
   `postgres://postgres.hgugkgbpsrbqusazmthb:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres`
3. Change **two** things: replace the user `postgres.hgugkgbpsrbqusazmthb` with `kit_server.hgugkgbpsrbqusazmthb`, and replace `[YOUR-PASSWORD]` with the password from 1.3.
4. This final string is your **`KIT_DATABASE`**. Keep it secret.

### 1.5 Confirm the data is private

Dashboard → **Settings → API** → "Exposed schemas". It should list only `public` (and `graphql_public`). **`kit` must not be there.** (It is not by default. This is the check that password hashes cannot be read through the public API.)

### 1.6 Allow your Vercel address to sign in

Dashboard → **Authentication → URL Configuration**. You will fill this in at step 3.5, once you know your Vercel address. Keep the tab open.

---

## Part 2: Vercel project (about 10 minutes)

### 2.0 Choose a plan

- **Hobby (free)** works for building and testing. Vercel's Hobby plan is for personal, non-commercial use, and cron jobs run at most once a day.
- **Pro** is what I recommend before the company relies on KIT.

Nothing in the code depends on this choice. You can upgrade later without changing anything.

### 2.1 Get the code onto GitHub (needs your approval)

The migration is in your working folder, not on GitHub. Tell me **"commit and push"** when you are ready.

Note: your working folder also contains your earlier, uncommitted portal changes (login, admin users and so on). The migration builds on top of them, so they should be committed **together**. I will not push anything until you say so.

### 2.2 Create the Vercel project

1. Go to **vercel.com/new** → import the GitHub repository `legallycholo/kit_audiiovisual_app`.
2. Framework: **Vite** (detected automatically). Leave the build settings as they are; `vercel.json` already sets them.
3. **Do not click Deploy yet.** First open **Environment Variables** and add the variables in 2.3.

### 2.3 Environment variables

Add each one for the **Production** environment only. Mark every secret as **Sensitive**.

| Name                                      | Value                                                                                  | Required?        |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| `KIT_DATABASE`                            | the string from step 1.4                                                               | **Yes**          |
| `CRON_SECRET`                             | run `openssl rand -hex 32` and paste the result                                        | **Yes**          |
| `KIT_SECURE_COOKIES`                      | `true`                                                                                 | **Yes**          |
| `KIT_ORIGINS`                             | your Vercel address, e.g. `https://kit-audiiovisual-app.vercel.app` (add your own domain later, separated by a comma) | **Yes**          |
| `SUPABASE_URL`                            | `https://hgugkgbpsrbqusazmthb.supabase.co`                                             | **Yes**          |
| `SUPABASE_PUBLISHABLE_KEY`                | copy from your local `.env`                                                            | **Yes**          |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | only the provider(s) you use; copy from your local `.env`             | For AI features  |
| `KIT_AI_PROVIDER`, `KIT_AI_MODEL`, `KIT_CHAT_MODEL`, `KIT_PLAN_MODEL` | copy from your local `.env`                                          | For AI features  |
| `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY`, `VITE_RECAPTCHA_SITE_KEY` | copy from your local `.env` if you use reCAPTCHA              | If used          |
| `SERPAPI_API_KEY`, `KIT_SERPAPI_MONTHLY_CAP` | copy from your local `.env`                                                         | If used          |
| `KIT_SEARCH_*` (provider name/url/token, region, retention, budget, price, **`KIT_SEARCH_ENCRYPTION_KEY`**) | copy from your local `.env`. **`KIT_SEARCH_ENCRYPTION_KEY` must be the exact same value** or existing encrypted search data cannot be read. | If used |
| `KIT_EMAIL_*`, `WHATSAPP_*`, `CALCOM_*`   | copy from your local `.env`                                                            | If used          |
| `KIT_LOG_LEVEL`                           | `info` (or leave out)                                                                  | Optional         |
| `KIT_DATABASE_CA`                         | Supabase's CA certificate text, to verify the database's identity. Leave out to skip.  | Optional         |

**Do not set** `PORT`, `NODE_ENV`, `KIT_BACKUP_DIR`, `KIT_BACKUP_KEEP` or `KIT_SEED_OWNER_*` on Vercel. They do not apply.

**Do not set `KIT_DATABASE` for Preview.** Preview deployments then answer "database not configured" instead of touching your real company data.

(I did not edit `.env.example` because your rules protect `.env*` files. You can add `KIT_DATABASE`, `CRON_SECRET`, `KIT_JOB_STALE_MS` and `KIT_DATABASE_CA` there yourself as documentation.)

### 2.4 Check Fluid Compute and function time

Vercel project → **Settings → Functions**.

1. **Fluid Compute** should be **enabled** (it is on by default for new projects).
2. Note the **Function Max Duration** for your plan. KIT's AI jobs (proposal drafts, KIT chat, floor-plan reading) can take up to a few minutes. I expect up to 300 seconds is available; if your plan's limit is lower (for example 60 seconds), tell me the number and I will check which features are at risk. If you set a different limit, also set `KIT_JOB_STALE_MS` to that many milliseconds plus 30000.

---

## Part 3: First deploy and test

### 3.1 Deploy

Click **Deploy** (or push to the connected branch). The build runs `npm run build`.
**You should see:** a green "Ready" deployment and an address like `https://kit-audiiovisual-app.vercel.app`.

If the build fails, copy the last 30 lines of the build log to me.

### 3.2 Quick health check

Open `https://<your-address>/api/health` in a browser.
**You should see:** `{"ok":true,"initialized":false}` (or `true` if you already imported data).

If you see `"The company database is not configured for this deployment."`, the `KIT_DATABASE` variable is missing for that environment. If you see `"could not start"`, the connection string is wrong (check the user is `kit_server.hgugkgbpsrbqusazmthb` and the password has no typos), then redeploy.

### 3.3 If you have no existing data

Open the address: it goes to `/portal/login`. Sign in with your Supabase **administrator** account. Because the company database is empty, that first administrator becomes the owner and an empty workspace named "KIT audiovisual" is created (rename it in Configuración). Skip to 3.5.

### 3.3b Let people request accounts (approval required)

`/portal/login` has a **Crear cuenta** link. So that new accounts wait for your approval instead of being active at once, run this once in the Supabase SQL Editor:

```sql
update public.app_settings set value = 'true'::jsonb where key = 'require_account_approval';
```

New requests then appear as "Pendiente" in **Usuarios y accesos** (`/portal/admin/users`); click **Aprobar**. For now only administrators enter the workspace; an approved regular account sees "Sin acceso al espacio de trabajo".

### 3.4 If you have existing data to keep (import)

Do this **before** anyone uses the new site. The import never changes the SQLite file.

1. Get a copy of the data file:
   - From your computer: copy `data/kit.sqlite` to a new place, e.g. `~/kit-backup.sqlite`. Do not move or edit the original.
   - From Fly (if the live data is there): `fly ssh sftp get /data/kit.sqlite ~/kit-from-fly.sqlite -a kit-audiiovisual-app`
2. In Terminal, in the project folder:

```sh
export KIT_DATABASE='<the string from step 1.4>'
npm run migrate:sqlite -- --from ~/kit-backup.sqlite
```

   **You should see:** `DRY RUN (nothing was written)` and a table of row counts. Check the numbers look right (users, audit entries, and so on).
3. Copy for real:

```sh
npm run migrate:sqlite -- --from ~/kit-backup.sqlite --apply
```

   **You should see:** `APPLIED` and the same counts under "target". The tool checks the row counts and a checksum of the workspace itself; if anything differs it undoes everything and prints why.
4. Close the Terminal window (or run `unset KIT_DATABASE`) so the secret is not left in your session.

Everyone will need to sign in once again (sessions are not copied).

### 3.5 Allow sign-in from your new address

1. Supabase → **Authentication → URL Configuration**: add your Vercel address (and later your own domain) to **Site URL** / **Redirect URLs**.
2. If you use reCAPTCHA: Google Cloud → reCAPTCHA Enterprise → your key → add the Vercel domain to the allowed domains.

### 3.6 Smoke test (click through it)

Use your real Vercel address:

- [ ] Sign in (portal login at `/portal/login` for administrators, or the owner account).
- [ ] Open a client or event, change something, save, **reload the page**: the change is still there.
- [ ] Create a proposal draft with AI. A suggestion appears for review. (Needs AI keys set.)
- [ ] Open KIT chat, send a message. It shows "generating", then the answer appears.
- [ ] In KIT Act mode, ask for an action; it only proposes it, and nothing happens until you confirm.
- [ ] Settings → Integraciones shows your providers as connected.
- [ ] Export a backup (Configuración) and check the file downloads.
- [ ] Vercel → your project → **Cron Jobs** (or Logs): `/api/cron/search-retry` is listed. You can click **Run** to test it; it should return 200.

If something fails: Vercel → project → **Logs**, filter by the failing request, and send me the error line (not secrets).

### 3.7 Attach your own domain (optional)

Vercel → project → **Settings → Domains** → add it and follow the DNS instructions. Then add the domain to `KIT_ORIGINS`, to Supabase's redirect URLs (3.5) and redeploy.

---

## Part 4: Afterwards

1. **Desktop app:** if it points at your old Fly address, change its server address to the new one.
2. **Backups:** turn on Supabase backups for the project (Dashboard → Database → Backups; what is available depends on your Supabase plan; the free tier has no point-in-time recovery and pauses inactive projects). KIT's own **Export backup** button in the app keeps working.
3. **Retire Fly, but not yet.** Keep the Fly app untouched for a few days while you confirm everything works on Vercel. After that: `fly apps destroy kit-audiiovisual-app`. **This permanently deletes the volume and its data**, so be certain the import in 3.4 was verified first.

   Heads-up: after people start using the Vercel site, the Fly copy stops being current. Do not switch back to it afterwards without exporting first.

## Rolling back

- **Before you attach your domain / before anyone used Vercel:** nothing changed for users. Fix and redeploy.
- **After people used it:** use KIT's **Export backup** (or a Supabase backup) before any change, and restore from that.
- A bad deploy can always be undone in Vercel → **Deployments** → pick an earlier one → **Promote to Production**.

## What changed for users

- Search retries happen after search activity and once a day (plus every minute only if you upgrade and change the cron schedule in `vercel.json`) instead of every 30 seconds. Cloud search has no provider configured yet, so you will not notice.
- Requests are limited to 4 MB (Vercel's cap is 4.5 MB). Very large image uploads are rejected, and so are backup restores bigger than that (see "Before you start").
- AI jobs that run longer than your plan's function limit are marked "interrumpida" and can be retried.
- Everyone signs in once after the data import.

## Optional: per-minute search retry without Pro

Supabase can call the cron route every minute for free (`pg_cron` + `pg_net`) using the same `CRON_SECRET`. Ask me and I will write the exact SQL when you want it.
