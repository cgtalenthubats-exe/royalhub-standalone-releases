#!/usr/bin/env node
// First-run setup for the standalone edition — everything here happens
// automatically on the very first `npm run dev`/`npm start` (via predev/
// prestart), so opening the app for the first time already has company data
// AND a sample employee roster, no separate command needed:
//   1. Creates the local SQLite database from docs/sqlite/schema.sql (only if
//      it doesn't already exist — safe to re-run). This already bakes in the
//      8 real Central Group banners.
//   2. Copies the real banner logo files onto disk.
//   3. Generates .env.local with a random COMPENSATION_ENCRYPTION_KEY (only
//      if one doesn't already exist — never overwrites an existing key,
//      since that would make previously-encrypted data unreadable).
//   4. On a brand-new database only: seeds the sample 27-person employee
//      roster (scripts/seed_demo_data.mjs) so the app opens pre-populated.
//      To delete just the sample employees later (keeping the 8 banners):
//      `node scripts/wipe_sample_employees.mjs`.
//
// Run with: node scripts/setup.mjs  (also runs automatically via
// `npm run predev`/`prestart`, see package.json).

import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, copyFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const dbPath = process.env.ROYALFLUSH_DB_PATH || path.join(root, "data", "royalflush.db");
const envPath = path.join(root, ".env.local");
const schemaPath = path.join(root, "docs", "sqlite", "schema.sql");
const logoSourceDir = path.join(root, "assets", "banner-logos");
const logoTargetDir = path.join(root, "data", "uploads", "banner-logos");

function setupDatabase() {
    const isNew = !existsSync(dbPath);
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    if (isNew) {
        const schema = readFileSync(schemaPath, "utf8");
        db.exec(schema);
        console.log(`Created new database at ${dbPath}`);
    } else {
        console.log(`Using existing database at ${dbPath}`);
    }
    db.close();
    return isNew;
}

// Brings an EXISTING database (created before the ICPD tables/columns
// existed) up to date in place, without touching any data already in it.
// A brand-new database already has all of this from docs/sqlite/schema.sql,
// so every check here is a no-op there — this only ever does real work once,
// the first run after this code ships.
function ensureIcpdSchema() {
    const db = new DatabaseSync(dbPath);

    const employeeCols = db.prepare("PRAGMA table_info(employees)").all().map((c) => c.name);
    if (!employeeCols.includes("mentor_employee_id")) {
        db.exec("ALTER TABLE employees ADD COLUMN mentor_employee_id INTEGER REFERENCES employees(employee_id)");
        console.log("Added employees.mentor_employee_id.");
    }
    if (!employeeCols.includes("cross_group_mobility")) {
        db.exec("ALTER TABLE employees ADD COLUMN cross_group_mobility INTEGER");
        console.log("Added employees.cross_group_mobility.");
    }

    // employee_background.type used to be CHECK-constrained to 3 fixed values;
    // the ICPD tab needs 2 more ('strength', 'development_area'). SQLite has
    // no ALTER ... DROP CONSTRAINT, so a still-constrained table is rebuilt
    // (rename -> recreate -> copy -> drop) preserving every existing row.
    // Detects the OLD table specifically by its exact original 3-value list —
    // checking for the word "CHECK" alone would also match this file's own
    // comments once copied into sqlite_master.sql, which store the original
    // SQL text verbatim.
    const backgroundSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='employee_background'").get()?.sql || "";
    if (backgroundSql.includes("'experience', 'education', 'certification'")) {
        db.exec(`
            ALTER TABLE employee_background RENAME TO employee_background_old;
            CREATE TABLE employee_background (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
              type         TEXT NOT NULL,
              title        TEXT,
              organization TEXT,
              detail       TEXT,
              sort_order   INTEGER
            );
            INSERT INTO employee_background SELECT * FROM employee_background_old;
            DROP TABLE employee_background_old;
        `);
        console.log("Relaxed employee_background.type to accept any value (was a fixed 3-value CHECK).");
    }

    // employee_development_plans may already exist from an earlier build of
    // this feature without `category` (it was added once duplicate "Action
    // Plan" / "Preparation to Support Next Roles" rows turned out to be
    // indistinguishable). CREATE TABLE IF NOT EXISTS below is a no-op for an
    // already-existing table, so the missing column has to be added here.
    const devPlanCols = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_development_plans'").get()
        ? db.prepare("PRAGMA table_info(employee_development_plans)").all().map((c) => c.name)
        : null;
    if (devPlanCols && !devPlanCols.includes("category")) {
        db.exec("ALTER TABLE employee_development_plans ADD COLUMN category TEXT NOT NULL DEFAULT 'action_plan'");
        console.log("Added employee_development_plans.category.");
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS employee_development_plans (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
          category     TEXT NOT NULL DEFAULT 'action_plan',
          plan         TEXT NOT NULL,
          next_steps   TEXT,
          by_when      TEXT,
          status       TEXT,
          sort_order   INTEGER
        );
        CREATE TABLE IF NOT EXISTS employee_achievements (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
          description  TEXT NOT NULL,
          sort_order   INTEGER
        );
        CREATE TABLE IF NOT EXISTS employee_periodic_assessments (
          id                     INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id            INTEGER NOT NULL REFERENCES employees(employee_id),
          fiscal_year            INTEGER NOT NULL,
          performance            TEXT,
          commitment_engagement  TEXT,
          promotion_readiness    TEXT,
          risk_of_losing         TEXT,
          UNIQUE (employee_id, fiscal_year)
        );
        CREATE TABLE IF NOT EXISTS employee_competencies (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id     INTEGER NOT NULL REFERENCES employees(employee_id),
          competency_name TEXT NOT NULL,
          rating          TEXT,
          sort_order      INTEGER
        );
        CREATE TABLE IF NOT EXISTS employee_career_steps (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id       INTEGER NOT NULL REFERENCES employees(employee_id),
          step_order        INTEGER,
          destination_role  TEXT,
          level             TEXT,
          function_id       INTEGER REFERENCES functions(function_id),
          by_year           INTEGER,
          by_age            INTEGER,
          type              TEXT,
          banner_id         INTEGER REFERENCES banners(banner_id)
        );
        CREATE TABLE IF NOT EXISTS succession_candidate_attributes (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          candidate_id    INTEGER NOT NULL REFERENCES succession_candidates(candidate_id) ON DELETE CASCADE,
          attribute_name  TEXT NOT NULL,
          potential       TEXT,
          sort_order      INTEGER
        );
    `);

    db.close();
}

// The 8 real Central Group banners are always in the database (see
// docs/sqlite/schema.sql) — this just makes sure their real logo files are
// physically present on disk to back those banners.logo_url values, since
// SQL alone can't copy binary files. assets/banner-logos/ holds these
// pre-cropped tight to the logo mark itself (the raw exports in
// "logo banner and else/logo/" are full-page prints with a lot of white
// space padding, which made the logo look tiny once placed in the app's
// small logo badges). Copies each logo independently (not gated on isNew)
// so it also self-heals if data/uploads was ever cleared without recreating
// the database.
const BANNER_LOGO_FILES = [
    "selfridges.jpg", "arnotts.jpg", "brown-thomas.jpg", "de-bijenkorf.jpg",
    "illum.jpg", "kadewe.jpg", "rinascente.jpg", "globus.jpg",
];

function setupBannerLogos() {
    mkdirSync(logoTargetDir, { recursive: true });
    let copied = 0;
    for (const file of BANNER_LOGO_FILES) {
        const targetPath = path.join(logoTargetDir, file);
        if (existsSync(targetPath)) continue;
        const sourcePath = path.join(logoSourceDir, file);
        if (!existsSync(sourcePath)) {
            console.warn(`Missing source logo: ${sourcePath} — skipping ${file}.`);
            continue;
        }
        copyFileSync(sourcePath, targetPath);
        copied++;
    }
    if (copied > 0) console.log(`Copied ${copied} banner logo(s) into data/uploads/banner-logos/.`);
}

function setupEncryptionKey() {
    const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    if (/^COMPENSATION_ENCRYPTION_KEY=.+/m.test(existing)) {
        console.log("COMPENSATION_ENCRYPTION_KEY already set in .env.local — leaving it untouched.");
        return;
    }
    const key = randomBytes(32).toString("base64");
    appendFileSync(envPath, `${existing.endsWith("\n") || !existing ? "" : "\n"}COMPENSATION_ENCRYPTION_KEY=${key}\n`);
    console.log("Generated a new COMPENSATION_ENCRYPTION_KEY in .env.local.");
    console.log("Back this file up somewhere safe — losing this key makes existing compensation data unreadable.");
}

// Only on a database freshly created by this very run — never on an existing
// one — so the app opens pre-populated on first use, but this never re-adds
// the sample roster on top of real or already-modified data.
function setupSampleEmployees(isNewDatabase) {
    if (!isNewDatabase) return;
    execFileSync(process.execPath, [path.join(root, "scripts", "seed_demo_data.mjs")], {
        cwd: root,
        stdio: "inherit",
    });
}

const isNewDatabase = setupDatabase();
ensureIcpdSchema();
setupBannerLogos();
setupEncryptionKey();
setupSampleEmployees(isNewDatabase);
console.log("Setup complete. Run `npm run dev` (or `npm run build && npm start`) to launch the app.");
