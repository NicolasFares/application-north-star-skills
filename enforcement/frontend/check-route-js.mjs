#!/usr/bin/env node
// R16 guardrail: caps first-load JS per route.
//
// Next 16.3+/Turbopack writes <app>/.next/diagnostics/route-bundle-stats.json
// on every `next build` — an array of { route, firstLoadUncompressedJsBytes,
// firstLoadChunkPaths }, one entry per route. That's the mechanism this
// script uses (no manual chunk-summing: the file already has the number).
//
// Usage: node check-route-js.mjs
//   APP_DIR=apps/web            the Next app directory (default: apps/web)
//   BUILD_CMD="pnpm ... build"  how to build it (default: pnpm --filter web build)
//   SKIP_BUILD=1                CI already built — read the existing stats file.
//   ROUTE_JS_MAX_KB=350         the budget. Ratchet: measure your worst route,
//                               set max * 1.1 rounded up, lower it over time.
// A missing stats file is a hard failure, not a silent skip.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const appDir = process.env.APP_DIR ?? "apps/web";
const statsPath = path.join(appDir, ".next/diagnostics/route-bundle-stats.json");

if (process.env.SKIP_BUILD !== "1") {
  const buildCmd = process.env.BUILD_CMD ?? "pnpm --filter web build";
  execSync(buildCmd, { stdio: "inherit", env: process.env });
}

if (!existsSync(statsPath)) {
  console.error(
    `::error::Route bundle stats file not found at ${statsPath}. Expected Next 16.3+/Turbopack to emit it on \`next build\` — did the build fail, or has the diagnostics artifact moved?`
  );
  process.exit(1);
}

const MAX_KB = Number(process.env.ROUTE_JS_MAX_KB ?? 350);

const stats = JSON.parse(readFileSync(statsPath, "utf8"));
const rows = stats
  .map((r) => ({ route: r.route, kb: r.firstLoadUncompressedJsBytes / 1024 }))
  .sort((a, b) => b.kb - a.kb);

const routeWidth = Math.max(...rows.map((r) => r.route.length), "Route".length);
console.log(`${"Route".padEnd(routeWidth)}  First Load JS`);
for (const { route, kb } of rows) {
  const over = kb > MAX_KB;
  console.log(`${route.padEnd(routeWidth)}  ${kb.toFixed(1).padStart(9)} KB${over ? "  OVER BUDGET" : ""}`);
}

const overBudget = rows.filter((r) => r.kb > MAX_KB);
if (overBudget.length > 0) {
  for (const { route, kb } of overBudget) {
    console.error(`::error::${route} first-load JS is ${kb.toFixed(1)} KB, over the ${MAX_KB} KB budget (ROUTE_JS_MAX_KB)`);
  }
  process.exit(1);
}
