---
name: backend-north-star
description: "Enforce a hexagonal Python backend target architecture (rules R1-R14) on any backend change. Use BEFORE writing or reviewing backend code: new API routes/endpoints, use cases, domain rules, ports/adapters/repositories, migrations, error handling, DI wiring, or backend tests. Triggers: backend change, add endpoint, add use case, new port, new repository, review backend, architecture check."
license: Apache-2.0
metadata:
  version: "1.0.0"
  spec: references/python-backend-north-star.md
---

# Backend north star

The full spec is `references/python-backend-north-star.md` (rules **R1–R14** — cite IDs in
review, don't paraphrase). It is a goal document: repos are measured against it and diverge
deliberately, with each divergence written down in an adoption ADR's divergence ledger.

## Map this to the repo first

The spec uses stand-ins: root package `myapp`, contexts `ordering`/`billing`/`identity`.
Before applying it, find the repo's mapping — an adoption ADR or a "north star" section in
CLAUDE.md/AGENTS.md naming the real root package, bounded contexts, gate commands, and the
ledger's location. If none exists, infer the root package from `pyproject.toml`, say you did,
and suggest creating the mapping (the `north-star-diverge` skill has the ADR template).
**Check the ledger before "fixing" something that looks off** — a recorded divergence is a
decision, not drift. If you diverge anew, append to the ledger with the rule ID.

## The one invariant (R1)

```
infrastructure  →  application  →  domain
```

- `domain/` imports stdlib + `domain/` only. No pydantic, no ORM, no vendor SDK.
- `application/` imports `domain/` only. Frozen-dataclass Inputs/Outputs, never pydantic.
- `infrastructure/` may import anything.
- Enforced by [import-linter](https://import-linter.readthedocs.io/) contracts in
  `pyproject.toml`, run in CI. Never add a contract exemption; fix the import direction instead.

## Where does this code go?

| You are writing…                               | It goes…                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A business rule / entity / value object        | `domain/<context>/`                                                                                          |
| A new exception                                | subclass one of the 5 roots in `domain/shared/errors.py`, define in `domain/<context>/errors.py` (R6)        |
| A port (external capability / repository seam) | ABC in `domain/<context>/ports/`, named for the need, never the vendor (R7)                                  |
| An operation (command)                         | ONE file `application/<context>/<verb_noun>.py`: `XInput` + `XOutput` dataclasses + `XUseCase` (R3)          |
| A read/list endpoint's query                   | `application/<context>/queries/` returning read-model dataclasses; may bypass the aggregate (R8b)            |
| A DTO shared by 2+ use cases in one context    | `application/<context>/_read_models.py` — never a global `dtos/` or `utils/` (R4)                            |
| An adapter (SQL, vendor SDK, external service) | `infrastructure/{persistence/repositories,external,auth,storage,messaging}/` — subclass the port ABC         |
| The port's fake                                | beside the real adapter — every port has one; application tests use it (R7)                                  |
| An HTTP endpoint                               | `infrastructure/api/v1/<resource>/{router,schemas}.py`; audience is a file inside the resource (R10)         |
| A table                                        | `infrastructure/persistence/tables/<context>.py` on the ONE shared `MetaData` + migration in same commit (R11) |
| A setting / env read                           | the one typed settings class — validated at boot, injected (R14)                                             |

## Hard rules the tools don't fully catch

- **R6**: routes catch (almost) nothing — raise the domain error and let the ONE mapping in
  `infrastructure/api/errors.py` render it. A route-level `except` is only for a bespoke
  payload. Never raise the framework's HTTP exception from business code.
- **R8**: request schemas (pydantic, inherit `ApiModel`) own `to_input()`; the use case never
  sees pydantic. Responses via `from_attributes` over read models. Never share one class
  across the wire/application seam — they must differ in kind, or one shouldn't exist.
- **R9**: every wire model inherits the ONE `ApiModel` base — no ad-hoc `BaseModel`. The base
  owns casing, unknown-field policy, encoders; pin acronym oddities with explicit `Field(alias=...)`.
- **R12**: `commit()` exists at exactly the transaction boundary (one middleware or job edge).
  Repositories `flush()` only. If you typed `commit` anywhere else, stop.
- **R13**: process-lifetime collaborators go in the composed containers; use cases are
  assembled at exactly one seam — one idiom, don't invent a second.
- **Splitting thresholds** (spec §5): module >~400 lines, router >~300 lines/8 endpoints,
  container >~200 lines, use-case package >~15 modules → split before merging.

## Tests must match the layer (spec §6)

| Layer                     | Test kind             | Dependencies                                                              |
| ------------------------- | --------------------- | ------------------------------------------------------------------------- |
| domain                    | pure unit             | none — thousands, milliseconds, no fixtures                               |
| application               | unit with fake ports  | the in-memory fakes, one test per use case incl. each failure branch      |
| infrastructure edge units | unit / TestClient     | none                                                                      |
| API behavior              | integration           | real app + real DB — happy + auth + error mapping per endpoint            |
| architecture              | fitness function      | `lint-imports` in CI (R1)                                                 |

If a use-case test wants a database, the use case reached past its ports or the fake is
missing — fix the design, not the test.

## Pre-merge checklist (spec §7)

- [ ] Lint gates green: linter, `lint-imports` (no new exemptions), strict type check, tests
- [ ] No new file in a global `dtos/`, `helpers/`, `utils/`, `common/` package
- [ ] New exception subclasses one of the five roots, lives in its context
- [ ] New endpoint: schemas inherit `ApiModel`, OpenAPI-visible response model; regenerate
      generated client types if the repo has them
- [ ] No pydantic/ORM import under `application/` or `domain/`
- [ ] No `commit()` below the edge
- [ ] New port has a fake beside the real adapter, and application tests use it
- [ ] Touched tables? Migration in the same commit
- [ ] Nothing crossed a splitting threshold without being split
- [ ] Divergence from a rule? Recorded in the adoption ADR's ledger with its rule ID
