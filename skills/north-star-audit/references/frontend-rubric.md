# Frontend audit rubric (R1–R17)

Per rule: what to check, how, and what a violation looks like. Cite the rule ID in every
finding. Severity: **high** = an invariant or a security rule; **medium** = structural drift
that compounds; **low** = threshold/ceremony issues.

## R1 — Both invariants enforced by tooling

- ESLint config has `eslint-plugin-boundaries` (or dependency-cruiser) contracts for
  `app → features → shared` = high if absent.
- Data-access modules import `server-only`; browser-global modules import `client-only`.
  A DAL module without `server-only` = high.
- Grep for `eslint-disable.*boundaries` = medium each; should be a reviewed policy + ledger entry.
- CI budgets exist for `'use client'` share and route JS = medium if absent (R16).

## R2 — `app/` is routing only

- Read a sample of `page.tsx` files: fetch → compose → render only. Business logic,
  multi-branch conditionals, inline data transforms in a page = medium (belongs in a
  feature's `model/`).
- Business components living inside `app/` outside route-private `_components/` = medium.

## R3 — `components/` is not an architecture

- A top-level `components/` dir with >~30 files organized by technical category = medium.
- The same concept under two homes (`components/product/` and `features/catalog/`) = medium.

## R4 — `shared/ui` knows nothing about the business

- Grep `shared/` for imports from `features/` = high (breaks the import direction).
- `shared/ui` components fetching, reading stores, or taking domain-typed props = medium.

## R5 — Push `'use client'` down

- Any `layout.tsx` carrying `'use client'` = high.
- Client components that only display server data (no handlers, no hooks beyond render) =
  medium — should be server components or take server-rendered children.
- Measure the `'use client'` file share; >~30% for a content app with no ledger entry = medium.

## R6 — DAL owns data access AND authorization

- Every Server Action re-checks permission inside the DAL it calls. An action that mutates
  with no auth check in its call path = **high, security**.
- `fetch()` with auth tokens inside component files = high. Authorization checks living only
  in the component that renders the button = high.

## R7 — One cache story, written down

- Each cached read declares its owner and invalidation trigger (cache tags + `revalidateTag`,
  or query keys + stated invalidation). Mutations invalidating by path-guessing, or reads
  with no discoverable invalidation trigger = medium.

## R8 — Client data-fetching library for client-owned data only

- Find resources fetched BOTH server-side and via a client hook without hydration linking
  them = high (two caches, two lifetimes, one truth).
- Client cache used for static server-renderable data = medium.

## R9 — Four kinds of state, four homes

- Filters/tabs/pagination in `useState` instead of the URL = medium each cluster.
- A global-store slice mirroring an API resource = medium (a cache with no invalidation).
- Form values in a global store = medium.

## R10 — Contract types are generated

- Generated types dir exists and is regenerated in CI = medium if hand-maintained mirrors of
  backend types exist instead. Local edits inside the generated dir = high (next regen deletes them).

## R11 — Cross-feature imports go through one entry point

- Grep for `features/<a>/` imports inside `features/<b>/` reaching past the barrel = medium
  each (high if the lint rule was disabled to allow it). Same pair twice = flag "merge or
  extract to shared" (design signal, medium).
- Barrels re-exporting >~20 modules = low.

## R12 — API DTO ≠ view model (when they differ in kind)

- Components consuming raw API payloads and re-implementing fallbacks
  (`x.discount_price ?? x.price`) in multiple places = medium — map once at the data edge.
- A mapping layer that is a field-for-field pass-through with identical types = low (delete
  it; use the generated type until it diverges).

## R13 — Format at the leaf, store the raw value

- Pre-formatted money/date strings held in state or passed through props = medium.
- Scattered `toFixed`/`toLocaleString` per component instead of one `shared/lib` formatter = low.

## R14 — Loading, error, empty are route contracts

- Routes that fetch but declare no `loading.tsx`/`Suspense`, no `error.tsx` (with working
  `reset()`), reachable-404 without `not-found.tsx` = medium each.
- A Suspense boundary wrapping the entire page (full-page spinner) = low.
- Empty states rendered as `{items.length === 0 && null}` = low.

## R15 — Env validated once

- Grep for `process.env` outside the one schema-validated config module = medium each
  (high if a secret is `NEXT_PUBLIC_`-prefixed — that ships it to the browser).

## R16 — Perf and a11y are CI gates

- Route-JS budget, `'use client'` share check, and a11y lint present and enforced = medium
  per missing gate.

## R17 — One tool per job

- Scan `package.json` for duplicates: two HTTP clients, two form libraries, two date
  libraries, two styling systems, two client caches/stores = medium per pair, unless a
  ledger entry explains why both live.

## §5 thresholds / §6 tests / §7 monorepo (cross-cutting)

- Files past the spec's splitting thresholds = low each.
- Tests mocking own modules instead of the network (MSW) = medium; component tests needing
  5+ module mocks = the component does five things, medium.
- Monorepo: a package with exactly one consumer = low ("not a package yet"); an app imported
  by a package = high (direction inverted).
