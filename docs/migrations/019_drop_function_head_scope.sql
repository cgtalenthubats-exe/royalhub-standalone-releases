-- 019: drop function_head_scope (018) — superseded by real cross-company edges.
--
-- 018 modeled "which companies report to a Head of Function" as a separate
-- scope table, composed onto the tree at read time. That turned out to be
-- solving a problem org_edges already solves: a Head of Function's
-- cross-company (or even cross-function) reports are just an ordinary
-- reporting line, set the same way as any other (drag-and-drop, or the
-- profile's Org Snapshot editor) — no need for a parallel data model.
--
-- functions.global_head_id is kept: it still answers a real, different
-- question — "if a company runs this function with no reporting edge to
-- anyone at all, where does its lead get ranked for display?" (see getOrgTree
-- in src/app/actions/org.ts). That can't be a real edge, because by
-- definition no reporting relationship exists.

DROP TABLE IF EXISTS function_head_scope;
