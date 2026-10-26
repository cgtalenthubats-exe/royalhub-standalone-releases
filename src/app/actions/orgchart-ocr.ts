"use server";

import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { generateJsonFromFile } from "@/lib/ai";
import { findBestNameMatch, nameSimilarity } from "@/lib/fuzzy";
import { createEmployeeFull } from "./employee-crud";
import { setEmployeeManager } from "./employees";

// ── Phase 1: extraction (Gemini vision, see docs/ORGCHART_OCR_PLAN.md) ─────
export interface ExtractedOrgNode {
    id: string;
    name: string;
    position_title: string | null;
    banner_text: string | null;
    confidence: number;
    note: string | null;
    highlight: boolean;
}
export interface ExtractedOrgEdge { from: string; to: string }

const EXTRACT_PROMPT = `You are reading an org chart from an uploaded file. This file very likely has MULTIPLE PAGES, each showing a different team or department (e.g. a top-level summary page, then separate pages for Finance, IT, Sales, HR, etc.) — you MUST read and extract from EVERY page of the document, not just the first one. Missing later pages is the single biggest mistake you can make here.

Extract every person box you can find, from ALL pages, into strict JSON matching exactly this shape:
{"nodes":[{"id":"n1","name":"...","position_title":"...","banner_text":"...","confidence":0.0,"note":null,"highlight":false}],"edges":[{"from":"n1","to":"n2"}]}

Rules:
- "id" is your own local reference per node (e.g. "n1", "n2"), unique within your response only.
- "name" is the person's full name as printed. If illegible, use an empty string and set confidence low.
- "position_title" is their job title as printed, or null if none shown.
- "banner_text" is the company/department/team name associated with that person if shown (e.g. a logo, header, or label near them), or null.
- "confidence" reflects how sure you are you read THIS box correctly (0.0-1.0) — not whether the person exists elsewhere.
- "note" captures any free-floating annotation clearly attached to this specific person (e.g. "Retirement end of 2026", "Resignation end of Sept 2026") — null if none.
- "highlight" is true only if this person's box is visually highlighted/colored differently from the plain boxes around it — the meaning is unknown, just report whether it's present.
- If the SAME person appears more than once across pages (e.g. a senior leader repeated as ancestor context on every page), output them only ONCE total — pick whichever occurrence has the most complete information, and draw edges from whichever page(s) actually showed a real reporting line to them.
- "edges" describe direct-report lines you can see drawn between boxes (from = manager's id, to = report's id). Only include an edge if you can see it actually connected by a line — do not infer reporting from vertical position or proximity alone.
Respond with JSON only — no prose, no markdown code fences.`;

export async function extractOrgChart(fileBase64: string, mimeType: string): Promise<{ ok: true; nodes: ExtractedOrgNode[]; edges: ExtractedOrgEdge[] } | { ok: false; error: string }> {
    const res = await generateJsonFromFile<{ nodes: ExtractedOrgNode[]; edges: ExtractedOrgEdge[] }>(EXTRACT_PROMPT, fileBase64, mimeType, 32000);
    if (!res.ok) return res;
    const nodes = (res.data.nodes || []).filter((n) => n && typeof n === "object");
    const edges = (res.data.edges || []).filter((e) => e && typeof e === "object");
    if (nodes.length === 0) return { ok: false, error: "Gemini didn't find any people on this chart — check the file rendered correctly." };
    return { ok: true, nodes, edges };
}

// ── Phase 2: matching (deterministic, server-side — not another AI call) ───
export type OcrBucket = "matched" | "needs_review" | "new" | "unreadable";
export interface AnalyzedOcrNode {
    localId: string;
    name: string;
    position_title: string | null;
    banner_text: string | null;
    confidence: number;
    note: string | null;
    highlight: boolean;
    parentLocalId: string | null;
    bucket: OcrBucket;
    matchedEmployeeId: number | null;
    matchedName: string | null;
    matchedBanner: string | null;
    matchedPosition: string | null;
    conflict: boolean; // banner or position text looks different from the matched employee's real record
    // "new" nodes only — pre-filled when position_title text-matches an
    // existing position, so the review screen doesn't force creating a
    // duplicate position for a title that's already in the master.
    resolvedPositionId: number | null;
}

// bannerId is the company the user picked before uploading (a chart is
// always exactly one banner) — it's the authoritative source for both
// position matching (positions are scoped per company now) and the
// matched/needs_review split, instead of trusting Gemini's per-node
// banner_text guess. banner_text is still surfaced to the reviewer as a
// soft cross-check, just not treated as ground truth anymore.
export async function analyzeOrgChartNodes(nodes: ExtractedOrgNode[], edges: ExtractedOrgEdge[], bannerId: number): Promise<AnalyzedOcrNode[]> {
    const [employees, banners, positionRows] = await Promise.all([
        query<any>(`select employee_id, name, position_title, banner_id, status from employees where status <> 'Vacant'`),
        query<any>(`select banner_id, name from banners`),
        query<any>(`select position_id, title from positions where banner_id = $1`, [bannerId]),
    ]);
    const bannerById = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));
    const parentByChild = new Map<string, string>(edges.map((e) => [e.to, e.from]));

    return nodes.map((n): AnalyzedOcrNode => {
        const base = {
            localId: n.id, name: n.name, position_title: n.position_title, banner_text: n.banner_text,
            confidence: n.confidence, note: n.note, highlight: n.highlight,
            parentLocalId: parentByChild.get(n.id) ?? null,
        };
        if (!n.name?.trim() || n.confidence < 0.5) {
            return { ...base, bucket: "unreadable", matchedEmployeeId: null, matchedName: null, matchedBanner: null, matchedPosition: null, conflict: false, resolvedPositionId: null };
        }
        const best = findBestNameMatch(n.name, employees, (e: any) => e.name);
        if (!best) {
            const posMatch = n.position_title ? findBestNameMatch(n.position_title, positionRows, (p: any) => p.title, 0.85) : null;
            return {
                ...base, bucket: "new", matchedEmployeeId: null, matchedName: null, matchedBanner: null, matchedPosition: null, conflict: false,
                resolvedPositionId: posMatch?.match.position_id ?? null,
            };
        }
        const matchedBanner = bannerById.get(best.match.banner_id) ?? null;
        // Ground truth is the banner the user picked before upload, not
        // Gemini's OCR'd label — far more reliable than a text-similarity
        // guess, since it's exactly what the chart was uploaded as.
        const bannerConflict = best.match.banner_id !== bannerId;
        const positionConflict = !!(n.position_title && best.match.position_title && nameSimilarity(n.position_title, best.match.position_title) < 0.5);
        const bucket: OcrBucket = (bannerConflict || positionConflict) ? "needs_review" : "matched";
        return {
            ...base, bucket, matchedEmployeeId: best.match.employee_id, matchedName: best.match.name,
            matchedBanner, matchedPosition: best.match.position_title, conflict: bannerConflict || positionConflict,
            resolvedPositionId: null,
        };
    });
}

// ── Phase 3: commit ──────────────────────────────────────────────────────—
// Only "new" nodes get created here — a "needs_review" conflict is left for
// a human to go resolve from that person's own profile (the same reconcile
// safeguard the plan calls for: never blindly overwrite an existing
// employee's banner/office from a chart read). "matched"/"needs_review"
// nodes are still included so their real employee_id is available for
// wiring up a "new" node's manager.
export interface CommitOcrNode {
    localId: string;
    action: "create" | "link_only" | "skip";
    employeeId: number | null; // known employee_id for "link_only" (matched/needs_review, kept as-is)
    name: string;
    office_id: number | null;
    position_id: number | null;
    status: string;
    parentLocalId: string | null;
}
export interface CommitOcrResult { ok: boolean; created: number; error?: string }

export async function commitOrgChart(nodes: CommitOcrNode[]): Promise<CommitOcrResult> {
    const idMap = new Map<string, number>();
    nodes.forEach((n) => { if (n.employeeId != null) idMap.set(n.localId, n.employeeId); });

    const toCreate = nodes.filter((n) => n.action === "create");
    let created = 0;
    for (const n of toCreate) {
        if (!n.office_id || !n.position_id) return { ok: false, created, error: `${n.name}: office and position must both be resolved before import` };
        const res = await createEmployeeFull({ name: n.name, office_id: n.office_id, position_id: n.position_id, status: n.status });
        if (!res.ok || !res.id) return { ok: false, created, error: res.error || `Could not create ${n.name}` };
        idMap.set(n.localId, res.id);
        created++;
    }
    // Second pass, now that every created node has a real employee_id: wire
    // up the banner-dimension manager from the chart's own edges, whether
    // the parent was an existing (matched) employee or another node created
    // in this same batch.
    for (const n of toCreate) {
        const empId = idMap.get(n.localId)!;
        const parentId = n.parentLocalId ? idMap.get(n.parentLocalId) : undefined;
        if (parentId) await setEmployeeManager(empId, "banner", parentId);
    }

    revalidatePath("/employees");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true, created };
}
