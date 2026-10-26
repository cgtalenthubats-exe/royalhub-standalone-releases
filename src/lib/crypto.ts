import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Application-layer AES-256-GCM for the compensation domain (see
// FEEDBACK_TRACKER.md's client infra/security item 1). The point of doing
// this in the app, not the database (e.g. pgcrypto), is that the decryption
// key never touches Postgres at all — someone with direct database access
// (an admin, a leaked credential, a compromised backup) sees ciphertext
// only. Encrypt right before a write, decrypt right after a read, as close
// to those two edges as possible.
//
// GCM is authenticated: decrypt fails loudly (throws) if the ciphertext was
// tampered with or the wrong key is used, rather than silently returning
// garbage.

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;    // recommended for GCM
const TAG_LENGTH = 16;

function key(): Buffer {
    const raw = process.env.COMPENSATION_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "Missing COMPENSATION_ENCRYPTION_KEY. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and set it as an env var (never commit it)."
        );
    }
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) {
        throw new Error(`COMPENSATION_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256) — got ${buf.length}.`);
    }
    return buf;
}

// Encrypts a UTF-8 string, returning a single base64 token: iv || authTag || ciphertext.
function encryptString(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function decryptString(token: string): string {
    const raw = Buffer.from(token, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---- typed helpers for the actual column shapes in play ----

// Every encrypted compensation figure is stored as a nullable numeric — most
// call sites just want "encrypt this number or pass null through unchanged".
export function encryptAmount(value: number | null | undefined): string | null {
    if (value == null) return null;
    return encryptString(String(value));
}

export function decryptAmount(stored: string | null | undefined): number | null {
    if (stored == null) return null;
    const n = Number(decryptString(stored));
    return Number.isFinite(n) ? n : null;
}

// salary_proposal_whatifs.compensation is a whole JSON object (a frozen
// Compensation snapshot), stored as one encrypted blob rather than per-field.
export function encryptJson(value: unknown): string | null {
    if (value == null) return null;
    return encryptString(JSON.stringify(value));
}

export function decryptJson<T>(stored: string | null | undefined): T | null {
    if (stored == null) return null;
    return JSON.parse(decryptString(stored)) as T;
}
