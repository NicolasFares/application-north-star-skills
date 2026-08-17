---
name: north-star-audit
description: "Whole-repo conformance audit against the north-star architecture specs (backend R1-R14, frontend R1-R17). Read-only: produces a findings report cited by rule ID plus a draft divergence ledger — it changes nothing. Use when asked to audit architecture, check north-star conformance, or assess drift."
license: Apache-2.0
disable-model-invocation: true
context: fork
metadata:
  version: "1.0.0"
---

# North-star audit

Audit the current repo against the north-star spec(s). **Read-only** — report findings, edit
nothing.

## Procedure

1. **Detect stacks.** Python backend: a `pyproject.toml` with a `domain|application|infrastructure`-ish
   package (or any FastAPI/Flask/Django service). Next.js frontend: a `next.config.*`.
   A monorepo can be both — audit each stack it has, skip the rest.
2. **Load the rubric(s)** from this skill's `references/` — `backend-rubric.md` and/or
   `frontend-rubric.md`. Work through every rule; don't sample rules, sample files.
3. **Find the repo's mapping first**: an adoption ADR, or a north-star section in
   CLAUDE.md/AGENTS.md, and especially its **divergence ledger**. A departure already in the
   ledger is a decision — report it under "recorded divergences (respected)", not as a finding.
4. **Audit.** For each rule, run the rubric's checks (grep/read — never execute the repo's
   code beyond read-only lint commands if configured). Record findings as:
   `[R#][severity] file:line — what, and the smell it matches`.
5. **Draft the divergence ledger.** Split findings into:
   - **drift** — violations nobody decided: the fix list, ordered by severity;
   - **deliberate-looking divergences** — consistent, load-bearing departures (applied
     uniformly, tested, commented): draft a ledger entry for each (rule ID, apparent reason,
     revisit trigger) for a human to confirm or refute.

## Report shape

```
# North-star audit — <repo> (<date>)
Stacks: backend | frontend | both        Mapping found: <where> | none (say what you inferred)

## Summary          <n> high / <n> medium / <n> low across <n> rules; top 3 themes in prose
## Findings (drift) grouped by rule, severity-first, file:line each
## Deliberate-looking divergences   draft ledger entries to confirm
## Recorded divergences (respected) what the existing ledger already covers
## Not checked      rules that need a build/run this audit couldn't do, named explicitly
```

Be concrete: every finding gets a file:line and the rule ID. No finding without a location.
If a rule can't be checked without building, say so under "Not checked" — a silent skip reads
as a pass.
