# Feedback Tracker — Discussion Round (17 items)

Source: latest discussion round. Base commit: `9263574` on `main`. **Current `main`: `c48bd0c`** (this file lagged 7 commits made directly on `main` outside this tracker — see "Untracked work" below, now reconciled).
Status legend: ✅ done · ⛔ declined · 🚧 in progress.

**16 of 17 original items are resolved** — 15 done, 1 declined. **Item 14 is the only one still open** (see "🚧 In progress" below) — 12 and 17 turned out not to need building after all.

Work has since moved past the original 17 onto real customer data (banners/logos, primary+concurrent positions, a Business Entity view) — see **"What's actually left"** at the bottom for the current picture.

Owner shorthand: **K.D** = assets/review to be supplied by K.D (external, blocks the item).

---

## 🔐 Access control (new feature, not in the original 17) — Phase 1 DONE

Requested separately: 3 login roles + hide compensation from non-privileged users.

**Phase 1 (shipped):**
- `app_users` table (migration `011`), username/password login (scrypt, no email), signed session cookie, middleware route-guard, user menu + sign-out in the nav.
- Roles: `super` (sees all) · `regular` / `dev` (compensation hidden).
- **Server-side redaction** — comp figures are NULLed in `listEmployees` / `getEmployee` / `getComparisonData` before leaving the server, so a restricted user can't read them even via DevTools. Restricted comp currently renders as "—".

**Setup to run it (local / Vercel env):**
1. Run `docs/migrations/011_app_users.sql` in Supabase SQL editor.
2. Add `AUTH_SECRET=<32+ random chars>` to `.env.local` (and Vercel env).
3. Seed the first super user: `node scripts/seed_admin.mjs <username> <password> "Name"`.

**Phase 2 (shipped):**
- Admin panel on /settings (super-user only): add / remove / hold users, set role, set per-user comp visibility (Default / Visible / Blurred / Hidden). Self-lockout guards.
- Client "blurred" pill (`<Money>` + a visibility context): compensation renders as a blurred masked amount ("blurred") or a "•••" mark ("hidden") instead of a bare "—". Adopted on the employees directory, comparison, and profile (hero + benefits card).

**Phase 3 (shipped):**
- **Write-protection:** every compensation mutation now calls `requireCompEditor()` (edit rights follow view rights — throws for blurred/hidden users) — `updateEmployeeCompensation`, all three `compensation-history` actions, and `updateProposalCompensation`. Server-enforced, so a non-privileged client can't write comp even by calling the action directly.
- Comp **edit UIs hidden** for non-editors: the Compensation & Benefits "Edit" button and the Compensation History add/edit/delete controls.
- ~~Proposals gated behind a full page redirect for non-comp users~~ — **superseded** (see "Untracked work" below): `/proposals` is now open to every role, with compensation redacted at the data layer instead — same pattern as Employees, and less disruptive than blocking the page entirely.

**Phase 4 (optional, later):**
- Extend the blurred treatment to the profile/proposal PPTX + HTML exports (currently "—"/empty for masked users — secure but unstyled).
- Broader authorization beyond compensation (e.g. who may edit employees / org / positions) if that's ever wanted — out of current scope.

## ✅ Done — original 17 items

### 2. YOS format → "11 Years 4 months" (DONE)
- **Shipped:** `formatYears()` in `src/lib/format.ts` returns calendar-based `"{Y} Years {M} months"` instead of the old decimal `"7.4 yrs"` — propagates everywhere tenure shows (profile, comparison, etc.).

### 5. Comparison — default ranking by Total compensation (max→min), keep manual rank (DONE)
- **Shipped:** `comparison_v2` columns default to total-compensation ranking (high→low) on load; a manual drag pins the order and disables auto-sort from then on (`comparison-v2-client.tsx`, `manualOrderRef`).

### 6. Comparison — remove the 4 top boxes (DONE)
- **Shipped:** the 4 summary stat boxes (Highest comp / Longest tenure / Newest in role / Largest team) above the scoreboard are removed.

### 13. Org chart — text is a bit small (DONE)
- **Shipped:** node name 13→15px, title 11→12.5px, node heights grown to fit (`org-chart-d3.tsx`).

### 3. Personal Info — Estimated Retirement + Age (DONE)
- **Decided:** retirement age is entered per employee (varies by country — not a fixed constant), and visibility follows a super-user gate mirroring `comp_visibility`.
- **Shipped:** migration `012` adds `employees.retirement_age` (editable per person) and `app_users.personal_visibility` (independent from comp — Default/Visible/Hidden, admin-panel toggle). Age + Estimated Retirement show on the profile's Personal & Employment card only when visible; redacted server-side too (defense in depth, same pattern as comp). Editing the retirement-age field is itself gated (`requirePersonalEditor`-equivalent check in `updateEmployeePersonal`).
- **Setup:** run `docs/migrations/012_retirement_age.sql` in Supabase (after `011`).

### 4. Export PDF — remove "key insight", add history instead (DONE)
- **Decided:** target is the employee profile export; add **both** career and compensation history (side by side, replacing the Key Insights section). The separate "Export HTML" button is retired too — only "Print / PDF" remains (both used the same template, so the content change applies to whichever is opened).
- **Shipped:** `export-profile-html.ts`'s Key Insights section replaced with two tables — Career History (from `employment_history`) and Compensation History (from `comp_history`, by fiscal year: Base/STI/LTI/Total). `profile-actions.tsx`'s "Export HTML" button removed.

### 7. Add "Adjusted package" to the Proposal (DONE)
- **Original ask (verbatim, no further detail given):** "Add Adjusted package to the proposal." Initially mis-scoped by this tracker as a new column on the Salary Review table specifically — confirmed by the user that the Comparison tab's what-if tool *is* the intended "adjusted package" feature.
- **Shipped:** on a proposal's embedded Comparison tab, "What-if scenario" edits any comp line item and labels the result `"{name} (adjusted)"`. It **persists** (migration `013_proposal_whatifs.sql` — base employee + frozen compensation snapshot, ordered alongside pinned peers) and **appears in the PPTX Peer Benchmarking slide**, tagged "What-if scenario" and interleaved with real peers in whatever order was set on screen (`comparison-v2-client.tsx`, `pptx-export.ts:498`).

### 12. Org chart — show upper & lower level (N+1 / N-1 context) (DONE)
- **Clarified (2026-07-30):** this turned out to already exist — the profile's Org Snapshot card (manager above, subject, reports below) and the org chart's own parent/children view are exactly this. Confirmed by the user, no new work needed.

### 10 & 11. Org by function cross-banner — real "Head of Function" + dotted-line reporting (DONE)
- **Decided (with a concrete example):** the synthetic top box is replaced by an actual employee — the person designated **Head of Function**. Other companies' function leads report to them: solid line if same company, **dotted line if a different company** (item 11's "dotted-line reporting" folded into this — the dotted line *is* the cross-company signal, not a separate matrix feature).
- **Key discovery:** `functions.global_head_id` already existed in the schema, marked "unused" — a leftover from before the function-tree-per-company redesign. Item 10 is effectively un-deprecating it, not adding anything new.
- **Shipped, without touching the "each company's function tree is independent" invariant:**
  - `getOrgTreeRaw` (renamed from the old `getOrgTree`) is untouched — org_edges stays exactly as independent as before, no cross-company edges are ever written.
  - New `getOrgTree` wrapper: when viewing one function across every company (filtered by function, not by company) and that function's `global_head_id` matches one of the current per-company roots, the *other* roots are composed as that head's children **in memory only** — real org_edges data never changes.
  - `org-chart-d3.tsx`'s `linkUpdate` detects a `banner_id` mismatch between a link's two ends and draws it dashed (`stroke-dasharray`) — automatic, no manual flagging needed.
  - New `FunctionHeadPicker` control on `/org/function` (shown only in the cross-company view) — a `<select>` of current candidates, calling `setFunctionHead()`. Mirrors the existing `departments.owner_employee_id` picker pattern already in the app.
  - No head assigned yet → falls back to today's synthetic labeled box, unchanged (nothing breaks for functions nobody has designated a head for).
- **Follow-up (2026-07-28) — a head may cover only *some* companies.** The first cut was all-or-nothing: assigning a head pulled every other company under them. The real case is e.g. "Head of HR sits in Nexus and also covers Orion, while Vertex runs HR on its own." First attempt added `function_head_scope (function_id, banner_id)` (migration `018`) to record which companies were in scope, composed onto the tree at read time — **superseded one exchange later** (see below) once it became clear this duplicated what a real `org_edges` row already does.
- **Layout correction (after first visual test):** out-of-scope companies were initially left as separate roots, which put their lead *level with* the head and forced a synthetic "Human Resources" box above everything. Fixed by placing them one level below the head like every other company lead instead — correct rank — with the connector **hidden** (`reports_to_parent: false`) so no reporting line is implied. This part of the design survived the redesign below unchanged.
- **Redesign (2026-07-28, same day) — dropped `function_head_scope`, use real edges instead.** Talking through a concrete new-hire scenario (a newly appointed Head of Finance whose direct reports sit in other companies) surfaced that the scope table was solving a problem `org_edges` already solves: a Head of Function's cross-company report is just an ordinary reporting line. Migration `019` drops `function_head_scope`; `setEmployeeManager` (the profile's Org Snapshot editor) and drag-and-drop no longer restrict the `function` dimension to the same company + function — any real cross-company (or even cross-function, e.g. a divisional head covering a different function too) edge is now allowed, checked only for cycles. `getOrgTree` simplified to: after real edges attach every actual report, whatever root is left over (nobody reporting to it at all) gets ranked below the head with no connector — the one case that still can't be a real edge, because by definition no relationship exists.
- Added: a **"Head of Function" toggle directly on the employee profile** (`function-head-toggle.tsx`), not just the `/org/function` dropdown — designating a head is as often a decision made from someone's own profile as from the chart.
- Extended `getEmployee()`'s `manager`/`reports` (shared by the profile's Org Snapshot card and the Proposal PPTX export) to merge in the function dimension: reports from either dimension show up (deduped), each tagged `cross_banner` so the connector renders dashed; a function-dimension manager is shown separately as `functionManager` only when it differs from the real (banner) manager, so the ordinary case where they're identical shows nothing extra.
- Links across the org chart, profile snapshot, and PPTX org slide all now agree on the same three states: hidden (no relationship), dashed (reports, different company), solid (reports, same company).

### Comparison export — add an org chart per employee, matching the Proposal's (DONE)
- **Ask:** the Comparison PPTX export shows personal/comp/performance detail per employee, but no org chart — the Proposal export's "Organization and Role" slide (manager above, subject, reports below) does this well and should be reused. Also confirm the Proposal's version actually handles the new cross-company/cross-function Head of Function relationships.
- **Shipped:** extracted the Proposal's org-snippet drawing into a shared `drawOrgSnapshot()` (manager → optional dashed-bordered functionManager → subject → reports), used by both exports now, so they can't drift apart again. Comparison gets one new "Organization" slide per employee. `drawElbow`'s per-child connector now takes a `dashedChild` flag (`dashType: "dash"` — verified against pptxgenjs directly, produces valid `prstDash` XML), driven by each report's `cross_banner` flag from the merged `manager`/`reports` (see above) — so both exports already reflect cross-company and cross-function Head of Function lines correctly, no separate work needed there.

### Org chart — dense levels are hard to read once expanded (DONE)
- **Ask:** a level with many direct reports sprawls into one long unreadable row when expanded; modern org-chart libraries auto-pack/group instead — figure out a sensible size threshold.
- **Shipped:** `d3-org-chart` already ships a "compact" layout (packs siblings 2-per-row zig-zag instead of one long row) that the code had hardcoded off. Now computed automatically — `compact` turns on once any level in the current view exceeds 7 direct reports — plus a toolbar "Compact" button to force it on/off/back-to-auto regardless of that threshold.

### Org chart — visual polish after first look at the compact/multi-root changes (DONE)
- **Ask, from a screenshot:** (1) connectors have rounded elbow corners — square would read cleaner; (2) the synthetic "Organization" box above several unrelated company roots (e.g. 3 CEOs) draws a visible line to each of them, which looks like a fake reporting relationship that isn't there; (3) same case — the roots should sit at one level with no implied hierarchy above them; (4) compact mode's packed pairs sit too far from the trunk line to read as one team; (5) the small subordinate-count badge is too small/low-contrast.
- **Shipped:**
  1. Overridden `layoutBindings.top.diagonal` with a plain right-angle (square) path generator instead of the library's fixed-radius curved one — same lead-in/offset handling, so compact-mode routing still lines up.
  2 & 3. The synthetic multi-root anchor now renders as a fully invisible node (near-zero size, no border/label, expand badge hidden) and every link into it is hidden the same way as a `reports_to_parent: false` link — so unrelated company roots simply sit side by side with nothing above or between them, instead of a labeled box with real-looking lines.
  4. Tightened `compactMarginPair`/`compactMarginBetween` (100→40, 20→12) so a compact-packed team reads as one block instead of scattered.
  5. Overridden `buttonContent` — bigger, bordered, brand-navy badge instead of the library's 9px muted-grey default.

### Org data integrity — employees created without reporting edges (FIXED, found while scoping the above)
- **Bug:** `createEmployee`, `createEmployeeFull` (the Add Employee wizard) and `importEmployeesCsv` inserted an `employees` row but **no `org_edges` rows at all**. `getOrgTree` walks edges, not employees, so those people were invisible on all three org charts — and with no node on the chart there was nothing to drag, making them unreachable from the UI entirely. `moveEmployee` uses `.update()`, which matches zero rows and reports success, so even a programmatic fix failed silently.
- **Found in live data:** 51 employees but only 50 banner / 48 function / 48 headcount edges — one Active employee had no edges at all, and two "(Vacant)" seats had only the one dimension `createVacantSeat` was called from.
- **Fixed:** all three creation paths now write edges for all three dimensions (banner + headcount take the manager; `function` only if that manager is in the same company *and* function, else NULL = root). Migration `018` backfills existing gaps with NULL parents so nobody stays hidden.

### Org editing — a second way to set who reports to whom (DONE)
- **Ask:** drag-and-drop on the chart was the only way to set a reporting line, which isn't enough — there should be an editable org section on the employee profile.
- **Shipped:** the profile's "Org Snapshot" card (previously read-only, banner dimension only) gets an **Edit** button opening a per-dimension manager picker (`getOrgPlacement` / `setEmployeeManager` in `actions/employees.ts`, `org-placement-editor.tsx`). Rejects self-selection and anyone in the employee's own subtree (cycle guard, server-side too); `function` parents are restricted to the same company + function. Uses upsert rather than update, so it also repairs an employee whose edge row is missing — the recovery path the bug above had no answer for. The card shows a "not connected to the org chart yet" hint when an employee has neither manager nor reports.

---

## ⛔ Declined

### 1. Pull each person's profile from LinkedIn (all fields except personal information)
- **Decided: not doing this.** Confirmed by the user — skipped.

---

## 🚧 In progress

### 14. New Org layout: N = focus, N-1 = Actual, N-2+ = vertical "Stack"
- **Clarified (2026-07-30), after 12 and 17 turned out not to be this after all** — full concrete spec, with a hand-drawn mockup:
  - **N** (the root(s) currently in view, e.g. 3 company CEOs side by side) stays exactly as today.
  - **N-1** (their direct reports) stays "Actual" — today's normal horizontal chart, unchanged.
  - **N-2 and everything below** renders as a **vertical stack**: each person in a small box, connected to the one above/below it by a line into the **left edge** of the box (not the usual top-center elbow) — recursively, for every level from N-2 down, not just N-2 itself.
  - Two layout modes only: **Compact** (already shipped — 2-per-row packing once a level gets too wide) and this new **Stack**. No third "spread everything wide" mode needed.
- **Also requested in the same message, all tied to this:**
  - PPTX exports (Comparison + Proposal) should use Stack for N-2+ too, since they have even less horizontal room than the screen.
  - **N-2 in the PPTX exports specifically** may need to collapse further into a single "X FTE" count box per branch rather than every individual name, given how tight the space is there.
  - **Proposal PPTX gets a new "Full Org" slide** — the subject's whole hierarchy, not just the brief manager/reports snippet the Organization slide already has.
  - **Employee profile gets a new "Full Org" button** next to the existing Org Snapshot, opening the same N / N-1 / N-2-stack view for that person.
- **Also fixed while looking at this (see commit `4d9e3c2`):** the PPTX Organization slide's report list was silently dropping anyone past the 6th (found because Robert King's slide was missing Nay A) — now wraps onto more rows instead of truncating; also added the company name to every person box in that snippet.
- **Open technical question before building the Stack layout itself:** d3-org-chart (the library backing the interactive chart) computes one tree layout for the whole chart — it has no built-in way to render N and N-1 in the normal top-down style while N-2+ switches to a vertical, left-connected list in the same chart. The two realistic paths:
  1. Keep N/N-1 as real, individually-draggable chart nodes (as today), and render each N-1 node's entire N-2+ subtree as static HTML *embedded inside that N-1 node's own box* (the box grows taller to fit the list). Matches the mockup closely, but means people at N-2 and below aren't full drag-and-drop chart nodes anymore while Stack is on — you'd navigate to their profile to reassign them there instead.
  2. Use the library's native `layout("left")` direction for the *entire* chart in Stack mode (fully supported out of the box, so much less custom code) — but that also turns N and N-1 into the vertical style, not just N-2+, which doesn't quite match "N-1 = Actual."
  - **Both built side by side (2026-07-30) so they could be compared visually before picking one** — turned out approach (1)'s interactivity concern was unfounded: the embedded list rows carry `data-node-id` just like real chart nodes, so the existing pointer-based click/drag handlers (which look elements up by that attribute, not via d3's own node registry) work on them unchanged. Toolbar gets a **Stack V1** / **Stack V2** button pair (clicking the active one again reverts to normal); the existing Compact button is disabled outside normal mode.
    - **Stack V1**: N (real roots) and N-1 stay real, draggable chart nodes. Chart data is filtered to depth ≤ 1 before being handed to d3-org-chart at all; each N-1 node's entire N-2+ subtree is pre-rendered as a static indented list (`renderStackList`) inside that node's own box, which grows taller to fit (`subtreeRowCount × 20px`).
    - **Stack V2**: the whole chart's `.layout()` flips to the library's native `"left"` direction (children as a vertical column, connector into the left edge) — far less custom code, but N and N-1 flip to the vertical style too, not just N-2+.
    - Both directions needed their own square-corner override (`layout.top.diagonal` for normal/V1, `layout.left.diagonal` for V2 — the library calls these different functions, `diagonal` vs `hdiagonal`, per direction).
- **First-look fixes (2026-07-30):**
  - **Collapse made the whole chart disappear.** The library's own `collapseAll()` collapses the root itself too (`initialExpandLevel(0)`) — fine when the root is a real, visible person, but when it's our invisible synthetic multi-company anchor (see item 10&11's entry above), that left nothing on screen at all. Replaced with a custom handler that always leaves the true top-level people visible and only collapses below them.
  - **Simplified to exactly 3 peer modes** — dropped the separate "normal, uncompacted" state and the auto/manual Compact toggle entirely. The toolbar is now a straight 3-way choice: **Compact** (default) / **Stack V1** / **Stack V2**, exactly one active at a time.
  - **Added an "N FTE" corner badge** to every person box in both PPTX exports' org snippet (manager, function manager, subject, and each report) — `getEmployee()`'s manager/functionManager/reports now carry `team_size` (reusing the same `teamSizeMap()` already computed there).
  - **Added a "Full Org" button** next to Edit on the profile's Org Snapshot card — opens the *actual interactive chart* (drag-and-drop, all three layout modes) rooted at that one person, via a new `getEmployeeFullOrg(employeeId, dimension)` action that finds that person in the raw tree and re-flattens just their subtree.
  - **Connector styling matched to the org chart's convention** in the two remaining on-screen org snippets that had drifted from it: the profile's Org Snapshot card (light grey `slate-300` lines, no dashed handling on the manager/functionManager connectors) and — found while fixing that — the Proposal detail page's own separate "Organization" card, which turned out to be missing the functionManager row and cross-company dashing entirely (a second, older copy of the same UI that the earlier `cross_banner`/`functionManager` work never reached). Both now draw solid black connectors, dashed for a cross-company link, matching `org-chart-d3.tsx` and the PPTX exports (which already did this correctly).

---

## ✅ Beyond the 17 items — real-data prep, node redesign, file handling (2026-07-30)

Triggered by the first real customer data (8 banners, 35 employees) arriving as CSVs.

### Org chart node redesign (DONE)
- Card now leads with the **company** — logo on top (when uploaded), short name beneath — then position, then the person's name, with the headshot moved to the top-right. Matches the supplied mockup.
- **FTE** promoted to its own labelled row on every card (headcount dimension keeps its real people+departments rollup; other dimensions show the subtree seat count, computed client-side so Stack V1 still counts nodes it hides from d3).
- Expand/collapse is no longer a bordered box hanging below the card — `buttonX/buttonY` pull it inside the card's bottom-right corner, the backing rect is transparent, and it renders as a bare count + chevron.
- Card dimensions unified across all three dimensions (taller when a logo is present).

### Company (banner) master data (DONE)
- Migration `020`: `banners.short_name` + `banners.logo_url` (short_name backfilled from `name` so nothing renders blank).
- Migration `021`: `banner-logos` Storage bucket.
- New **Companies & logos** card on `/settings` — edit each company's name/short name, upload or replace its logo, remove it. Replacing a logo deletes the previous file so the bucket doesn't accumulate orphans.

### Upload bug — everything over 1 MB was silently rejected (FIXED)
- **Reported as** "the documentation page can't upload files."
- **Root cause:** every upload in the app posts FormData through a Server Action, and Next.js caps those bodies at **1 MB by default**. The actions advertise 5–20 MB, so the request died before their own size check ever ran — and any real template PDF/PPTX is over 1 MB.
- **Fixed** with `experimental.serverActions.bodySizeLimit: "25mb"` in `next.config.ts`. This also un-breaks résumé, JD-PDF and profile-photo uploads, which had the same invisible ceiling.

### File descriptions + dates (DONE)
- `documents.description` (migration `021`). Captured in a dialog **at upload time** rather than bolted on afterwards, editable later without re-uploading, shown as its own column. The list now shows both the original upload date and the last-updated date.

### Per-employee documents (DONE)
- Migration `021`: `employee_documents` table + `employee-documents` bucket (PDF/Office/images).
- New **Documents** card on the employee profile with the same filename/description/date treatment.
- Deliberately separate from the shared Document Center (different scope) and from `employees.resume_url` (a single dedicated CV slot, not an open-ended list).

### Folders + inline preview, Google-Drive-style (DONE, 2026-08-03)
- Migration `022`: one `document_folders` table shared by both surfaces — `employee_id IS NULL` = the shared Document Center's tree, a real `employee_id` = that person's own tree (the two never mix, same split as `documents`/`employee_documents`). `folder_id` added to both `documents` and `employee_documents`.
- New shared `<FileBrowser>` component (`src/components/file-browser.tsx`) used by **both** `/documentation` and the profile's Documents card: breadcrumb navigation, folder tiles (create / rename / delete — delete only allowed when empty, no silent cascade), a "move to folder" picker, and upload-into-current-folder.
- New shared `<FilePreviewDialog>` (`src/components/file-preview-dialog.tsx`): clicking a file now opens an inline preview instead of just linking out — PDFs and images render directly, Office files (PPTX/DOCX/XLSX/DOC/XLS) go through Google's public document viewer (works because both Storage buckets are public), anything else falls back to Download/Open buttons only.
- `src/app/actions/document-folders.ts` (new): `listFolders`/`createFolder`/`renameFolder`/`deleteFolder`, generic over both scopes. `moveDocument`/`moveEmployeeDocument` added alongside the existing upload/delete/description actions.

---

## ✅ More done — clarified 2026-07-26

### 8 & 9. JD storage by position (DONE)
- **Decided:** plain text (option A — no new dependency), position-level (not per-proposal — a proposal always references a position, so the JD lives there and every proposal for that position sees the same one). PDF attach is view-only, no parsing — just "click to open the original."
- **Shipped:** migration `017` adds `positions.jd_content` + `positions.jd_pdf_url` (+ a `position-jds` Storage bucket, PDF-only, same upload pattern as résumés). The Positions page edit dialog gets a JD textarea + PDF picker. On a Proposal, the Role Description card shows a **"View original job description"** link (resolves to the new position if one's being proposed, else the employee's current position) that opens a dialog with the position's JD text and/or a link to the attached PDF.
- **Setup:** run `docs/migrations/017_position_jd_and_documents.sql` (after `016`).

### 15. Document Center (DONE) — turned out to be a different feature than first scoped
- **Clarified:** not employee-linked files with tags (the original guess) — a **freestanding shared library** for template documents (PDF/PPTX/DOCX/DOC) the team uses often. A new **`/documentation`** page, open to every signed-in user, with free upload / replace (overwrite in place) / delete — no restrictions.
- **Shipped:** new `documents` table + `documents` Storage bucket (same migration `017`), `/documentation` page + nav link, list view (name, size, uploaded by, updated date) with per-row Replace/Delete.

---

## ⛔ Blocked on external input (K.D)

### 16. K.D brand assets for PPTX export (DONE)
- **Received & applied:** real CGE templates uploaded (`APPOINTMENT & COMPENSATION REVIEW_CGE_Template_2026.pptx`, `New CG Template with Color Code - Aptos.potx`). Compared against `pptx-export.ts` and confirmed, then applied all 4 pieces:
  1. **Colors** — theme's accent1/dk2 (`#156082` / `#0E2841`) replace the app's own navy/gold across `pptx-export.ts` + both HTML exports (profile, comparison).
  2. **Font** — `Aptos` (ships with Office 2021+/365) applied to every text run via a font-injecting wrapper around `addText`/`addTable` (pptxgenjs has no presentation-level default; each run's own `fontFace` wins).
  3. **Logo** — the "CENTRAL GROUP" wordmark, extracted from the template's own `slideLayout` assets (not obvious from the slides themselves), saved to `public/brand/central-group-logo.png`. Placed big on the new Cover slide, small as a corner watermark on every content slide (PPTX exports only — the app's own nav keeps its Royal Flush identity, confirmed).
  4. **Deck structure** — the Proposal PPTX (`exportProposalPptx`) now matches the template's 7-slide shape: added **Cover** and **Agenda** slides at the front, and an **Other Considerations** slide at the end (placeholder until a form field exists to fill it). Page numbering matches the template's own absolute count (Agenda = page 2, etc).
- **Fonts note (confirmed correct):** the export server never renders glyphs — `pptxgenjs` only writes the font's name into the file. Aptos is standard on modern Office, so this is a non-issue as discussed.
- **Verification done:** TypeScript clean, a standalone Node script exercising the same pptxgenjs calls (colors, logo `addImage`, font wrapper, tables) ran without error and produced a structurally valid OOXML file. **Not verified:** exact visual/pixel layout — this sandbox's LibreOffice can't render either the source template or our own output (headless conversion fails in this environment on both), so open the exported deck in real PowerPoint to confirm spacing, especially the corner-logo/page-number footer area and the new Cover/Agenda slides.

### 17. K.D to review … (DONE — closed 2026-07-30)
- Item text was incomplete in the source, and this tracker paused it for a while not knowing what it referred to. Confirmed by the user: "K.D" = a client (Khun Dee) who has completed their part of this item already. Closing with no further tracked work.

---

## 🆕 Untracked work — 7 commits made directly on `main`, outside this tracker

None of these are from the original 17 items. Found by comparing `main` (`c48bd0c`) against where this tracker last knew about (`4f1027d`) — reconciled into the sections above where they touch a tracked item (see #7's Comparison-tab progress and the Phase 3 Proposals-gating supersession).

- **`8bd20e9`** Proposals opened to every role (comp redacted at the data layer instead of blocking the page) + the comparison board (peers/what-ifs/order) now persists to a new `salary_proposal_whatifs` table instead of living only in React state.
- **`67c0be4`** Fix: serialize comparison-board persist calls so two saves in flight can't finish out of order and silently drop the more recent one.
- **`f13f03a`** Replace the comparison board's auto-save with an explicit **Save** button (auto-save was the source of the race in the previous fix).
- **`0edab2b`** Move the Save button next to Add People; guard tab switches inside a proposal when the board has unsaved changes.
- **`e5f1cd7`** Extend that unsaved-changes guard to top-nav navigation too (new shared `unsaved-changes.tsx` context) — leaving via the nav bar with unsaved comparison changes now confirms first.
- **`5ccf112`** Replace "Add Employee" with a multi-step onboarding wizard (`add-employee-wizard.tsx`) — quick-add a company/position inline, capture starting compensation history, attach a résumé (migration `015`, new `employee-resumes` bucket).
- **`2079012`** Wizard follow-up: gender field (migration `016`), searchable comboboxes (new `combobox.tsx` + `countries.ts`), more quick-add polish.
- **`c48bd0c`** Fix: STI/LTI are entered as a **% of base salary**, not raw euro amounts (wizard + compensation-benefits card).

**Migrations added by this work:** `014_proposal_board_saved_by.sql`, `015_employee_resume.sql`, `016_employee_gender.sql` — run these (after `011`–`013`) if not already applied.

---

## 🆕 Client infra & security feedback (2026-08-17) — item 4 done, item 1 next

Raised by the client after reviewing the infra/security notes prepared for them (deck: `Royale_Flush_Azure_Migration_Security_Proposal.pptx`, audit reference: `Royale_Flush_Database_Audit_Reference.pdf` — both handed to the client, not committed to this repo). Priority order below is by impact/size; **execution order agreed 2026-08-18 is item 4 first, then item 1, with 2 and 3 deferred** — item 4 is the largest and has the longest lead time (start it while it can't block or be blocked by anything else), item 1 is fully scoped and ready, and neither touches Azure AD/2FA at all so both proceed without waiting on the client. **Items 4 and 1 are both done. Items 2 and 3 remain deferred — not started.**

1. **[Priority: highest] Column-level encryption for the compensation domain (DONE — 2026-08-23)** — distinct from the existing app-layer role-based redaction (which only protects data going out through the web app, not someone with direct database access). Scope: `employee_compensation`, `compensation_history`, `salary_proposal_compensation`, `salary_proposal_whatifs` — 12 columns total (base salary, STI/LTI target/max/actual amounts, total comp, the proposed-figures equivalents, and the what-if scenario blob).

   **Shipped:** application-layer AES-256-GCM (`src/lib/crypto.ts`, `src/lib/compensation-crypto.ts`) — key lives only in the app's `COMPENSATION_ENCRYPTION_KEY` env var, never in Postgres, so direct database access exposes ciphertext only. Migration `029` converts the 12 columns from `numeric`/`jsonb` to `text`. All 4 consuming action files (`employees.ts`, `employee-crud.ts`, `compensation-history.ts`, `proposals.ts`) encrypt on write / decrypt on read.

   **Rollout (2026-08-23):** schema migration applied, then the one-time re-encryption of existing data run via a manual GitHub Actions workflow (`.github/workflows/encrypt-compensation.yml`) — 198 rows / 1519 numeric cells encrypted across the 4 tables — then the encryption-aware app code merged to `main` and deployed. Verified end-to-end on production: figures display correctly (decrypt on read), a direct DB check confirmed the stored values are ciphertext not plaintext, and editing a compensation figure through the UI round-trips correctly (encrypt on write).

   **Bugs hit and fixed during rollout, not part of the app code itself:**
   - The GitHub Actions workflow file's `name:` had an unquoted value containing `: ` (`One-time: Encrypt existing compensation data`), which is invalid YAML — quoted it.
   - `DATABASE_URL` initially pointed at Supabase's **direct connection** (IPv6-only) — GitHub Actions runners have no outbound IPv6 route to it (`ENETUNREACH`). Switched to the **pooler** connection string.
   - First pooler attempt used **Session pooler** (port `5432`, `pool_size` capped at 15, connections held for the whole session) — production briefly went down (`EMAXCONNSESSION`, users couldn't log in) because concurrent Vercel serverless instances exhausted the 15-connection cap almost immediately. Fixed by switching to the **Transaction pooler** (port `6543`, connections multiplexed) in both Vercel and the GitHub Actions secret — matches what production was already using before this incident.
   - A DB password reset (needed because the original was lost) had to be propagated to both Vercel (all environments) and the GitHub Actions secret, with a redeploy, before either would work again.
2. **[Priority: high] Login → Azure AD (Microsoft Entra ID) SSO**, replacing the current username/password (`app_users` + scrypt) system entirely. Client wants one admin to control who can sign in via Azure AD's own "user assignment required" setting on the app's Enterprise Application — no separate allow-list needs building in-app. Implementation is standard OAuth/OIDC against the Microsoft identity platform (e.g. NextAuth.js/Auth.js's Azure AD provider). Confirmed with the client this does **not** touch the role/`comp_visibility`/`personal_visibility` model or the redaction logic at all — only `app_users`' identity column (drop `username`+`password_hash`, key on the person's Azure AD email instead) and the login/session flow change.
3. **[Priority: medium, pairs with #2] 2FA (TOTP, e.g. Google/Microsoft Authenticator)** — client explicitly asked for it. Open standard, no external service dependency, no cost — just dev time. Natural to bundle into the same auth-rework pass as #2.
4. **[Priority: medium-high, but start early — largest item] Rewrite the data-access layer off PostgREST entirely**, proactively, ahead of any client confirmation. Decided as a pre-emptive move: rather than wait on whether the client's target environment (Azure or otherwise) can install PostgREST — an answer that could take a while and eat into limited runway — do the rewrite from the Supabase REST-style query builder (`db.from(table).select()...`) to a raw Postgres SQL client now, so migration day (with or without PostgREST available) needs no further code work. Real engineering effort, not a config change — every rewritten query must reproduce PostgREST's auto-join behavior by hand (explicit JOINs) and return the exact same shape of data the rest of the app already expects, so display logic and business logic need zero changes. Does **not** require maintaining two parallel implementations — once done, PostgREST is dropped entirely and raw SQL is the only path, on Supabase or any other Postgres host.

   **DONE — 2026-08-19 to 2026-08-21.** All **25 files** converted: `src/app/actions/{ai-assessment,app-users,auth,banners,compensation-history,departments,document-folders,documents,employee-crud,employee-documents,employee-positions,employees,employment-history,insights,org,orgchart-ocr,performance,photo,position-jd,positions,proposals,resume,settings,succession}.ts` + `src/lib/auth/current-user.ts`. Zero `db.from(...)` PostgREST calls remain anywhere in the codebase (verified by grep) — the 6 files that still import `adminAuthClient` (photo, resume, position-jd, banners, documents, employee-documents) only use it for Supabase **Storage** upload/`getPublicUrl`, a deliberately separate concern from this rewrite (storage migration is its own future phase, not started).

   Infra built: `pg` + `@types/pg`, `src/lib/postgres/client.ts` (`query`/`queryOne`/`withTransaction` over a `pg.Pool`), reads `DATABASE_URL` (set in Vercel for Production **and** Preview — the two were briefly pointed at the same database, since fixed by design intent even though a dedicated Preview database hasn't been provisioned yet).

   Verified working end-to-end on production, not just typechecked: `departments.ts`, `auth.ts`/`current-user.ts` (real login flow), `employees/[id]` (full profile — comp, performance, positions, org snapshot, insights), `proposals/[id]` including its PPTX export. Every write path (`INSERT ... ON CONFLICT`) was checked against the table's actual PK/unique constraint in `docs/SCHEMA.md` or the migration file itself, not assumed. Typechecks clean against the project's pre-existing 9-error baseline (all in unrelated files) throughout.

   **3 real bugs found and fixed during production rollout (2026-08-21–23) — not caught by typecheck, only by live testing:**
   1. **Pool sizing, twice.** `max: 10` (default) briefly exhausted Supavisor's 15-connection budget under concurrent traffic → the client's reported ~1s per-navigation lag. Overcorrected to `max: 1`, which then serialized every query in a request onto one connection — fine for light pages, but a proposal's comparison board (a full `getEmployee()` — a dozen-plus queries — per peer) blew past `connectionTimeoutMillis` and 500'd. Settled on `max: 5`.
   2. **`int8`/`numeric` columns returning as JS strings**, not numbers — `pg`'s default (avoids precision loss `pg` can't know is safe here). Broke `signSession`'s `typeof uid === "number"` check outright (silent login-redirect loop, no error shown) and would have silently string-concatenated compensation math (`"170000" + "68000"` → `"17000068000"`) once real data hit the untested paths.
   3. **`date`/`timestamp`/`timestamptz` columns returning as JS `Date` objects**, not strings — `pg`'s default. Broke any code calling string methods on a date field directly (e.g. `(start_date || "").localeCompare(...)`) — surfaced as a client-side crash on `/employees/[id]`.

   All three fixed once, centrally, in `client.ts` (`pg.types.setTypeParser` for OIDs 20/1700/1082/1083/1114/1184/1266, plus the pool `max`) — no per-file patching needed. Take-away for anything hand-rolling a Postgres client going forward: **`pg`'s default type coercion does not match PostgREST/Supabase-js's JSON-based one** for bigint, numeric, and date/time columns specifically; check this class of bug first if a raw-SQL migration passes typecheck but breaks at runtime.

   **Known gap, not yet addressed:** Preview and Production still share one Supabase project/database (should be two separate databases — flagged independently by the client's own architect during a spec-review call). **Deferred (2026-08-23) to the Azure migration itself** rather than fixed on Supabase now — will be addressed as part of standing up separate Prod/Non-Prod environments on Azure.

   **Azure migration proof-of-concept — DONE and now live (2026-08-23).** Purpose: prove to RIS the app actually runs on Azure before they provision the real environment(s). Built entirely from this dev environment, on a self-serve Azure account (resource group `RoyalFlush_NPROD`), not something RIS provisioned:
   - **Azure Database for PostgreSQL Flexible Server** (`royalflush-nprod-pg`, Burstable B1ms, within the free-tier quota) — a real Postgres, so the raw-SQL client above needed zero code changes, only a new `DATABASE_URL`.
   - **Azure Blob Storage** (`royalflushnprodst`, 6 containers matching the old bucket names) — this *did* need code: `src/lib/azure/storage.ts` wraps `@azure/storage-blob` behind the same shape as Supabase Storage's `db.storage.from(BUCKET)` (`.upload`/`.getPublicUrl`/`.remove`), so the same 6 files from item 4's "not started" storage phase needed only an import swap. `src/lib/supabase/{admin,client,server}.ts` deleted — the app now has zero remaining Supabase runtime dependency of any kind.
   - **Full data migration** (not just schema): a `pg_dump`/`psql` restore of the whole `public` schema plus a script copying every object across all 6 Storage buckets, both run via one-off manual GitHub Actions workflows (`.github/workflows/{migrate-to-azure,test-azure-storage}.yml` — this sandbox has no outbound network access to either Postgres or Azure Blob, so GitHub Actions runners stood in). Non-trivial to get working — real issues hit and fixed along the way: `pg_dump` version-vs-server mismatch (needed `postgresql-client-18` from PGDG, not apt's default 16), PG15+'s `CREATE SCHEMA public` colliding with the target's already-existing one (`--clean --if-exists`), Supabase's built-in `anon`/`authenticated`/`service_role` roles not existing on a vanilla Postgres (stub them first), and — the sneaky one — the storage-copy script silently "succeeding" with 0 files copied because the **anon** key can download public objects but can't **list** a bucket (that's gated by RLS separately from the public-read flag); switched to the service-role key and added a hard failure if a run ever reports 0 files again, so this can't silently recur.
   - **Cut over and verified live**, not just provisioned and left idle: merged to `main`, Vercel's `DATABASE_URL` and new `AZURE_STORAGE_CONNECTION_STRING` pointed at Azure, redeployed. Verified for real, not assumed: edited an employee's name directly on the Azure database via Cloud Shell psql and watched it change on the live production page: employee 1's name is deliberately left as **"Robert King (AZURE TEST)"** on production right now — intentional, kept as visible proof for the client, not reverted. Photo upload verified separately as landing in Azure Blob too.
   - **This environment is being treated as Non-Prod (NPROD)**, not the client's real Production — no one is using the live system yet, so it was safe to do all of this directly. The real Prod environment is still RIS's to provision; once they do, **migration will run twice with different intent**: NPROD gets today's dummy/demo dataset copied over again fresh (mirroring this run), Prod gets schema-only (empty tables) so the client's own team enters their real data from scratch — never copying today's placeholder employees into it.
   - **Not yet done:** rotate the Azure DB password and Storage account key (both were pasted into this chat at least once during setup — not a secret leak in the traditional sense since this is a throwaway NPROD credential, but still good hygiene before this environment is treated as anything longer-lived); tighten the Postgres firewall back down now that the bulk migration is done (the temporary "allow all IPs" rule has already been removed).

## What's actually left

Migrations `011`–`021` are all applied to the live project as of 2026-07-30. (`018`/`019` are a churn pair — `018` added `function_head_scope`, `019` drops it the same day — so only `019`'s end state matters when applying fresh.) **Migration `022` (folders) is new as of 2026-08-03 and not yet applied — run it before the folder feature will work against the live database.**

### Blocked on a decision or on data

1. ~~**Primary / concurrent positions — the seat model.**~~ **DONE (2026-08-10, migration 026).** Built as designed: `employee_positions (employee_position_id, employee_id, position_title, function_id, banner_id, office_id, is_primary)`, `org_edges` keyed on `employee_position_id`. Someone holding two positions is two nodes, each independently placed (own company/office/manager), in every dimension. FTE counts each seat separately. `employees.*` job columns kept as a synced "primary position cache" so the ~15-file display-only impact never materialized — only the org-tree/counting code and the org-edge mutators needed to change. New Positions card on the employee profile lets HR add a concurrent position directly. See `docs/SYSTEM_AUDIT.md`'s 2026-08-10 entry for the full writeup.
2. ~~**Performance Management — recording goals and achievement.**~~ **PHASE 1 DONE (2026-08-13, migration 027).** Requested as: record what targets/goals each company has, then what each person set and achieved, viewed on something org-chart-shaped with a bottom panel for entering achievement and a progress bar. Built as `performance_cycles` → `banner_goals` → `employee_targets`, on a new top-level **Performance** nav tab with Overview / Company Goals in-page tabs. **Three decisions taken with the client up front:** (a) targets attach to a **seat** (`employee_position_id`) not a person, so a concurrent position at another company keeps its own set and the per-company view stays clean; (b) achievement is **target value + actual value + unit** with a manual `progress_pct` override for goals that aren't numeric; (c) cycles are **annual**, matching `performance_grades.fiscal_year`. Beyond the brief, the chart's node colour doubles as a completion signal (grey = no targets), which answers the thing HR actually spends time chasing — who hasn't set theirs — plus an "N/M seats have targets" KPI and an "N targets aligned" count per company goal so a goal nobody picked up is visible. **Cycles and PPTX export landed the same day** (both raised as "what's missing"): a New cycle dialog that creates the next FY and copies the previous year's objectives and targets forward with achievement cleared, plus two purpose-built exports — a company deck and a per-person sheet — replacing the generic org-chart PPTX button that carried no performance data at all. Viewing past years is the existing cycle dropdown; **a side-by-side year-over-year comparison was explicitly declined** as more work than it's worth for now. Still open for phase 2: check-in history, manager approval / self-assessment, deriving the year's grade from the rollup, and reminders for people who haven't set targets. See `docs/SYSTEM_AUDIT.md`'s 2026-08-13 entry.
3. ~~**Importing the real 35-employee data.**~~ **DECLINED (2026-08-23) — out of scope for this engagement.** The client will import it themselves; the data is confidential and not something to hand to this development process.
4. **Business Entity tab.** A new org-chart-style view of which legal companies sit under each brand and at what % holding. Waiting on the data. **Design flag raised and unanswered:** ownership is a DAG, not a tree — one company can have several shareholders, which `d3.stratify()` rejects outright. Either pick the majority owner as the tree parent and draw the rest as dashed connections, or restrict to one owner per entity if the real structure allows.

### Item 14 — DONE (2026-08-23, scope closed)

Shipped: **Stack V1 / Stack V2** layout modes on screen (3-way toolbar with Compact, exactly one active), and the **Full Org** button on the employee profile.
**Explicitly declined (2026-08-23):** applying a Stack-style layout to the **PPTX exports** (including collapsing N-2 into a single "X FTE" box per branch) and the new **"Full Org" slide in the Proposal PPTX** — the on-screen version is enough, not worth the extra scope. `docs/PPTX_HANDOFF.md` (written for a separate session to pick this up) is no longer needed.

### Smaller loose ends

- **Banner logos — DONE (2026-08-04).** Real logos uploaded for 7 of the 8 real banners (Selfridges, De Bijenkorf, Brown Thomas Arnotts, Rinascente, Globus, Illum, KaDeWe — cropped from the client's print-resolution source files to the actual logo mark, since the originals were full print pages with the mark occupying only ~10-25% of the frame); Europe HO has no logo file in the source CSV. See `docs/SYSTEM_AUDIT.md` §2 for detail.
- **PPTX export — CONFIRMED WORKING (2026-08-23).** The real export buttons have now actually been clicked and the generated decks opened; visual layout in PowerPoint confirmed fine. (Previously only verified by typecheck + a standalone pptxgenjs script, not a real click-through.)
- **Access control Phase 4** (optional) — blurred/hidden compensation doesn't extend to the PPTX/HTML exports; masked users get a plain "—". Still open — client to test and confirm whether it's needed.
