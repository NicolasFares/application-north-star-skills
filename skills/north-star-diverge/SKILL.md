---
name: north-star-diverge
description: "Record a deliberate divergence from a north-star rule (backend R1-R14, frontend R1-R17) in the repo's adoption ADR divergence ledger; creates the ADR from a template if it doesn't exist. Use when a change knowingly breaks a spec rule, or when asked to record/document an architecture divergence."
license: Apache-2.0
disable-model-invocation: true
metadata:
  version: "1.0.0"
---

# North-star diverge

Write the divergence down — the ledger entry is the alternative to a lint exemption, and the
lint config stays clean.

1. **Find the ledger**: the adoption ADR (`docs/adr/*north-star*` or wherever the repo's
   mapping points). If none exists, create one from this skill's
   `references/adoption-adr.md`, filling the mapping section from the repo, and say you did.
2. **Ask/derive the three parts** — refuse to write a vague entry:
   - the **rule ID** diverged from;
   - **why the departure is right for this repo** (one honest paragraph, not "for now");
   - the **revisit trigger** — the concrete event that would reopen the decision.
3. **Append** under `## Divergence ledger` with the next letter:
   `- **(x) R# — one-line summary.** Why. Revisit when <trigger>.`
4. If the divergence needed a lint policy change (e.g. a reviewed cross-feature boundary
   policy), point at it from the entry — the two must reference each other.

One entry per divergence; an entry that already covers this case means no new entry — cite
the existing letter instead.
