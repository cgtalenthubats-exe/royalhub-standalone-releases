#!/usr/bin/env node
// One-time migration: copy real data from the cloud edition's production
// Azure Postgres + Azure Blob Storage into this standalone edition's local
// SQLite database + local disk. Run this yourself on a machine that already
// has network access to production — this script never gets run against
// production by anyone else.
//
// Usage:
//   1. cp .env.migration.example .env.migration, then fill in the values
//      (or export them as shell env vars instead — either works).
//   2. npm run setup            # creates an empty data/royalflush.db if you
//                                 don't already have one
//   3. npm run migrate:from-cloud
//
// Everything (employees, org, departments, performance, proposals, succession,
// AND every real photo/résumé/document/JD/logo) is copied over exactly as it
// is in production. The one exception is compensation figures: those are
// ciphertext that only decrypts with production's own COMPENSATION_ENCRYPTION_KEY.
// If you have that key, pass it (in .env.migration or as an env var) and it's
// copied through like everything else. If you don't, pass --mock-compensation
// instead: every other field (names, org chart, files, ...) is still migrated
// for real, but compensation figures are freshly made up and encrypted with
// this repo's own local key instead — no production key needed for that flag.
//
// Safety: refuses to run if data/royalflush.db already has employees in it
// (this includes the sample roster npm run setup creates by default), to
// avoid double-importing / primary-key collisions. Pass --force to override
// (not recommended — run `npm run wipe:sample-employees` instead, which
// clears employees/org/etc. without touching the database file itself).

import { DatabaseSync } from "node:sqlite";
import { Pool, types } from "pg";
import { BlobServiceClient } from "@azure/storage-blob";
import { createCipheriv, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const dbPath = process.env.ROYALFLUSH_DB_PATH || path.join(root, "data", "royalflush.db");
const uploadRoot = path.join(root, "data", "uploads");
const envLocalPath = path.join(root, ".env.local");
const envMigrationPath = path.join(root, ".env.migration");
const force = process.argv.includes("--force");
const mockCompensation = process.argv.includes("--mock-compensation");

// ── 1. Load credentials ─────────────────────────────────────────────────

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return;
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = value;
    }
}

loadEnvFile(envMigrationPath);

const REQUIRED_ENV = ["DATABASE_URL", "AZURE_STORAGE_CONNECTION_STRING"];
if (!mockCompensation) REQUIRED_ENV.push("COMPENSATION_ENCRYPTION_KEY");
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error(`Missing required env var(s): ${missing.join(", ")}`);
    console.error("Copy .env.migration.example to .env.migration and fill in the values (or export them as shell env vars).");
    process.exit(1);
}

// In --mock-compensation mode, compensation figures are encrypted with this
// repo's own local key (from `npm run setup`) instead of production's —
// duplicates the tiny AES-256-GCM scheme in src/lib/crypto.ts since that
// file is TypeScript and this script is plain .mjs.
let encryptLocal = null;
if (mockCompensation) {
    const localEnvRaw = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : "";
    const match = localEnvRaw.match(/^COMPENSATION_ENCRYPTION_KEY=(.+)$/m);
    if (!match) {
        console.error("--mock-compensation needs a local COMPENSATION_ENCRYPTION_KEY in .env.local — run `npm run setup` first.");
        process.exit(1);
    }
    const localKey = Buffer.from(match[1].trim(), "base64");
    encryptLocal = (plaintext) => {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", localKey, iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, ciphertext]).toString("base64");
    };
}

// ── 2. Open local SQLite, safety check ──────────────────────────────────

if (!existsSync(dbPath)) {
    console.error(`No database at ${dbPath} — run \`npm run setup\` first.`);
    process.exit(1);
}

const db = new DatabaseSync(dbPath);
const existingCount = db.prepare("SELECT COUNT(*) AS c FROM employees").get().c;
if (existingCount > 0 && !force) {
    console.error(`employees already has ${existingCount} row(s) — refusing to import twice.`);
    console.error("Run `npm run wipe:sample-employees` for a clean slate, or pass --force if you understand the collision risk.");
    db.close();
    process.exit(1);
}

// scripts/setup.mjs always pre-populates the 8 real Central Group banners
// (see docs/sqlite/schema.sql) as built-in content, with their own
// banner_id/office_id values (1-8). Production has its own authoritative
// banners with the same small ID range, so those placeholder rows (and
// their built-in logo files) are cleared first to avoid a primary-key
// collision — production's real banner data is about to become the source
// of truth for this database.
db.exec("DELETE FROM banner_offices");
db.exec("DELETE FROM banners");
const logoDir = path.join(uploadRoot, "banner-logos");
if (existsSync(logoDir)) {
    for (const file of readdirSync(logoDir)) {
        rmSync(path.join(logoDir, file));
    }
}

// ── 3. Connect to production Postgres + Blob ────────────────────────────
// Same type-parser setup as RoyalFlush_ATS/src/lib/postgres/client.ts, so
// values arrive already shaped the way SQLite expects them.

types.setTypeParser(20, (val) => parseInt(val, 10)); // int8 / bigint
types.setTypeParser(1700, (val) => parseFloat(val)); // numeric / decimal
const identity = (val) => val;
types.setTypeParser(1082, identity); // date
types.setTypeParser(1083, identity); // time
types.setTypeParser(1114, identity); // timestamp (no tz)
types.setTypeParser(1184, identity); // timestamptz
types.setTypeParser(1266, identity); // timetz

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const blobService = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

// ── 4. Static migration config ───────────────────────────────────────────

const TABLE_ORDER = [
    "banners", "banner_offices", "functions", "positions", "employees",
    "employee_scores", "employee_positions", "org_edges", "departments",
    "employee_compensation", "compensation_history", "salary_proposals",
    "salary_proposal_compensation", "salary_proposal_comparisons",
    "salary_proposal_whatifs", "proposal_assessments", "performance_grades",
    "performance_cycles", "banner_goals", "employee_targets", "employment_history",
    "employee_background", "succession_seats", "succession_candidates",
    "employee_insights", "document_folders", "documents", "employee_documents",
    "app_settings",
];

const PK_COLS = {
    banners: ["banner_id"], banner_offices: ["office_id"], functions: ["function_id"],
    positions: ["position_id"], employees: ["employee_id"], employee_scores: ["employee_id"],
    employee_positions: ["employee_position_id"], org_edges: ["id"], departments: ["department_id"],
    employee_compensation: ["employee_id"], compensation_history: ["id"],
    salary_proposals: ["proposal_id"], salary_proposal_compensation: ["proposal_id"],
    salary_proposal_comparisons: ["proposal_id", "employee_id"], salary_proposal_whatifs: ["id"],
    proposal_assessments: ["proposal_id"], performance_grades: ["id"],
    performance_cycles: ["cycle_id"], banner_goals: ["goal_id"], employee_targets: ["target_id"],
    employment_history: ["id"], employee_background: ["id"], succession_seats: ["seat_id"],
    succession_candidates: ["candidate_id"], employee_insights: ["id"],
    document_folders: ["folder_id"], documents: ["document_id"],
    employee_documents: ["employee_document_id"], app_settings: ["key"],
};

const BOOL_COLS = {
    banner_offices: ["is_hq", "is_regional_office"],
    employee_positions: ["is_primary"],
    employment_history: ["is_current"],
    salary_proposals: ["approval_new_role", "approval_comp_adjustment"],
};

const JSON_ARRAY_COLS = {
    proposal_assessments: ["fit_bullets", "market_bullets", "peer_employee_ids"],
};

// Columns that exist in production but aren't part of this standalone app's
// schema (unused by src/) — dropped during migration rather than added to
// docs/sqlite/schema.sql, since the app never reads them.
const EXCLUDE_COLS = {
    banners: ["main_functions"],
    positions: ["created_at", "updated_at"],
    employee_compensation: ["updated_at"],
    salary_proposals: ["created_by"],
    salary_proposal_compensation: ["updated_at", "currency"],
    salary_proposal_comparisons: ["created_at"],
    performance_cycles: ["created_at"],
    banner_goals: ["created_at"],
    employee_targets: ["created_at", "updated_at"],
};

const FULL_URL_FILE_COLS = [
    { table: "employees", col: "photo", bucket: "profile-photos" },
    { table: "employees", col: "resume_url", bucket: "employee-resumes" },
    { table: "positions", col: "jd_pdf_url", bucket: "position-jds" },
    { table: "banners", col: "logo_url", bucket: "banner-logos" },
];

const STORAGE_PATH_FILE_COLS = [
    { table: "documents", col: "storage_path", bucket: "documents" },
    { table: "employee_documents", col: "storage_path", bucket: "employee-documents" },
];

const fileStats = { downloaded: 0, external: 0, failed: 0, failedItems: [] };

// ── Mock-compensation config (only used with --mock-compensation) ────────
// Field lists mirror src/lib/compensation-crypto.ts exactly — these are the
// columns the app itself encrypts/decrypts, regardless of the SQL column's
// declared type.

const MOCK_COMP_FIELDS = {
    employee_compensation: ["base_salary", "sti_target", "sti_max", "lti_target", "lti_max", "other_bonus", "total_compensation"],
    compensation_history: ["base_salary", "total_comp", "sti_eligible_pct", "sti_actual_pct", "sti_amount", "lti_eligible_pct", "lti_actual_pct", "lti_amount"],
    salary_proposal_compensation: ["base_salary", "cash_allowance", "sti_eligible_pct", "sti_amount", "lti_eligible_pct", "lti_amount"],
};

const mockProfiles = new Map(); // employee_id -> fabricated compensation profile, cached so every
                                 // table referencing the same employee shows consistent numbers

function randInt(min, max) {
    return Math.round(min + Math.random() * (max - min));
}

function mockProfileFor(employeeId) {
    if (mockProfiles.has(employeeId)) return mockProfiles.get(employeeId);
    const base = randInt(40000, 200000);
    const stiTarget = Math.round(base * 0.15);
    const ltiTarget = Math.round(base * 0.1);
    const otherBonus = randInt(0, 5000);
    const profile = {
        base_salary: base,
        sti_target: stiTarget,
        sti_max: Math.round(stiTarget * 1.5),
        lti_target: ltiTarget,
        lti_max: Math.round(ltiTarget * 1.5),
        other_bonus: otherBonus,
        total_compensation: base + stiTarget + ltiTarget + otherBonus,
        total_comp: base + stiTarget + ltiTarget + otherBonus,
        sti_eligible_pct: 15, sti_actual_pct: randInt(10, 20), sti_amount: stiTarget,
        lti_eligible_pct: 10, lti_actual_pct: randInt(5, 15), lti_amount: ltiTarget,
        cash_allowance: randInt(0, 3000),
    };
    mockProfiles.set(employeeId, profile);
    return profile;
}

function mockWhatifCompensation(employeeId) {
    const p = mockProfileFor(employeeId);
    return {
        employee_id: employeeId, currency: "EUR", base_salary: p.base_salary,
        sti_target: p.sti_target, sti_max: p.sti_max, lti_target: p.lti_target, lti_max: p.lti_max,
        other_bonus: p.other_bonus, allowance_company_car: null, allowance_mobility: null,
        allowance_home_office: null, allowance_private_medical: null, allowance_family_cover: null,
        total_compensation: p.total_compensation,
    };
}

const proposalEmployeeId = new Map(); // proposal_id -> employee_id, filled in when salary_proposals is fetched

// ── 5. File-migration helpers ────────────────────────────────────────────

function extractBlobPath(url, container) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!parsed.hostname.endsWith(".blob.core.windows.net")) return null;
    const segments = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
    if (segments[0] !== container) return null;
    return segments.slice(1).join("/");
}

async function downloadBlob(container, blobPath) {
    try {
        const client = blobService.getContainerClient(container).getBlockBlobClient(blobPath);
        return await client.downloadToBuffer();
    } catch (err) {
        console.warn(`  could not download ${container}/${blobPath}: ${err.message}`);
        return null;
    }
}

function saveLocal(bucket, relPath, buffer) {
    const target = path.join(uploadRoot, bucket, relPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, buffer);
}

async function localizeFullUrlColumn(value, bucket) {
    if (!value) return value;
    const blobPath = extractBlobPath(value, bucket);
    if (blobPath === null) {
        fileStats.external++;
        return value; // not a production blob URL (e.g. an external placeholder avatar) — leave as-is
    }
    const buf = await downloadBlob(bucket, blobPath);
    if (buf === null) {
        fileStats.failed++;
        fileStats.failedItems.push(value);
        return value;
    }
    saveLocal(bucket, blobPath, buf);
    fileStats.downloaded++;
    return `/api/files/${bucket}/${blobPath}`;
}

async function localizeStoragePathColumn(storagePath, bucket) {
    if (!storagePath) return;
    const buf = await downloadBlob(bucket, storagePath);
    if (buf === null) {
        fileStats.failed++;
        fileStats.failedItems.push(`${bucket}/${storagePath}`);
        return;
    }
    saveLocal(bucket, storagePath, buf);
    fileStats.downloaded++;
}

// ── 6. Fetch + transform every table (all async work happens here, before
//       the synchronous SQLite transaction) ──────────────────────────────

const rowsByTable = {};

for (const table of TABLE_ORDER) {
    const orderBy = PK_COLS[table].join(", ");
    const result = await pgPool.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    const rows = result.rows;

    for (const row of rows) {
        for (const col of BOOL_COLS[table] || []) {
            row[col] = row[col] ? 1 : 0;
        }
        for (const col of JSON_ARRAY_COLS[table] || []) {
            row[col] = JSON.stringify(row[col] ?? []);
        }
    }

    if (table === "salary_proposals") {
        for (const row of rows) proposalEmployeeId.set(row.proposal_id, row.employee_id);
    }

    if (mockCompensation && MOCK_COMP_FIELDS[table]) {
        for (const row of rows) {
            const employeeId = table === "salary_proposal_compensation"
                ? proposalEmployeeId.get(row.proposal_id)
                : row.employee_id;
            const profile = mockProfileFor(employeeId);
            for (const field of MOCK_COMP_FIELDS[table]) {
                row[field] = profile[field] == null ? null : encryptLocal(String(profile[field]));
            }
        }
    }
    if (mockCompensation && table === "salary_proposal_whatifs") {
        for (const row of rows) {
            row.compensation = encryptLocal(JSON.stringify(mockWhatifCompensation(row.base_employee_id)));
        }
    }

    for (const { col, bucket } of FULL_URL_FILE_COLS.filter((c) => c.table === table)) {
        for (const row of rows) {
            row[col] = await localizeFullUrlColumn(row[col], bucket);
        }
    }
    for (const { col, bucket } of STORAGE_PATH_FILE_COLS.filter((c) => c.table === table)) {
        for (const row of rows) {
            await localizeStoragePathColumn(row[col], bucket);
        }
    }

    rowsByTable[table] = rows;
    console.log(`fetched ${rows.length} row(s) from ${table}`);
}

await pgPool.end();

// ── 7. Single synchronous SQLite transaction ─────────────────────────────

db.exec("PRAGMA foreign_keys = OFF"); // must happen before BEGIN — SQLite no-ops a mid-transaction toggle

// node:sqlite has no db.transaction() helper (unlike better-sqlite3), so
// BEGIN/COMMIT/ROLLBACK are driven by hand instead; it also requires each
// positional "?" to be its own argument to .run() rather than one array, and
// throws on a bound `undefined` instead of treating it as NULL — row[c] can
// be `undefined` for a column pg never returned a value for.
db.exec("BEGIN");
try {
    for (const table of TABLE_ORDER) {
        const rows = rowsByTable[table];
        if (rows.length === 0) continue;
        const excluded = EXCLUDE_COLS[table] || [];
        const cols = Object.keys(rows[0]).filter((c) => !excluded.includes(c));
        const stmt = db.prepare(
            `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
        );
        for (const row of rows) {
            stmt.run(...cols.map((c) => row[c] ?? null));
        }
    }
    db.exec("COMMIT"); // atomic — throws => full rollback, nothing partially written
} catch (err) {
    db.exec("ROLLBACK");
    throw err;
}

db.exec("PRAGMA foreign_keys = ON");
db.close();

// ── 8. Overwrite .env.local's encryption key with production's real key ──
// (skipped entirely in --mock-compensation mode — there's no production key
// to copy in, and the mocked figures were already encrypted with the local
// key that's already there)

if (!mockCompensation) {
    const oldEnvLocal = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : "";
    if (oldEnvLocal) {
        writeFileSync(path.join(root, ".env.local.autogenerated.bak"), oldEnvLocal);
    }
    const newKeyLine = `COMPENSATION_ENCRYPTION_KEY=${process.env.COMPENSATION_ENCRYPTION_KEY}`;
    const newEnvLocal = /^COMPENSATION_ENCRYPTION_KEY=.*/m.test(oldEnvLocal)
        ? oldEnvLocal.replace(/^COMPENSATION_ENCRYPTION_KEY=.*/m, newKeyLine)
        : oldEnvLocal + (oldEnvLocal && !oldEnvLocal.endsWith("\n") ? "\n" : "") + newKeyLine + "\n";
    writeFileSync(envLocalPath, newEnvLocal);
    console.log("");
    console.log("Overwrote .env.local's COMPENSATION_ENCRYPTION_KEY with production's real key");
    console.log("(previous value backed up to .env.local.autogenerated.bak) — compensation data");
    console.log("was encrypted with production's key, not the auto-generated one.");
}

// ── 9. Summary ────────────────────────────────────────────────────────────

console.log("");
console.log("=== Migration summary ===");
for (const table of TABLE_ORDER) {
    console.log(`  ${table}: ${rowsByTable[table].length}`);
}
console.log("");
console.log(`Files: ${fileStats.downloaded} downloaded, ${fileStats.external} left as external URLs, ${fileStats.failed} failed`);
if (fileStats.failed > 0) {
    console.log("Failed downloads:");
    for (const item of fileStats.failedItems) console.log(`  - ${item}`);
}
if (mockCompensation) {
    console.log("");
    console.log(`Compensation: FABRICATED for ${mockProfiles.size} employee(s) — everything else above is real production data.`);
}
console.log("");
console.log("Next steps:");
console.log("  1. npm run dev — confirm the employee count above matches production's.");
console.log(
    mockCompensation
        ? "  2. Open an employee's Compensation tab — confirm a figure decrypts without error (it will be a made-up number, not production's real one)."
        : "  2. Open an employee's Compensation tab — confirm a salary figure decrypts to a real number."
);
console.log("  3. Open a couple of photos, resumes, a position JD, and a banner logo — confirm they render.");
console.log("  4. Open the Document Center and an employee's Documents tab — confirm files open.");
console.log("  5. For any failed downloads above, fetch those blobs manually from the Azure Portal and");
console.log("     drop them into data/uploads/<bucket>/<path> by hand.");
if (!mockCompensation) {
    console.log("  6. Once step 2 confirms decryption works, delete .env.local.autogenerated.bak.");
}
