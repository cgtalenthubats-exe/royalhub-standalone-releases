# RoyalHub Standalone

A fully offline, single-machine edition of RoyalFlush ATS. No cloud database, no cloud
storage, no login, no hosting, no domain — everything runs on your own computer.

This is a separate product from the cloud/Azure edition, not a replacement for it. The two
share the same application code and feature set, but differ in how data is stored and how
access is controlled — see [Differences from the cloud edition](#differences-from-the-cloud-edition)
below.

## Requirements

- [Node.js](https://nodejs.org/) 22.13 or later
- Internet access is **only** needed for the AI features (Org Chart OCR, AI Insights,
  Proposal Assessment) — everything else works fully offline.

There's nothing else to install — no Python, no Visual Studio/build tools, no separate
database software. The local database uses Node's own built-in SQLite support, not a
compiled add-on, so `npm install` never needs to build anything on your machine.

## First-time setup

```bash
npm install
npm run setup
```

`npm run setup` creates the local database (`data/royalflush.db`), generates a random
compensation-encryption key in `.env.local`, and — the first time only — populates the 8 real
Central Group banners (with their real logos) plus a small 5-person sample employee roster, so the app
opens already showing real, working data instead of an empty screen. It's safe to run more than
once — it never overwrites an existing database, key, or data.

## Running the app

```bash
npm run dev
```

Then open http://localhost:3000 in your browser. There is no login — the app opens straight
to the dashboard.

For a production-style run instead:

```bash
npm run build
npm start
```

### Double-click launcher (no terminal needed)

After the first-time setup above, double-click one of these — no typing commands, and each
checks for updates before starting, patching itself automatically if a newer version is
available (no GitHub account needed — this works the same whether you installed via `git clone`
or a plain ZIP download):

- **Windows**: `launch-windows.hta` — one window with **Run**, **Stop**, **Back Up Data**, and
  **Restore Data** buttons, so there's a single file to double-click for everything instead of
  four. Run/Stop start and stop the app (Stop shuts it down without needing to find and close a
  separate console window); Back Up Data / Restore Data hand off to the standalone scripts below
  (same thing, just reachable from here too) and are disabled while the app is running.
  (`launch-windows.bat` also works if `.hta` files are blocked by your organization's security
  policy — it does the same Run step, starting straight from a console window with no Stop
  button, so closing that window is how you stop it; back up/restore from `backup-data.bat` /
  `restore-data.bat` directly in that case.)
- **Mac**: `launch-mac.command` — asks what you want to do (**Run the app**, **Back up my
  data**, or **Restore from a backup**), then does it. Running starts the app and opens it in
  your browser; closing the Terminal window stops it. The **first** double-click will likely be
  blocked by Gatekeeper (macOS's warning for downloaded files that aren't from an identified
  developer) — on current macOS this often shows only a "Move to Trash" option, not "Open
  Anyway", so right-click → Open isn't enough by itself. Clear it once with either:
  - **System Settings → Privacy & Security** → scroll down to the message about
    `launch-mac.command` being blocked → click **Open Anyway** → confirm on the next double-click.
  - Or in Terminal, from the project folder: `chmod +x launch-mac.command && xattr -d
    com.apple.quarantine launch-mac.command` — then double-click normally, no more warning.

If Node.js isn't installed yet, Run detects that and opens nodejs.org instead of failing with a
raw "npm is not recognized" error — install it (any current version works), then run the
launcher again.

If `npm install` itself fails (a network hiccup, anything), the full output is saved to
**install-log.txt** in this same folder, in addition to showing on screen as normal — if you ask
someone for help, send that file rather than a screenshot of the console window.

### Updating

Every launcher checks a small public version file before starting and, if a newer version is
available, downloads and applies it automatically — no GitHub account needed, nothing to click.
It only ever touches this app's own files; `data/`, `backups/`, and `.env.local` are never
touched by a patch. As an extra safety net, it also saves a backup to `backups/` right before
applying each patch (on top of the backup already described below), in case anything ever needs
to be undone by hand. `launch-windows.hta` shows the current version and when it was last
updated right in the window; `launch-windows.bat` and `launch-mac.command` print the same
information to the console. If the check itself fails (no internet, for instance), the app still
starts normally with whatever version is already installed — it's never blocked waiting on this.
Every check (not just failures) is logged with a timestamp to **patch-log.txt** in this same
folder, so there's always a real answer to "did it ever actually update, and when" — on the rare
occasion the check's result can't be understood at all, the full raw output is also saved to
**patch-debug.log**. Send either file along with install-log.txt if you ask for help.

Moving to a new computer, or just want a safety copy of everything? Use Back Up Data / Restore
Data above, or the standalone **backup-data** / **restore-data** scripts under
[Your data](#your-data) below — same thing either way.

## Your data

Everything lives on this computer, under the `data/` folder (never committed to git):

- `data/royalflush.db` — the entire database, a single file
- `data/uploads/` — every uploaded photo, résumé, and document

### Moving to another computer (or backing up)

Use **Back Up Data** in `launch-windows.hta`, or choose **Back up my data** from
`launch-mac.command` (or double-click `backup-data.command` / `backup-data.bat` directly — same
thing) — it saves `data/` *and* `.env.local` together into one `RoyalHub-Backup-<date>.zip` file
inside this app's own `backups/` folder (the two have to travel together — see why below). Copy
that one file to the other computer however you'd move any file (USB drive, email to yourself,
Google Drive, etc.), then use **Restore Data** / **Restore from a backup** (or
`restore-data.command` / `restore-data.bat`) there — it asks you to pick the zip file (no typing
a path) and puts everything back in place. The other computer now opens with identical data:
same employees, same photos, same compensation figures.

(`backups/` isn't committed to git either — like `data/`, it's local to whichever computer made
the backup, and it's where you'd look first if you ever need an older backup file again.)

This app does not sync automatically and doesn't coordinate with any other computer — if you
keep using both afterward, whichever one you back up and restore *last* silently overwrites the
other. Treat one computer as the real copy and the other as a side trip.

**Do not lose `.env.local`.** It holds the key that decrypts compensation figures — if it's
lost, that data becomes permanently unreadable (this is by design: the same protection that
keeps compensation data unreadable to anyone without the key applies equally to you).

## Built-in company data

Every fresh database always has Central Group's 8 real banners (Selfridges, Arnotts, Brown
Thomas, de Bijenkorf, Illum, KaDeWe, Rinascente, Globus) with their real logos — created
automatically by `npm run setup`, no separate step needed. This is permanent, built-in content,
not something you'd ever delete.

## Sample employee data

The first `npm run setup` on a new database also adds a small sample employee roster — Robert King
(CEO) down through 2 managers, spanning 2 of the 8 companies (org chart with a real reporting
hierarchy, compensation figures, a performance cycle, a department, a salary proposal, 2 succession
seats, an illustrated profile photo per person, and full ICPD data — competencies, action plans,
achievements, career steps, mentors) — so the app opens with every page already showing something
real instead of empty banners with no people, without being mistaken for actual headcount.
Compensation figures are fabricated but properly encrypted with your local
`.env.local` key, so they decrypt normally in the app. The profile photos are pre-generated
illustrated avatars committed under `assets/employee-photos/`, copied into place by the seed
script — not fetched from any external stock-photo service, to keep the whole app 100% offline.

To remove just the sample employees later (keeping the 8 banners), once you're ready to enter
real people:

```bash
npm run wipe:sample-employees
```

To bring the sample roster back afterward: `npm run seed:demo`. Both refuse to run if there's
already employee data in place that they didn't create — see each script's own output for what
to do in that case.

## Migrating production data

If you're moving off the cloud/Azure edition and want the real company data here instead of the
built-in banners, run the one-time migration script from a machine that has network access to the
production Postgres database and Azure Blob Storage account. It replaces the 8 built-in banners
with production's own real ones (and their real logos) automatically — no separate step needed:

```bash
cp .env.migration.example .env.migration   # fill in the values (see comments in the file)
npm run setup                              # only if you don't already have data/royalflush.db
npm run wipe:sample-employees               # clears the sample roster npm run setup just added
npm run migrate:from-cloud
```

This copies every table's data and every uploaded photo/résumé/document/JD/logo from production
into `data/royalflush.db` and `data/uploads/`, preserving all IDs and relationships, and switches
`.env.local`'s `COMPENSATION_ENCRYPTION_KEY` to production's real key (the old auto-generated one
is backed up to `.env.local.autogenerated.bak`) — without this, migrated compensation figures
would be permanently unreadable.

**If you don't have production's `COMPENSATION_ENCRYPTION_KEY`** (e.g. it was created as a
"Sensitive" env var somewhere and can no longer be read back), you can still migrate everything
else for real — employees, org chart, departments, performance, proposals, succession, and every
real photo/résumé/document/JD/logo — and only fabricate the compensation figures:

```bash
npm run migrate:from-cloud -- --mock-compensation
```

In this mode `COMPENSATION_ENCRYPTION_KEY` isn't needed at all (only `DATABASE_URL` and
`AZURE_STORAGE_CONNECTION_STRING` are); compensation figures are freshly made up per employee and
encrypted with the local key already in `.env.local` instead, so they decrypt normally in the app
— they just aren't production's real numbers. `.env.local` is left untouched in this mode.

It refuses to run if `data/royalflush.db` already has employee data in it (including the sample
roster `npm run setup` adds by default), to avoid double-importing. Run
`npm run wipe:sample-employees` first if that's why it's refusing. `.env.migration` holds real
production credentials — it's gitignored and must never be committed.

After migrating: run `npm run dev`, confirm the employee count matches production, open a
compensation figure to confirm it decrypts, and spot-check a few photos/résumés/documents render
correctly. The script prints a full summary (including any files it couldn't download) when it
finishes.

## Differences from the cloud edition

| | Cloud edition | This standalone edition |
|---|---|---|
| Database | Azure Database for PostgreSQL | Local SQLite file |
| File storage | Azure Blob Storage | Local disk |
| Login | Microsoft Entra ID SSO + username/password | None — anyone with access to this computer has full access |
| Compensation redaction (per-role masking) | Yes | No — there are no roles, so everyone sees compensation figures in plain view |
| Compensation encryption at rest | Yes (AES-256-GCM) | Yes, unchanged — protects the database file itself if it's copied or stolen |
| Hosting | Azure App Service | Runs on your own computer only |
| AI features (Org Chart OCR, AI Insights, Proposal Assessment) | Yes | Yes, unchanged — still call Google's Gemini API, so these specific features need internet and a Gemini API key (entered on the Settings page) |

Access control for this edition is your computer's own login/physical security — there is
nothing else gating who can open the app.
