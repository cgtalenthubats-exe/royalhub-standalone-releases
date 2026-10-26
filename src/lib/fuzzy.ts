// Small standalone Levenshtein-based name similarity — no dependency, used
// only to flag *likely* duplicates during CSV import for a human to confirm,
// never to auto-merge/auto-skip anything on its own.
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const row = new Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;
    for (let i = 1; i <= m; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = row[j];
            row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
            prev = tmp;
        }
    }
    return row[n];
}

function normalizeName(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// 1.0 = identical (after normalizing whitespace/case), 0.0 = completely different.
export function nameSimilarity(a: string, b: string): number {
    const na = normalizeName(a), nb = normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const dist = levenshtein(na, nb);
    return 1 - dist / Math.max(na.length, nb.length);
}

// Best-matching existing name above threshold, or null. Threshold 0.82 catches
// typos/missing-middle-name/accent-drop ("Jon Smith" vs "John Smith", "Muller"
// vs "Müller") without over-flagging genuinely different people who happen to
// share a common surname.
export function findBestNameMatch<T>(name: string, candidates: T[], getName: (c: T) => string, threshold = 0.82): { match: T; score: number } | null {
    let best: { match: T; score: number } | null = null;
    for (const c of candidates) {
        const score = nameSimilarity(name, getName(c));
        if (score >= threshold && (!best || score > best.score)) best = { match: c, score };
    }
    return best;
}
