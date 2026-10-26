# OrgChart OCR Upload — Plan

Draft plan for a planned feature: upload a PDF/image org chart and have the system read it into the app's org chart, instead of adding people one by one. Not started — this is the design before implementation. Written 2026-08-05, revised same day after reading a real sample chart (see §2a).

---

## 1. Why this isn't "OCR" in the classic sense

The hard part isn't reading text out of boxes — it's recovering *who reports to whom* from box positions and connecting lines in a scanned/exported chart. Classic OCR (Tesseract-style text extraction) gets you the strings in each box but throws away the layout, so a second pass of custom geometry heuristics (box y-position = level, line endpoints = edges) would be needed on top — brittle, and breaks on any chart that isn't laid out in perfectly clean rows.

**Decision: skip classic OCR, use a vision-capable LLM to parse the whole page directly into structured JSON** (nodes + edges + confidence), in one pass. The model reads the image the way a person would — box text *and* which lines connect to which — rather than us reconstructing structure from raw OCR tokens after the fact.

**Model: Gemini**, matching what's already wired up in [`src/lib/ai.ts`](../src/lib/ai.ts) for Key Insights and Proposal AI Assessment (`generateJson`, model `gemini-3.1-flash-lite`, API key from `app_settings.gemini_api_key` via the Settings page). That function is text-prompt-only today; this feature needs a multimodal sibling that also sends inline file data (the Gemini SDK supports this — image/PDF bytes alongside the prompt in the same `generateContent` call). Reuse the same API-key setting and error-handling pattern rather than inventing a second AI plumbing path.

A real sample file confirms this decision was right for the wrong-if-underestimated reason: pulling the PDF's raw embedded text layer (not vision — just the text) came back with reading order scrambled relative to the visual boxes, plus stray glyphs (connector arrowheads misread as stray "k" characters) mixed into the names. A pure text-layer parse would have been actively misleading, not just structure-blind. Vision parsing of the rendered page avoids this entirely.

---

## 2. The two edge cases (flagged up front, before any implementation)

These aren't afterthoughts — they're the core design problem. A chart upload is nearly useless if it can only handle "every person is new."

1. **OCR finds a person who already exists in the system, but under a different banner or position** than what's currently stored. Needs a reconcile decision, not a blind overwrite — could be a real transfer, or could be the chart being stale/wrong.
2. **OCR finds a person who doesn't exist in the system at all.** Needs a create-new-employee path — but `createEmployeeFull` requires a real `office_id` (FK to `banner_offices`) and `position_id` (FK to `positions`), not free text (see [`employee-crud.ts:118-139`](../src/app/actions/employee-crud.ts)). The chart will only ever have *text* ("VP Product", "Selfridges — England"), so every new person needs their office/position resolved to a real row — reusing the wizard's existing quick-add flows ([`createCompanyOffice`](../src/app/actions/org.ts), [`createPosition`](../src/app/actions/positions.ts)) for anything that doesn't match.

Nothing here should ever auto-commit a match or a new row silently — see §5.

## 2a. What a real sample file added to the list

Tested against a real 10-page department-store org chart (GLOBUS — a company not currently in this app's banner data at all, ~150 people across Finance/IT/Sales/HR/Buying/Store Design/Marketing/Omni-Channel/Legal). It surfaced real cases the two above didn't cover:

3. **Multi-page charts repeat people across pages, not just once.** Each page here is one department's tree, but every page re-draws the reporting chain from the very top (Managing Director) down to that department — so the same senior people (Managing Director, department directors) appear as ancestor context on nearly every page. Parsing pages independently and matching each one only against the DB would create/match the same person multiple times within a single upload. **Fix: dedup extracted nodes against each other within the batch first (by name, before hitting the DB), then match the deduped set against existing employees.** This makes page-splitting (mentioned as a likely necessity going in) specifically a "merge these N page-extractions into one node set" problem, not a "process N independent charts" problem.
4. **Some people hold two positions at once ("in a dual role" in the source chart).** e.g. one person shown as both the org's overall root *and*, on another page, as the head of an unrelated department, explicitly annotated "In a dual role." The current data model is one `employee_id` → one `position_id`/`office_id` — it has no concept of a second concurrent role. **Decision (default, no strong preference given): on a detected dual-role duplicate, keep the node with the higher-level/primary position and drop the second node from auto-creation, surfacing it in review as a flagged "this person also appears in a second role we can't represent — handle manually" item.** Not silently discarded — visible, just not auto-actioned.
5. **Free-floating annotations attached to a node, not part of the tree structure** — small side-notes like "Retirement end of November 2026" or "Resignation end of September 2026," positioned next to a specific person's box but not a node or edge themselves. These map cleanly to fields the app already has (`status`, `resign_date`, `resignation_reason`) but the extraction schema in §3a below needs an explicit `note` field per node to catch them — a plain node/edge schema would silently drop this, and it's some of the most actionable HR information on the whole chart.
6. **Color-highlighted boxes with unclear meaning.** Some boxes in the sample are yellow-filled; nothing on the chart explains why (no legend). Asked the user — no strong preference on what it means. **Decision (default, no strong preference given): capture it as an opaque `highlight` flag per node (present/absent, plus the raw color if it varies), surface it in the review screen as "the source chart marked this — meaning unconfirmed," but don't map it to any app field or drive any auto-behavior off it.** Safer than guessing at semantics from box color alone; revisit once someone who knows the client's convention confirms it.
7. **The sample chart's own company isn't in this app's banner data at all.** Confirms the "new banner, not just new office" branch of edge case #2 is a real, not theoretical, path — the existing quick-add-office flow (already reused by the wizard) covers it, but the review screen needs to make "this isn't just a new person, it's a whole new company" obvious rather than surprising the reviewer with a wall of "+ New" prompts.
8. **Scale.** ~150 people in one upload is a lot more than a handful — the review screen (§3c) needs search/filter/collapse-by-bucket from the start, not as a later polish pass, or a big chart makes the review step itself the new friction point.

---

## 3. Pipeline

```
Upload PDF/image (possibly multiple pages/files for one org)
      │
      ▼
Gemini vision extraction, per page  →  { nodes: [...], edges: [...] }   (raw, unmatched)
      │
      ▼
Within-batch dedup  →  merge repeated nodes across pages (see §2a #3)
      │
      ▼
Server-side matching pass  →  each node tagged: matched / needs-review / new / unreadable
      │
      ▼
Review screen (human-in-the-loop, nothing written yet)
      │
      ▼
Commit  →  createEmployeeFull (new) / setEmployeeManager (edges) / quick-add office+position as needed
```

### 3a. Extraction

Send each page/file + a prompt asking for strict JSON:
```json
{
  "nodes": [
    {
      "id": "n1",
      "name": "Robert King",
      "position_title": "Chief Executive Officer",
      "banner_text": "Selfridges",
      "confidence": 0.95,
      "note": "Retirement end of November 2026",
      "highlight": true,
      "dual_role": false
    }
  ],
  "edges": [
    { "from": "n1", "to": "n2" }
  ]
}
```
`id` is a per-upload local key (the model's own node reference, unique only within one extraction call — the dedup step in §3b is what reconciles ids across pages), not a database id — nothing here is a real `employee_id` yet. `confidence` lets the review screen flag "the model wasn't sure it read this box correctly" separately from "the model wasn't sure who this maps to in the DB" (§3b) — two different kinds of uncertainty, both need to surface, neither should be conflated. `note`, `highlight`, and `dual_role` are the additions from §2a — all optional, all surfaced but not auto-acted-on except where §2a says otherwise.

### 3b. Dedup + matching (server-side, deterministic — not another AI call)

**Dedup first, within this upload only:** group extracted nodes by normalized name across all pages/files in the same upload before touching the DB (see §2a #3). Two same-named nodes with different positions get flagged as the dual-role case (§2a #4) rather than silently picking one.

Then, for each deduped node, look it up against `listEmployees()` (already excludes "Vacant" seats):
- **Name match found, banner + position also match** → `matched`, no action needed, just confirms the chart agrees with the DB.
- **Name match found, banner or position differs** → `needs-review` (edge case #1). Show old vs. new side by side; the reviewer picks "update" or "ignore, keep as-is."
- **No name match** (fuzzy — handle common OCR noise: missing middle names, accents, obvious typos) → `new` (edge case #2). Reviewer must resolve office + position before it can be created, same fields the Add Employee wizard already requires.
- **Ambiguous** (two+ existing employees with a similar name) → `needs-review`, force an explicit pick rather than guessing.
- **Low-confidence / illegible** (model itself flagged low `confidence`, or returned an empty name) → `unreadable`, shown separately, never auto-committed.

Name matching should be a plain fuzzy-string comparison (e.g. Levenshtein/trigram threshold), not a second LLM call — deterministic, auditable, and fast for what's likely a few dozen to a few hundred names per chart.

### 3c. Review screen

Given real charts can run to ~150 people (§2a #8), this needs to be a searchable/filterable list from day one, grouped into buckets, with one commit action at the end (nothing writes to the DB until the reviewer explicitly confirms):
- **Matched** (collapsed by default, just a count — "40 people already match, no changes")
- **Needs review** (banner/position conflicts, ambiguous names, dual-role duplicates) — each row needs an explicit decision
- **New** (edge case #2, including the "whole new banner" variant from §2a #7) — each row needs office + position resolved (dropdown, with the same "+ New" quick-add the wizard already has), and optionally a Reports To pick (this upload's own edges can pre-fill it: if the chart says node A reports to node B, and B is now a known employee_id, use it)
- **Unreadable** — surfaced, not silently dropped, no action possible except manual entry later

Nodes with a `note` (§2a #5) show it inline regardless of bucket, since it's actionable HR info (map to `status`/`resign_date` on commit if the reviewer confirms it). Nodes with `highlight` (§2a #6) show an unobtrusive marker with "meaning unconfirmed" — informational only.

The org chart's own two-dimension model (banner vs. function, see [`getOrgPlacement`](../src/app/actions/employees.ts:453)) means the chart-derived edges only ever populate the **banner** dimension automatically, same as the manual "Reports to" field added to the wizard — function-dimension reporting lines (e.g. a Head of Function role) still need to be set manually afterward, same as today.

### 3d. Commit

For each reviewed node:
- `matched`, no changes → skip
- `needs-review`, resolved → `setEmployeeManager` and/or a personal-info update, reusing existing actions
- `new` → `createEmployeeFull` with `manager_id` set from the resolved edge, same call the wizard already makes
- `unreadable` → never committed

No new server actions needed for the write side — this reuses `createEmployeeFull`, `setEmployeeManager`, `createCompanyOffice`, `createPosition` as-is. The new work is entirely the extraction + dedup + matching + review layer sitting in front of them.

---

## 4. Open questions (need an answer before implementation starts)

- **File size / page count limits** — a large chart PDF may need to be sent as multiple pages or downscaled; Gemini has its own inline-data size limits. Needs a concrete cap (existing document uploads elsewhere in the app cap at 20MB, see [`employee-documents.ts:8`](../src/app/actions/employee-documents.ts)). The real sample (10 pages, ~150 people, 359KB) is a reasonable baseline for what "normal" looks like.
- **Highlight-color meaning** — still unconfirmed (§2a #6). Treated as opaque/informational-only until someone who knows the client's convention says otherwise.
- **Storage** — does the uploaded PDF get kept anywhere afterward (audit trail / re-run later), or is it processed once and discarded? Leaning toward keeping it, given Document Center already exists for employee-level files.
- **Where does this live in the UI** — a new action on `/org/banner` (and presumably the other two dimension pages), or a standalone upload flow reached from there.

---

## 5. Explicitly out of scope for v1

- Auto-committing anything without a human review step (see §3c) — the edge cases are exactly why this can't be a one-click import.
- Representing true concurrent dual roles as two linked nodes for one employee — flagged for manual handling instead (§2a #4), not modeled.
- OCR'ing anything other than the org hierarchy itself and the note/highlight metadata in §2a (no attempt to also extract compensation, tenure, etc. from a chart — those stay manual/CSV-import as today).
