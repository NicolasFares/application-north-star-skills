// R1 enforcement — eslint-plugin-boundaries config for the frontend spec's
// import-direction invariant:
//
//   app/  →  features/  →  shared/
//              │
//              └────────→  server/   (credential seam only)
//
// Drop this into your Next.js app's flat eslint config (spread your base
// config before it). Elements are classified from the app's `src/`.
//
// `app`, `shared`, `server` use `mode: "full"` so every file is its own
// element (no folder-wide grouping) — that's why they need explicit
// self-referencing allow policies below: two files in the same top-level dir
// are still a cross-element import under `full` mode. `feature` is folder
// mode (the default): every file under a given `features/<name>` shares one
// element, so same-feature imports never reach the policy check.
import boundaries from "eslint-plugin-boundaries";

export const architecture = {
  files: ["src/**/*.ts", "src/**/*.tsx"],
  plugins: { boundaries },
  settings: {
    "import/resolver": {
      typescript: { project: "./tsconfig.json" },
    },
    "boundaries/elements": [
      { type: "app", mode: "full", pattern: "src/app/**/*" },
      { type: "feature", pattern: "src/features/*", capture: ["feature"] },
      { type: "shared", mode: "full", pattern: "src/shared/**/*" },
      { type: "server", mode: "full", pattern: "src/server/**/*" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [
          { from: { element: { type: "app" } }, allow: { to: { element: { type: ["app", "feature", "shared", "server"] } } } },
          { from: { element: { type: "feature" } }, allow: { to: { element: { type: ["shared", "server"] } } } },
          { from: { element: { type: "shared" } }, allow: { to: { element: { type: "shared" } } } },
          { from: { element: { type: "server" } }, allow: { to: { element: { type: ["server", "shared"] } } } },
          // A cross-feature import (R11) gets its own reviewed policy here —
          // scoped to the two features, with the revisit trigger in a comment —
          // and a divergence-ledger entry. Never an eslint-disable.
        ],
      },
    ],
    "boundaries/entry-point": [
      "error",
      {
        // Only the `feature` policies constrain anything; other element types
        // fall through unmatched and stay unrestricted (hence default "allow" —
        // the per-file default-deny lives inside the disallow-then-allow pair).
        default: "allow",
        policies: [
          { target: { element: { type: "feature" } }, disallow: ["**"] },
          { target: { element: { type: "feature" } }, allow: ["index.ts", "server.ts"] },
        ],
      },
    ],
  },
};

export const testOverrides = {
  // Tests may deep-import a feature's internal modules to mock them; the
  // dependency-direction rules above still apply.
  files: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx"],
  rules: {
    "boundaries/entry-point": "off",
  },
};

export default [architecture, testOverrides];
