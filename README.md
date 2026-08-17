# Application north-star skills

Two **goal-document architecture specs** — a hexagonal Python backend and a Next.js App
Router frontend — as numbered rule catalogs (R1–R14, R1–R17), packaged as
[agent skills](https://agentskills.io) with the operations and lint configs that make the
rules mechanical instead of aspirational.

The core idea: a spec is **application-agnostic and measured against, not rewritten to
match, any one repo**. Real repos map the spec's stand-in names to their own, enforce the
invariants with tools (import-linter, eslint-plugin-boundaries, CI budgets), and record every
deliberate departure in a **divergence ledger** — so "we broke a rule" is a written decision
with a revisit trigger, never silent drift.

## Install

```bash
npx skills add NicolasFares/application-north-star-skills
```

Works with Claude Code, Cursor, Codex, Copilot, and [any agent the skills CLI
supports](https://github.com/vercel-labs/skills). Pick a subset interactively, or install
everything. The two guardrail skills use only [spec](https://agentskills.io/specification)
frontmatter, so they're portable anywhere skills run.

## The skills

| Skill | Kind | What it does |
| --- | --- | --- |
| [`backend-north-star`](skills/backend-north-star/SKILL.md) | guardrail (auto-triggers) | Applies R1–R14 before writing/reviewing backend code: routing table, hard rules, testing table, pre-merge checklist |
| [`frontend-north-star`](skills/frontend-north-star/SKILL.md) | guardrail (auto-triggers) | Applies R1–R17 before writing/reviewing frontend code |
| [`north-star-audit`](skills/north-star-audit/SKILL.md) | manual, read-only | Whole-repo conformance report: findings by rule ID + severity, plus a draft divergence ledger separating drift from deliberate-looking departures |
| [`north-star-review`](skills/north-star-review/SKILL.md) | manual, read-only | The same rubrics, diff-scoped: review a branch/PR against the rules |
| [`north-star-diverge`](skills/north-star-diverge/SKILL.md) | manual, writes | Record a divergence in the ledger (rule ID, why, revisit trigger); creates the adoption ADR from a template if absent |

Roadmap (not built yet): `north-star-adopt` (bootstrap the mapping + lint configs + ledger in
one pass) and `north-star-migrate` (audit → phased plan → execute with gates green between
phases).

## The specs

Each rule has an ID, a rationale, a published source, and the smell that should make you
reach for it. Cite the ID in review; don't paraphrase.

### Backend — [`python-backend-north-star.md`](skills/backend-north-star/references/python-backend-north-star.md)

One invariant: **dependencies point inward** (`infrastructure → application → domain`).

| Rule | Summary |
| --- | --- |
| R1 | The invariant is enforced by a tool (import-linter), not by discipline |
| R2 | Package by feature, then by pattern — never the reverse |
| R3 | A use case is one file: Input + Output + UseCase |
| R4 | There is no global `dtos/` package |
| R5 | Application services are use cases; `application/services/` is the exception |
| R6 | Errors: five roots, one module per context, ONE edge mapping |
| R7 | Ports are named for the need, not the vendor — and every port has a fake |
| R8 / R8b | Two types per boundary (they may look alike); reads may take the shortcut |
| R9 | One `ApiModel` base owns every wire convention |
| R10 | Endpoints are grouped by resource; audience is a file inside it |
| R11 | Persistence mapping is split by context, with one registry |
| R12 | The transaction boundary is one line, in one place |
| R13 | The DI container is composed, not one class |
| R14 | Settings are typed, validated once, and injected |

Plus §5 splitting thresholds, §6 per-layer testing, §7 review checklist.

### Frontend — [`nextjs-frontend-north-star.md`](skills/frontend-north-star/references/nextjs-frontend-north-star.md)

Two invariants: **(A)** server is the default, `'use client'` is a leaf and a cost;
**(B)** imports point one way (`app → features → shared`, credentials cross one `server/` seam).

| Rule | Summary |
| --- | --- |
| R1 | Both invariants are enforced by tooling (boundaries lint, `server-only`, budgets) |
| R2 | `app/` is routing; the code lives beside it |
| R3 | `components/` is not an architecture |
| R4 | `shared/ui` knows nothing about the business |
| R5 | Push `'use client'` down, never up |
| R6 | All data access goes through a DAL, and authorization lives IN it |
| R7 | One cache story, written down: one owner, one invalidation trigger per resource |
| R8 | A client data-fetching library is for client-owned data only |
| R9 | Four kinds of state, four homes |
| R10 | Contract types are generated; hand-written duplicates are drift with a delay |
| R11 | Cross-feature imports go through one entry point |
| R12 | The API DTO and the view model are different types (when they differ in kind) |
| R13 | Format at the leaf, store the raw value |
| R14 | Loading, error and empty are part of the route |
| R15 | Environment variables are validated once, in one module |
| R16 | Performance and accessibility are CI gates, not review opinions |
| R17 | One tool per job |

Plus §5 splitting thresholds, §6 per-layer testing, §7 monorepo shape, §8 review checklist.

## Enforcement configs

R1 in both specs says the invariants are enforced by tools. These are the tools, one
parametrization away from drop-in:

| File | What it enforces |
| --- | --- |
| [`enforcement/backend/import-linter.md`](enforcement/backend/import-linter.md) | The three import-linter contracts: layers point inward, domain is dependency-free, application imports domain only |
| [`enforcement/frontend/eslint.config.js`](enforcement/frontend/eslint.config.js) | `eslint-plugin-boundaries`: the `app → features → shared/server` direction + feature entry points |
| [`enforcement/frontend/check-use-client.sh`](enforcement/frontend/check-use-client.sh) | CI budget on the `'use client'` file share; hard-fails client layouts |
| [`enforcement/frontend/check-route-js.mjs`](enforcement/frontend/check-route-js.mjs) | CI budget on per-route first-load JS (Next 16.3+/Turbopack diagnostics) |

Both budget scripts are **ratchets**: set the threshold just above your measured value, lower
it as the number falls.

## How to adopt

1. Install the skills; add a **mapping** to your repo's CLAUDE.md/AGENTS.md or an adoption
   ADR: real root package / app path, real context/feature names, your gate commands.
2. Drop in the enforcement configs and wire them into CI.
3. Run `north-star-audit`. Triage its report: fix the drift; for the deliberate departures,
   record ledger entries (template:
   [`skills/north-star-diverge/references/adoption-adr.md`](skills/north-star-diverge/references/adoption-adr.md)).
4. From then on: guardrails apply the rules as you work, `north-star-review` checks each
   branch, `north-star-diverge` keeps the ledger honest.

The specs are goal documents. Full compliance on day one is not the point — a tool-enforced
invariant plus an honest ledger is.

## License

[Apache-2.0](LICENSE).
