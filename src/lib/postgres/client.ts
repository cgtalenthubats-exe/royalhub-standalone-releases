import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

// Local, embedded SQLite database — the standalone edition's replacement for
// the cloud edition's Postgres connection. query()/queryOne()/withTransaction()
// keep the exact same signatures AND the exact same Postgres-style "$1, $2, ..."
// placeholders as the cloud codebase, so every action file that calls them is
// completely unchanged — only this file's internals differ.
//
// Uses Node's own built-in node:sqlite (Node >=22.13) instead of the
// better-sqlite3 npm package: no native addon, so no node-gyp, no Python, no
// Visual Studio Build Tools ever required on a user's machine to install this
// app — a real, recurring installation blocker for non-technical users on
// Windows this replaces for good.
//
// node:sqlite is synchronous under the hood; query()/queryOne() stay `async`
// purely so calling code (which does `await query(...)` everywhere) doesn't
// need to change.

const DB_PATH = process.env.ROYALFLUSH_DB_PATH || path.join(process.cwd(), "data", "royalflush.db");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
    if (db) return db;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    return db;
}

// Converts Postgres-style "$1, $2, ..." placeholders — which may repeat, e.g.
// the same $1 used twice in one query — into SQLite's positional "?"
// placeholders, expanding the params array so each "?" gets the right value
// even where a $N repeats.
//
// Also handles Postgres's "= any($N)" idiom (an array parameter matched
// against a column) — SQLite has no ANY() function — by expanding it into
// "IN (?, ?, ...)" with the array's elements spliced in as individual
// params. This runs before the plain $N pass so it only ever sees
// still-untouched "$N" tokens.
function toSqlite(text: string, params: unknown[]): { sql: string; args: unknown[] } {
    const args: unknown[] = [];
    let sql = text.replace(/=\s*any\(\$(\d+)\)/gi, (_match, n: string) => {
        const value = params[Number(n) - 1];
        const arr = Array.isArray(value) ? value : [value];
        if (arr.length === 0) return "IN (NULL)"; // matches nothing, same as Postgres's `= any('{}')`
        const placeholders = arr.map((v) => { args.push(v); return "?"; }).join(", ");
        return `IN (${placeholders})`;
    });
    sql = sql.replace(/\$(\d+)/g, (_match, n: string) => {
        args.push(params[Number(n) - 1]);
        return "?";
    });
    return { sql, args };
}

// node:sqlite's `.all()` works for every statement shape — a SELECT returns
// its rows, and a plain write with no RETURNING just returns `[]` — so there
// is no need (unlike better-sqlite3) to branch on whether the statement is a
// reader before deciding `.all()` vs `.run()`; this mirrors how `pg`'s
// `query()` always returns a rows array too (empty for a plain write).
//
// node:sqlite also throws on a bound `undefined` instead of treating it as
// NULL (better-sqlite3's behavior) — converting it here keeps every existing
// call site that may pass an omitted optional field through unchanged.
function runStatement<T>(text: string, params: unknown[]): T[] {
    const { sql, args } = toSqlite(text, params);
    const stmt = getDb().prepare(sql);
    // Cast: SQLInputValue only names the types SQLite can actually bind, but
    // callers across the app pass `unknown` values (ids, strings, flags) in
    // already — the real type-level guarantee lives in those call sites, and
    // SQLite itself throws a clear runtime error for anything it can't bind.
    const sqliteArgs = args.map((v) => (v === undefined ? null : v)) as (string | number | bigint | Buffer | null)[];
    const rows = stmt.all(...sqliteArgs);
    // Each row comes back with a null prototype (not a plain {} object) —
    // React Server Components refuses to serialize those across to Client
    // Components ("Classes or null prototypes are not supported"), so every
    // row is rebuilt as a plain object here rather than at every call site.
    return rows.map((row) => ({ ...row })) as T[];
}

export async function query<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = []
): Promise<T[]> {
    return runStatement<T>(text, params);
}

export async function queryOne<T = Record<string, unknown>>(
    text: string,
    params: unknown[] = []
): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows[0] ?? null;
}

// For multi-statement writes that must succeed or fail together.
export async function withTransaction<T>(
    fn: (client: { query: <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]> }) => Promise<T>
): Promise<T> {
    const database = getDb();
    database.exec("BEGIN");
    try {
        const result = await fn({
            query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) => runStatement<R>(text, params),
        });
        database.exec("COMMIT");
        return result;
    } catch (err) {
        database.exec("ROLLBACK");
        throw err;
    }
}
