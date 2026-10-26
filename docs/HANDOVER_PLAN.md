# Client Handover Plan — Royal Flush ATS

Draft checklist for handing the finished system over to the client. Written before requirement-gathering is fully closed — treat as a working draft, not a signed-off plan. Update once open questions below are answered.

---

## 1. The 5 stages

The original 3-stage idea (requirements → audit → post-launch testing) was missing two stages that matter specifically because this handover includes *infrastructure ownership*, not just a code drop:

1. **Requirements sign-off** — freeze scope with the end user. *(In progress — per discussion, nearly done.)*
2. **Ownership & access transfer** — move Database / Domain & Hosting / Source Code into accounts the client controls (see §2–3). This has to happen *before* the audit, not after, so the audit is run against what the client will actually operate.
3. **Audit with the responsible internal team** — walk their IT/ops team through what they now own: infra, security model, cost. (Content for this already exists — see `system-handoff-*.pptx` in the repo root.)
4. **Knowledge transfer / training** — whoever inherits day-to-day operation (their dev, their IT, or a hired vendor) needs a working session, not just documents. Audit-without-training leaves nobody able to act on what they just heard.
5. **Post-launch verification + warranty window** — smoke-test after go-live, plus an explicit stated period (e.g. 30 days) where bug fixes are still on us for free. Without a stated end date, "who owns a post-launch bug" stays ambiguous indefinitely.

---

## 2. Open question that changes scope — confirm before final planning

**Does the client run their own Database/Domain, and if so, do they connect to Postgres directly or only through a mediating API?**

No confirmation from the client on this yet — this section is prepared for both outcomes so planning isn't blocked, but the actual work differs a lot depending on the answer:

| | Scenario A — client uses our Supabase/Vercel setup as-is | Scenario B — client brings their own infra, direct DB access | Scenario C — client's own infra, app talks to *their* API instead of Postgres directly |
|---|---|---|---|
| **What we hand over** | Account ownership transfer (see `system-handoff-*.pptx`) | Code + schema + setup docs (§3) | Code + schema **+ a new data-access layer** |
| **Effort** | Low — mostly account admin, already scoped | Medium — packaging schema/env/storage setup cleanly | High — real refactor |
| **Why it's different** | Nothing changes; same Supabase project, new owner | Every server action in `src/app/actions/*.ts` and every client call in `src/lib/supabase/*.ts` already talks to Supabase directly (PostgREST + Storage API) via `@supabase/supabase-js` — moving to *their own* Supabase project needs the same schema and env vars, but the code itself doesn't change. | Every one of those ~20 action files would need to swap `@supabase/supabase-js` calls for `fetch()`/HTTP calls into their API. That's not a config change — it's a real rewrite of the entire data-access layer, plus whatever auth handshake their API expects. |

**Don't start Scenario C work on a guess.** If it turns out to be true, flag it back before touching code — it changes the timeline materially and should be scoped/quoted separately from the rest of the handover.

---

## 3. Source code transfer — likely Azure DevOps, not GitHub

Central Group may not want a GitHub account for this — guessed target is **Azure DevOps** (their likely existing internal git platform), unconfirmed. The transfer method isn't GitHub-specific either way: git history moves with a **mirror push** to whatever remote they give us, not a plain clone/zip.

```
git remote add azure https://dev.azure.com/<org>/<project>/_git/<repo>
git push azure --mirror
```

`--mirror` (not a plain `push`) carries every branch, tag, and the full commit history — a zip or a single-branch push would lose that, and `git blame`/bisect on old bugs stops working.

**Auth gotcha specific to Azure DevOps:** it no longer accepts a plain username/password over HTTPS. Need one of:
- A **Personal Access Token** (PAT) from the client, scoped to `Code: Read & Write`, used as the password when pushing over HTTPS, or
- Our SSH public key registered in their Azure DevOps project first, if pushing over SSH.

Either way, this is a client-side action (they generate the PAT / add the SSH key) — can't be done from our side alone. Ask for repo URL + PAT (or SSH access) once confirmed it's actually Azure DevOps.

---

## 4. Scenario B checklist — client brings their own Supabase + hosting

If they end up self-hosting infra (their own Supabase project, their own Vercel or other host) but keep direct DB access, here's what needs to move over:

- [ ] **Schema** — all 22 files in `docs/migrations/` (`001_...sql` → `022_...sql`), run in order. Two (`018`, `019`) cancel each other out (added then dropped the same day) — keep both for history, running order handles it correctly.
- [ ] **Storage buckets** — 6 buckets need creating with matching size/mime-type limits: `banner-logos` (2MB, image/*), `documents` (20MB, office docs), `employee-documents` (20MB, office docs + images), `employee-resumes` (10MB, PDF/Word), `position-jds` (10MB, PDF only), `profile-photos` (5MB, image/*). All public-read; write is `service_role`-only (no `storage.objects` RLS policies exist — confirmed by inspecting the current project directly).
- [ ] **Environment variables** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET` (32+ random chars, signs session cookies), optionally `GEMINI_API_KEY` (falls back to a value stored in the `app_settings` table if unset — see `src/lib/ai.ts`). **As of 2026-08-19, also `DATABASE_URL`** — a direct Postgres connection string (Supabase dashboard → Settings → Database → Connection string → URI, **pooler** host since this runs from serverless functions), needed as the data-access layer is rewritten off PostgREST (`docs/FEEDBACK_TRACKER.md`'s client-infra-feedback item 4). Not yet set anywhere — required before any converted action file can be tested against real data.
- [ ] **First super-user** — `node scripts/seed_admin.mjs <username> <password> "Name"` once the schema is in place; nothing else can log in until this runs.
- [ ] **Stack requirements to document for their ops team** — Next.js 15.5 (Node ≥18.18 per Next's own requirement), Postgres 17 (Supabase-managed), Vercel or any Next.js-compatible host.

*(Note: `docs/STACK.md` currently says the AI layer is `@anthropic-ai/sdk` / Claude — that's stale. The actual running code (`src/lib/ai.ts`) uses `@google/genai` calling `gemini-3.1-flash-lite`. Use the code as source of truth, not that doc, until it's corrected.)*

---

## 5. Not yet started

- Final requirements sign-off (owner: client-side, per this conversation)
- A decision on Scenario A vs B vs C above
- Confirming Azure DevOps (vs. something else) as the actual git target, and getting the repo URL + PAT/SSH access
- Formal warranty-period terms (length, what's covered) — needs a business call, not a technical one
