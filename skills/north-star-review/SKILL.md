---
name: north-star-review
description: "Diff-scoped review of changes against the north-star architecture specs (backend R1-R14, frontend R1-R17). Read-only: reviews a branch/PR/working diff and reports findings cited by rule ID. Use when asked to review a change for architecture conformance. Argument: the base ref (default: the repo's main branch merge-base)."
license: Apache-2.0
disable-model-invocation: true
metadata:
  version: "1.0.0"
---

# North-star review

The diff-scoped mode of `north-star-audit`: same rubrics, but only the changed code is on
trial. **Read-only** — report findings, edit nothing.

## Procedure

1. **Scope the diff.** Base ref = `$ARGUMENTS` if given, else the merge-base with the default
   branch (`git diff $(git merge-base HEAD origin/<default>)...HEAD`, plus uncommitted changes).
2. **Load the rubric(s)** for the stack(s) the diff touches, from the sibling skill:
   `../north-star-audit/references/backend-rubric.md` and/or `frontend-rubric.md`. If not
   installed alongside, read them from
   `https://raw.githubusercontent.com/NicolasFares/application-north-star-skills/main/skills/north-star-audit/references/`.
3. **Find the repo's mapping and divergence ledger** (adoption ADR or CLAUDE.md/AGENTS.md
   north-star section). A departure the ledger records is a decision — don't flag it.
4. **Review only what changed**, but follow each change to the boundary it crosses: a new
   endpoint is reviewed with its schema/use case/error path; a new component with its data
   access and state home. Pre-existing violations adjacent to the diff go in a separate
   "pre-existing, not this change" note — visible, not blocking.
5. Also run the guardrail checklists (the `backend-north-star` / `frontend-north-star`
   skills' pre-merge lists) against the diff.

## Report shape

```
# North-star review — <branch/PR> vs <base>
## Verdict          ship | ship with nits | needs changes — one sentence why
## Findings         [R#][severity] file:line — what, and the fix direction (grouped by rule)
## Pre-existing     adjacent violations not introduced here
## Checklist        the guardrail pre-merge checklist, ticked/unticked
```

Every finding gets a file:line and rule ID. New divergences the author appears to intend →
tell them to record it with `north-star-diverge`, don't silently absorb it.
