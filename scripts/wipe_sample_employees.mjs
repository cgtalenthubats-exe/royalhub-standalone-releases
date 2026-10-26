#!/usr/bin/env node
// Deletes every employee/org/compensation/performance/proposal/succession row
// — everything scripts/seed_demo_data.mjs (or real usage) can create — while
// leaving the 8 built-in Central Group banners and their logos untouched.
// Use this to go from "pre-populated with the sample roster" back to "just
// the 8 companies, no people yet" before entering real employees or running
// scripts/migrate_from_cloud.mjs.
//
// Usage: node scripts/wipe_sample_employees.mjs

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const dbPath = process.env.ROYALFLUSH_DB_PATH || path.join(root, "data", "royalflush.db");

if (!existsSync(dbPath)) {
    console.error(`No database at ${dbPath} — nothing to wipe.`);
    process.exit(1);
}

const db = new DatabaseSync(dbPath);

// Everything except banners / banner_offices / app_settings.
const TABLES_TO_CLEAR = [
    "employee_insights", "employee_background", "employment_history",
    "succession_candidate_attributes", "succession_candidates", "succession_seats",
    "employee_development_plans", "employee_achievements", "employee_periodic_assessments",
    "employee_competencies", "employee_career_steps",
    "employee_documents", "documents", "document_folders",
    "employee_targets", "banner_goals", "performance_cycles", "performance_grades",
    "proposal_assessments", "salary_proposal_whatifs", "salary_proposal_comparisons",
    "salary_proposal_compensation", "salary_proposals",
    "compensation_history", "employee_compensation",
    "departments", "org_edges", "employee_positions", "employee_scores",
    "employees", "positions", "functions",
];

const before = db.prepare("SELECT COUNT(*) AS c FROM employees").get().c;

db.exec("PRAGMA foreign_keys = OFF"); // must happen before BEGIN — SQLite no-ops a mid-transaction toggle

// node:sqlite has no db.transaction() helper (unlike better-sqlite3), so
// BEGIN/COMMIT/ROLLBACK are driven by hand instead.
db.exec("BEGIN");
try {
    for (const table of TABLES_TO_CLEAR) {
        db.exec(`DELETE FROM ${table}`);
    }
    db.exec("COMMIT");
} catch (err) {
    db.exec("ROLLBACK");
    throw err;
}

db.exec("PRAGMA foreign_keys = ON");
db.close();

console.log(`Removed ${before} employee(s) and everything attached to them (org chart, compensation, performance, proposals, succession).`);
console.log("The 8 built-in Central Group banners and their logos are untouched.");
console.log("Run `npm run seed:demo` to bring the sample roster back, or start entering real employees in the app.");
