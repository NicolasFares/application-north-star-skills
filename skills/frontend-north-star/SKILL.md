---
name: frontend-north-star
description: "Enforce a Next.js App Router target architecture (rules R1-R17) on any frontend change. Use BEFORE writing or reviewing frontend code: new pages/routes, components, hooks, data fetching, forms, state, styling, or frontend tests. Triggers: frontend change, add page, add component, new query, review frontend, architecture check."
license: Apache-2.0
metadata:
  version: "1.0.0"
  spec: references/nextjs-frontend-north-star.md
---

# Frontend north star

The full spec is `references/nextjs-frontend-north-star.md` (rules **R1–R17** — cite IDs in
review, don't paraphrase). It is a goal document: apps are measured against it and diverge
deliberately, with each divergence written down in an adoption ADR's divergence ledger.

## Map this to the repo first

The spec uses stand-in features (`catalog`, `checkout`, `account`). Before applying it, find
the repo's mapping — an adoption ADR or a "north star" section in CLAUDE.md/AGENTS.md naming
the app path, its features, gate commands, and the ledger's location. If none exists, say so
and suggest creating the mapping (the `north-star-diverge` skill has the ADR template).
**Check the ledger before "fixing" something that looks off** — a recorded divergence is a
decision, not drift. If you diverge anew, append to the ledger with the rule ID.

## The two invariants

**(A) Server is the default; `'use client'` is a leaf, and a cost.** Push it down, never onto
a `layout.tsx`, never onto a component that only displays data. Enforced by `server-only` /
`client-only` markers (they fail the build, not just lint) plus two CI budgets: the
`'use client'` share and a per-route first-load JS cap (see this repo's `enforcement/frontend/`).

**(B) Imports point one way, and credentials cross exactly one seam:**

```
app/  →  features/  →  shared/
           │
           └────────→  server/   (DAL / credential seam only)
```

`app` may import `features` + `shared`. A `feature` may import `shared`, `server`, and its
own files — never another feature's internals (a reviewed cross-feature policy in the lint
config + a ledger entry is the only sanctioned exception). `shared` imports nothing above it.
Enforced by `eslint-plugin-boundaries` — **never add a `boundaries/*` eslint-disable; fix the
import direction instead.**

## Where does this code go?

| You are writing…                           | It goes…                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Business UI for one capability             | `features/<x>/ui/`                                                                            |
| Pure logic, types, schemas                 | `features/<x>/model/` (no React, no fetch)                                                    |
| A new read                                 | `features/<x>/api/` — one owner, one documented invalidation trigger (R7); never inline fetch |
| Server data access / authorization         | `server/dal/` with `import "server-only"` — auth check lives IN the DAL (R6)                  |
| A page                                     | `app/**/page.tsx` = fetch → compose → render. Nothing else (R2).                              |
| A view composing 2+ features               | route-private `app/**/_components/`                                                           |
| A view using one feature only              | that feature's `ui/`                                                                          |
| A generic, business-blind primitive        | `shared/ui/` (R4 — no `features/` import, ever; must build with `features/` deleted)          |
| An env read                                | `shared/config/env.ts` ONLY, schema-validated (R15)                                           |
| Generated API types                        | `shared/api/generated/` — never hand-edited (R10)                                             |
| A formatter                                | `shared/lib/` (R13 — store raw values, format at the leaf)                                    |

## Hard rules the tools don't fully catch

- **R5**: never `'use client'` on a `layout.tsx` or on a component that only displays server
  data — pass server-rendered children/props instead.
- **R6**: a Server Action is a public HTTP endpoint — it re-checks permission as if called
  directly, because it can be. Checking in the component that renders the button protects nothing.
- **R8**: a client cache (TanStack Query/SWR) is for client-owned data only. Never fetch the
  same resource the server already rendered — if both need it, hydrate the client cache from
  the server render: one fetch, one source.
- **R9** state homes: server data → RSC fetch/query cache; filters/tabs/pagination → the URL;
  form values → the form library; ephemeral UI → `useState`. A store slice named after an API
  resource is a cache with no invalidation — delete it.
- **R11**: cross-feature imports go through the feature's barrel only. Keep barrels shallow —
  export the consumed surface, not the contents. If the barrel mixes server-only and
  client-safe exports, split it (`index.ts` client-safe, `server.ts` server-only).
- **R17**: one tool per job. Adding a second form/HTTP/date/styling library requires deleting
  the first in the same PR, in writing, or explaining why both must live.
- **§5 splitting thresholds**: component file > ~200 lines, `page.tsx` holding anything but
  fetch+compose, barrel > ~20 exports, feature folder > ~25 files → split before merging.

## Tests must match the layer (spec §6)

| Layer                       | Tool                   | Dependencies                                                                |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `model/` pure logic         | Vitest, no DOM         | none — no mocks                                                              |
| `shared/ui` primitives      | Testing Library        | none — props → DOM + events, no network                                      |
| Feature UI / composed views | Testing Library + MSW  | mock at the network boundary — never mock your own modules; framework seams only |
| Server Components / DAL     | direct async fn tests  | authorization branches especially (R6)                                       |
| Route journeys              | Playwright             | the 3–5 journeys that pay the bills, not everything                          |
| Architecture                | fitness functions      | boundaries lint + the two budgets (R1, R16)                                  |

## Pre-merge checklist (spec §8, rule IDs cited)

- [ ] Boundaries lint clean; no new `boundaries/*` eslint-disable (R1)
- [ ] No new `'use client'` on a `layout.tsx` or a display-only component (R5)
- [ ] Every data-access module imports `server-only`; every authz check is inside the DAL (R6)
- [ ] New cached data declares its tag/owner and its invalidation trigger (R7, R8)
- [ ] Filters/tabs/pagination live in the URL (R9)
- [ ] No hand-written duplicate of a generated API type (R10)
- [ ] Nothing reads `process.env` outside `shared/config` (R15)
- [ ] No second library for a job that already has one (R17)
- [ ] Nothing crossed a §5 splitting threshold unsplit
- [ ] Both CI budgets green (`'use client'` share, route JS) (R16)
- [ ] Divergence from a rule? Recorded in the adoption ADR's ledger with its rule ID
