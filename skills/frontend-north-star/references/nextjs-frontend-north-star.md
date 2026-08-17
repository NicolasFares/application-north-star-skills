# Next.js frontend north star

A target architecture for any Next.js App Router application I build. Application-agnostic: no business domain is assumed. Examples use `catalog`, `checkout`, `account` as stand-in features.

Companion to [`python-backend-north-star.md`](python-backend-north-star.md). Same contract: this is a **goal document**, not a description of any existing app. Every rule has an ID (`R1`…`R17`), a rationale, a source, and the smell that should make you reach for it. Cite the ID in review. When you break one, write down which.

Assumes Next.js 16+ (App Router, React 19, `cacheComponents`). Where a rule depends on a version-specific API, that is called out.

---

## 0 · The two invariants

A backend has one load-bearing invariant (dependencies point inward). A frontend has two, and they are orthogonal — most frontend rot is one of them being violated silently.

### Invariant A — the render boundary

**Server is the default. `'use client'` is a leaf, and it is a cost.**

```
Server Component  ──props──▶  Client Component  ──▶  (browser only)
   data, secrets                interactivity
   zero JS shipped              every import ships
```

`'use client'` is not "this file runs on the client" — it is **the boundary where the client bundle starts**. Every module that file imports, and every module those import, goes to the browser. Put the directive on a layout and you have opted the entire subtree out of server rendering, permanently, usually by accident.

Source: React, [`'use client'`](https://react.dev/reference/rsc/use-client) — "marks a cut point between server and client module graphs"; Next.js, [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components).

### Invariant B — the import direction

**`app/` → `features/` → `shared/`. Never backwards, never sideways into another feature's internals.**

```
app/       routing, layouts, composition       may import features + shared
features/  one business capability each        may import shared, never another feature's internals
shared/    ui primitives, utils, api client    imports nothing above it
```

The frontend equivalent of the backend's Dependency Rule. Source: [Feature-Sliced Design](https://feature-sliced.design/) (layers with a strict one-way import rule); [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — "feature folders, unidirectional codebase".

### R1 · Both invariants are enforced by tooling, not by discipline

```js
// eslint.config.mjs
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "feature", pattern: "src/features/*", capture: ["name"] },
        { type: "shared", pattern: "src/shared/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["feature", "shared"] },
            { from: "feature", allow: ["shared", ["feature", { name: "${from.name}" }]] },
            { from: "shared", allow: ["shared"] },
          ],
        },
      ],
      "boundaries/entry-point": [
        "error",
        {
          default: "disallow",
          rules: [{ target: ["feature"], allow: "index.ts" }], // no deep imports (R11)
        },
      ],
    },
  },
];
```

And for Invariant A, the two marker packages — they fail the **build**, which lint cannot:

```ts
import "server-only"; // in every data-access module: throws if a Client Component imports it
import "client-only"; // in modules touching window/localStorage: throws if a Server Component imports it
```

`server-only` resolves to a no-op under React's `react-server` export condition and to a throwing module otherwise, so the failure is structural, not stylistic. Source: Next.js, [Data Security](https://nextjs.org/docs/app/guides/data-security); [`server-only` package](https://www.npmjs.com/package/server-only).

Add a bundle budget so Invariant A has a number attached (R16). Source: [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) for the same contracts outside ESLint.

**Smell:** "we keep the client boundary small by being careful."

---

## 1 · Reference tree

```
src/
├── app/                              ROUTING ONLY (R2)
│   ├── layout.tsx                    shell, providers, fonts, metadata
│   ├── error.tsx · not-found.tsx     route-level contracts (R14)
│   ├── (marketing)/                  route group: shared layout, no URL segment
│   │   └── page.tsx                  composes features, fetches, passes props
│   └── catalog/
│       ├── page.tsx                  Server Component: fetch → render feature
│       ├── loading.tsx               streaming fallback
│       └── _components/              route-specific, non-routable (private folder)
│
├── features/                         ONE PACKAGE PER CAPABILITY (R3)
│   └── catalog/
│       ├── index.ts                  the ONLY public surface (R11)
│       ├── api/                      queries + mutations for this feature
│       │   ├── get-products.ts       'use cache' + cacheTag, or a client hook
│       │   └── update-product.ts     'use server' action → delegates to DAL (R7)
│       ├── model/                    types, schemas, pure business logic
│       │   ├── product.ts            the VIEW MODEL, not the API DTO (R12)
│       │   └── filters.ts            pure functions, unit-testable, no React
│       ├── ui/                       components owned by this feature
│       │   ├── product-grid.tsx      server by default
│       │   └── filter-panel.tsx      'use client' — a leaf, and it says why
│       └── lib/                      feature-local helpers
│
├── shared/                           NO BUSINESS KNOWLEDGE (R4)
│   ├── ui/                           design system: Button, Dialog, Table
│   ├── api/                          fetch client, error normalization, auth header
│   │   └── generated/                OpenAPI-generated types — never hand-edited (R10)
│   ├── config/                       env schema, feature flags, constants (R15)
│   ├── lib/                          cn(), formatters, date/money helpers (R13)
│   └── hooks/                        generic hooks only (useDebounce, useMediaQuery)
│
└── server/                           SERVER-ONLY, one 'import server-only' each (R6)
    ├── dal/                          data access + authorization live together
    └── auth.ts                       session reading, never re-implemented elsewhere
```

### R2 · `app/` is routing. The code lives beside it.

Next.js documents three strategies: everything inside `app/`, everything outside, or split per route segment. Pick **outside**, with route-local `_components/` for the genuinely single-use.

Why: a route tree is shaped by URLs, and URLs change for marketing reasons — a new landing page, a locale prefix, an A/B split. Business capabilities do not move when a URL does. Coupling the two means every re-route is a refactor.

A `page.tsx` should read as composition: fetch, compose, render. If it holds business logic, that logic belongs in a feature's `model/`.

Source: Next.js, [Project structure](https://nextjs.org/docs/app/getting-started/project-structure) — colocation is safe (only `page`/`route` files are routable), private `_folders` are opted out of routing, route groups `(name)` organize without touching the URL.

### R3 · `components/` is not an architecture

A top-level `components/` directory is the frontend's version of a global `dtos/` package: a folder named after a _technical category_, which therefore has no reason to change and so changes for every reason. At 30 subfolders it is a second, worse route tree — one that nobody navigates by.

A feature owns its UI, its data access, its types and its logic in one folder. Moving a capability, deleting it, or handing it to another team is then a directory operation.

The frontend's own version of the vertical slice, and the same source as the backend rule: Parnas (1972) — decompose around what changes together; Martin, _Clean Architecture_ ch. 21 — the top level should announce the product, not the framework.

**Threshold:** under ~30 components total, a flat `components/` is fine and features are premature. Past that, or at the first "which of these three `Card`s is the right one", introduce features.

**Smell:** a component folder named after a page; the same concept appearing under two folders (`components/product/` and `features/catalog/`).

### R4 · `shared/ui` knows nothing about the business

A primitive takes props and emits DOM and events. It does not fetch, does not read a store, does not know a `Product` exists, does not import from `features/`. The moment a `Button` accepts a `product` prop, the design system has become a feature and can no longer be reused or replaced.

Test for it: `shared/` must build with `features/` deleted. That is a real check, not a metaphor — dependency-cruiser can assert it.

---

## 2 · The server/client boundary

### R5 · Push `'use client'` down, never up

The default component is a Server Component. Interactivity is added by extracting the interactive part into a small client leaf and passing it serializable props.

```tsx
// app/catalog/page.tsx — server, ships zero JS
export default async function CatalogPage({ searchParams }) {
  const products = await getProducts(await searchParams); // R6: DAL
  return (
    <>
      <FilterPanel /> {/* client leaf: ~4 KB */}
      <ProductGrid items={products} /> {/* server: 0 KB */}
    </>
  );
}
```

Two corollaries that catch most of the damage:

- **Never `'use client'` in `layout.tsx`.** A layout wraps every page under it; the directive there converts the whole subtree. If a provider needs the client, wrap `{children}` in a client provider component — `children` passed from a server parent stays server-rendered.
- **A client component that only _displays_ server data is a mistake.** Pass rendered server children into it as `children`/slots rather than passing raw data across the boundary and re-rendering it in the browser.

**Metric, not a vibe:** track the share of files carrying `'use client'`. A content-heavy app that lands above ~30 % has stopped being a Next.js app and is an SPA that pays for a server. Put the number in CI (R16).

Source: Next.js, [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — "moving Client Components down the tree"; React, [`'use client'`](https://react.dev/reference/rsc/use-client).

### R6 · All data access goes through a Data Access Layer, and authorization lives _in_ it

One module per resource, marked `server-only`, holding the fetch **and** the auth check. Pages, Server Actions and Route Handlers call it; none of them re-implement it.

```ts
// server/dal/posts.ts
import "server-only";

export async function deletePost(postId: string) {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  const post = await db.post.findUnique({ where: { id: postId } });
  if (post.authorId !== session.user.id) throw new ForbiddenError();

  await db.post.delete({ where: { id: postId } });
}
```

```ts
// features/blog/api/delete-post.ts
"use server";
import { deletePost } from "@/server/dal/posts";

export async function deletePostAction(postId: string) {
  await deletePost(postId); // auth + authz happened inside the DAL
  revalidateTag("posts", "max");
}
```

The reason this is a _structural_ rule and not a style preference: **a Server Action is a public HTTP endpoint.** It is reachable by anyone who can guess its ID, whether or not the UI that calls it is rendered. Checking permission in the component that renders the button protects nothing. Use `unauthorized()` / `forbidden()` for the framework-level responses.

Source: Next.js, [Data Security](https://nextjs.org/docs/app/guides/data-security) — the DAL pattern, `server-only`, and the taint APIs; [`unauthorized()`](https://nextjs.org/docs/app/api-reference/functions/unauthorized), [`forbidden()`](https://nextjs.org/docs/app/api-reference/functions/forbidden).

**Smell:** a `fetch()` with an auth token inside a component file; an authorization check in a `page.tsx` that the corresponding action does not repeat.

### R7 · One cache story, written down

Next 16 unified the caching flags under `cacheComponents`, which turns on `use cache`, `cacheLife` and `cacheTag`:

```ts
// next.config.ts
export default { cacheComponents: true } satisfies NextConfig;
```

```ts
// features/catalog/api/get-products.ts
import "server-only";
import { cacheLife, cacheTag } from "next/cache";

export async function getProducts(filters: Filters) {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  return api.get("/products", filters);
}
```

Mutations invalidate by tag — `revalidateTag('products', 'max')` for stale-while-revalidate — not by guessing paths.

The rule is not "use this API"; it is **each piece of data has exactly one owner and one invalidation trigger, and both are documented in the feature's `api/` folder.** Ambiguous ownership is what produces the two classic bugs: the page that never updates after a mutation, and the page that refetches on every navigation.

Source: Next.js, [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) (introduced in 16.0, unifying `ppr`, `useCache`, `dynamicIO`), [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache), [`cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag), [Revalidating](https://nextjs.org/docs/app/getting-started/revalidating).

### R8 · A client data-fetching library is for client-owned data only

If server components can fetch it, they should. A client cache (TanStack Query, SWR) earns its place for: infinite scroll and pagination that must not re-render the page, optimistic updates, polling, and anything driven by user interaction after load.

What it must never do is **fetch the same resource the server already rendered**. That is two caches with two lifetimes for one truth, and it is the most expensive bug class in this architecture: the UI flickers between two versions of the same object and nobody can reproduce it.

If a resource needs both, hydrate the client cache from the server render — one fetch, one source. Source: [TkDodo, _React Query as a State Manager_](https://tkdodo.eu/blog/react-query-as-a-state-manager).

---

## 3 · State and types

### R9 · Four kinds of state, four homes. Pick per case, not per app.

| State                                    | Lives in                                      | Not in         |
| ---------------------------------------- | --------------------------------------------- | -------------- |
| Server data                              | RSC fetch + cache tags (R7), or a query cache | a global store |
| Navigation / filters / tabs / pagination | **the URL** (`searchParams`)                  | `useState`     |
| Form values                              | the form library / `useActionState`           | a global store |
| Ephemeral UI (open, hovered, step)       | `useState` in the owning component            | anywhere else  |

The under-used one is the URL. Filters in `useState` are unshareable, unbookmarkable, lost on refresh, and invisible to the server — which means the server cannot render the filtered result and you have forced a client fetch. Filters in `searchParams` are none of those, and a Server Component can read them directly.

**A global store (Redux, Zustand) is for the remainder: client state that must survive navigation and is not any of the four above.** In most applications that set is close to empty. A store holding fetched server data has recreated a cache with no invalidation.

Source: [TkDodo](https://tkdodo.eu/blog/react-query-as-a-state-manager); Next.js, [`searchParams`](https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams-optional).

**Smell:** a Redux slice named after an API resource; a filter that resets when the user refreshes.

### R10 · Contract types are generated; hand-written duplicates are drift with a delay

The backend publishes an OpenAPI schema. Generate the types from it into `shared/api/generated/`, never edit them, and regenerate in CI so a backend change fails the frontend build _at the PR_, not in production.

A hand-maintained mirror of a backend type is not a type — it is an assertion that two teams will remember the same thing forever.

If the generated file needs local additions (endpoints not yet in the schema, richer enums), keep them in a separate adjacent module that imports the generated one. Never patch the generated file: the next regeneration silently deletes the patch.

### R11 · Cross-feature imports go through one entry point

`features/catalog/index.ts` re-exports the handful of things other features may use. Everything else is internal, and the lint rule in R1 enforces it. This is what makes a feature deletable.

Two cautions, both real:

- **Keep barrels shallow.** A barrel that re-exports 60 modules defeats tree-shaking and slows dev refresh. Export the public surface, not the contents. Next's [`optimizePackageImports`](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports) exists because large barrels became a common performance bug.
- **A feature importing another feature is a design signal.** Once it happens twice, either the shared part belongs in `shared/`, or the two features are one.

### R12 · The API DTO and the view model are different types

Same rule as the backend's boundary rule, and the same honest caveat.

Map the API payload to a view model **once, at the data-access edge** — where snake_case becomes camelCase, nullable becomes optional-with-default, an ISO string becomes a `Date`, and three flags become one union. Components consume the view model.

Without the mapping, a backend rename is a find-and-replace across 40 components, and every one of them re-implements `product.discount_price ?? product.price`.

**Counter-argument, applied honestly:** if the API type and the view model are field-for-field identical with identical types, the mapping is a pass-through layer and buys nothing — use the generated type directly (Fowler, [_LocalDTO_](https://martinfowler.com/bliki/LocalDTO.html); Ousterhout, _A Philosophy of Software Design_, on pass-through layers). Introduce the view model at the first divergence, not before.

### R13 · Format at the leaf, store the raw value

Money, dates and translated strings are stored as `number` + currency code, `Date`/ISO string, and message keys — never as pre-formatted strings in state. Formatting is a locale-dependent, render-time concern; a formatted string in state is a value that cannot be sorted, compared, or re-rendered in another locale.

One formatter module in `shared/lib`, `Intl.*` underneath, no per-component `toFixed(2)`.

---

## 4 · Route contracts and operations

### R14 · Loading, error and empty are part of the route, not afterthoughts

Every route segment that fetches declares:

- `loading.tsx` — or an explicit `<Suspense>` placed where streaming actually helps (around the slow part, not around everything);
- `error.tsx` — a client component, with a working `reset()`;
- `not-found.tsx` where a 404 is reachable;
- an empty state in the feature UI, designed, not `{items.length === 0 && null}`.

A Suspense boundary around the entire page converts streaming into a full-page spinner and gives up the benefit. Put it around the slow subtree so the shell paints immediately.

Source: Next.js, [Loading UI and Streaming](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error).

### R15 · Environment variables are validated once, in one module

```ts
// shared/config/env.ts
const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  API_SECRET: z.string().min(1), // server-only, never NEXT_PUBLIC_
});
export const env = schema.parse(process.env);
```

Nothing else reads `process.env`. Two properties this buys: a missing variable fails at startup with a name instead of at 3 a.m. with `undefined is not a function`, and the `NEXT_PUBLIC_` prefix stops being a habit and becomes a decision.

**`NEXT_PUBLIC_` is a publishing action.** The value is inlined into the client bundle at build time and is readable by anyone. Prefixing a secret to "make it work" ships the secret.

### R16 · Performance and accessibility are CI gates, not review opinions

Three numbers, each a build failure:

| Gate                 | Tool                                                 | Why this one                                          |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Route JS budget      | `@next/bundle-analyzer` + a size check per route     | the only thing that keeps Invariant A honest          |
| `'use client'` share | one `grep` in CI, thresholded                        | the leading indicator; bundle size is the lagging one |
| a11y lint            | `eslint-plugin-jsx-a11y` (in `next/core-web-vitals`) | catches the 80 % that is missing labels and roles     |

Optionally Lighthouse CI with a budget on LCP/CLS/INP for the top three routes. Source: Ford/Parsons/Kua, _Building Evolutionary Architectures_ (2017) — fitness functions as executable guardrails.

### R17 · One tool per job

A dependency list with two HTTP clients, two form libraries, two styling systems or two state managers is not flexibility — it is a fork in every future decision and double the bundle. Each concern gets one choice, recorded:

| Concern             | One choice                                                                        |
| ------------------- | --------------------------------------------------------------------------------- |
| Styling             | one system (utility CSS **or** component library, not both)                       |
| Forms + validation  | one form library, one schema library, and the schema is shared with the API types |
| Client server-state | one cache library                                                                 |
| Client global state | one store, if any is needed at all (R9)                                           |
| Dates               | one library, or `Intl` alone                                                      |

When a second arrives, the PR that adds it also deletes the first, or explains in writing why both must live.

**Smell:** two ways to write a form in the same app, chosen by which file the author copied.

---

## 5 · Splitting thresholds

Heuristics. When one trips, the burden of proof is on _not_ splitting.

| Artifact               | Split when                                 | Into                                            |
| ---------------------- | ------------------------------------------ | ----------------------------------------------- |
| Component file         | > ~200 lines, or > 1 reason to re-render   | container + presentational leaf                 |
| `page.tsx`             | holds anything but fetch + compose         | push logic into `features/<x>/model`            |
| Client component       | needs > ~6 props of feature types          | it wants to be a server component with children |
| `components/` flat dir | > ~30 files                                | features (R3)                                   |
| Feature folder         | > ~25 files, or two unrelated capabilities | two features                                    |
| Barrel `index.ts`      | > ~20 exports                              | narrow the public surface (R11)                 |
| Store slice            | mirrors an API resource                    | delete it, use the cache (R9)                   |
| Hook                   | > ~100 lines or > 3 responsibilities       | compose smaller hooks                           |

---

## 6 · Testing, per layer

| Layer                   | Test kind                     | Tool                                      | Should be                                           |
| ----------------------- | ----------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `model/` pure logic     | unit                          | Vitest, no DOM                            | fast, plentiful, no mocks                           |
| `shared/ui` primitives  | component                     | Testing Library                           | props → DOM + events; no network                    |
| Feature UI              | component with mocked network | Testing Library + MSW                     | the states: loading, error, empty, populated        |
| Server Components / DAL | integration                   | test the exported async function directly | authorization branches especially (R6)              |
| Route flows             | e2e                           | Playwright                                | the 3–5 journeys that pay the bills, not everything |
| Architecture            | fitness function              | `eslint-plugin-boundaries`, budgets       | R1, R16                                             |

Mock at the **network** boundary (MSW), not the module boundary. Mocking your own modules tests that the mock matches the mock; mocking HTTP tests the code you ship. If a component test needs five module mocks, the component is doing five things.

Source: [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/) — "the more your tests resemble the way your software is used, the more confidence they can give you"; [MSW](https://mswjs.io/).

---

## 7 · Monorepo shape

If the app is one of several, the same import direction applies one level up: `apps/*` may import `packages/*`; `packages/*` never import an app; a package with exactly one consumer is not a package yet.

| Package                         | Extract when                                           |
| ------------------------------- | ------------------------------------------------------ |
| `ui`                            | 2+ apps render the same primitives                     |
| `api-client` / `api-types`      | 2+ apps talk to the same backend                       |
| `config` (eslint, ts, tailwind) | day one — it is the cheapest one and it prevents drift |
| anything else                   | it has a second consumer, and only then                |

Premature extraction costs a build boundary, a version, and a release step on every change. The rule of thumb: **extract on the second consumer, not on the first intuition.** Turborepo's caching makes the extracted boundary cheap to build but not free to change.

---

## 8 · Review checklist

- [ ] Boundary lint passes; no new `eslint-disable` on `boundaries/*`.
- [ ] No new `'use client'` on a `layout.tsx`, or on a component that only displays data.
- [ ] Every data-access module imports `server-only`; every authorization check is inside the DAL, not the caller.
- [ ] Every new Server Action re-checks permission as if it were called directly — because it can be.
- [ ] New cached data declares its tag and its invalidation trigger.
- [ ] No new component under a top-level `components/` if a feature owns the concept.
- [ ] Cross-feature import goes through `index.ts`, or does not exist.
- [ ] No new global-store slice holding server data.
- [ ] Filters and tabs are in the URL.
- [ ] Nothing reads `process.env` outside `shared/config`.
- [ ] No second library for a job that already has one.
- [ ] Nothing crossed a splitting threshold without being split.

---

## Sources

- Next.js — [Project structure](https://nextjs.org/docs/app/getting-started/project-structure) · [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) · [Data Security](https://nextjs.org/docs/app/guides/data-security) · [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) · [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) · [`cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag) · [Revalidating](https://nextjs.org/docs/app/getting-started/revalidating)
- React — [`'use client'`](https://react.dev/reference/rsc/use-client) · [`'use server'`](https://react.dev/reference/rsc/use-server)
- [Feature-Sliced Design](https://feature-sliced.design/) — layer/slice/segment model and the one-way import rule
- [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — feature folders, unidirectional codebase
- David Parnas — _On the Criteria To Be Used in Decomposing Systems into Modules_ (CACM 15/12, 1972)
- Robert C. Martin — _Clean Architecture_ (2017), ch. 21 "Screaming Architecture"
- John Ousterhout — _A Philosophy of Software Design_ (2018) — deep modules, pass-through layers
- Martin Fowler — [_LocalDTO_](https://martinfowler.com/bliki/LocalDTO.html)
- TkDodo — [_React Query as a State Manager_](https://tkdodo.eu/blog/react-query-as-a-state-manager)
- Ford, Parsons, Kua — _Building Evolutionary Architectures_ (2017)
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) · [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [Testing Library](https://testing-library.com/docs/guiding-principles/) · [MSW](https://mswjs.io/)
