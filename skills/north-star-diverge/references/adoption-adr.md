# Adopt the <backend | frontend> north star

---

## Status: accepted <!-- proposed | accepted | superseded -->

Adopts [`<path-to-spec>`](../path/to/spec.md) as the **target architecture** for
`<package or app path>`. The spec is application-agnostic by design and is **measured
against, not rewritten to match**, this repo. Migration status: <complete | in progress>.

<!-- If the spec leaves questions open by design (wire convention, DI style, tree
     literalness), close them here as numbered decisions with a date. -->

1. **<Decision>** — <what was decided and why>.

## Mapping

<!-- The spec uses stand-in names. Pin the real ones here — this block is what the
     guardrail skill reads. Keep it current. -->

- Root package / app: `<myapp>` → `<yours>`
- Bounded contexts / features: `<ordering, billing, identity>` → `<yours>`
- Gates: `<lint-imports / eslint boundaries command>`, `<test command>`, `<budget scripts>`

## Divergence ledger

A running record of where this repo deliberately departs from the spec, appended to as
work proceeds. Each entry cites the rule ID it diverges from, the reason, and the
trigger that would make you revisit it. An entry here is the alternative to an
exemption in the lint config — the lint config stays clean.

- **(a) <Rule ID> — <one-line summary>.** <Why the departure is right for this repo.
  What would have to change for it to be revisited.>

## Considered options

- **<Option>** — rejected. <Why.>

## Consequences

- The lint contracts (R1) become the merge gate for the adopted layering.
- Every change follows the spec's review checklist, citing rule IDs in review rather
  than paraphrasing.
