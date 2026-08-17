# Backend audit rubric (R1–R14)

Per rule: what to check, how, and what a violation looks like. Cite the rule ID in every
finding. Severity: **high** = the invariant or a security/data rule; **medium** = structural
drift that compounds; **low** = threshold/ceremony issues.

## R1 — Dependencies point inward, enforced by a tool

- Check `pyproject.toml` (or setup.cfg/.importlinter) for import-linter contracts covering
  layers + forbidden framework imports in domain/application. Missing contracts = high, even
  if the imports happen to be clean today.
- Grep `domain/` and `application/` for `import pydantic|sqlalchemy|fastapi|httpx|` any
  vendor SDK. Any hit = high.
- Contract exemption lists (`ignore_imports`) = medium; each should be a ledger entry instead.

## R2 — Package by feature, then by pattern

- Look at `domain/`'s second level: business names (`ordering/`) or pattern names
  (`entities/`, flat)? Flat is fine under ~15 entities; past that = medium.
- Same context name should appear in all three layers (grep a context name across
  `domain/ application/ infrastructure/`). A context existing in one layer only = medium.

## R3 — A use case is one file: Input + Output + UseCase

- Sample `application/<context>/` modules: each operation file should define its Input,
  Output, and UseCase together as frozen dataclasses + class. Inputs living in a separate
  `dtos/`/`commands/` package = medium.
- Use cases holding framework types (pydantic models, ORM sessions) in signatures = high (R1 leak).

## R4 — No global `dtos/` package

- `find application -name 'dtos' -o -name 'utils' -o -name 'helpers' -o -name 'common'`.
  Any global technical-category package = medium. Context-local `_read_models.py` is the
  sanctioned home.

## R5 — `application/services/` is the exception

- Count modules in `application/**/services/`. 1–2 cross-cutting orchestration modules =
  fine. ~10 = medium: check whether entities are data bags (anemic domain) — business logic
  in procedural services that belongs on entities.

## R6 — Errors: five roots, one module per context, one edge mapping

- `domain/shared/errors.py` (or equivalent): a DomainError root with ~5 category roots.
  One giant `exceptions.py` (>~15 classes) = medium.
- Exactly one domain-error → HTTP status mapping registered on the app. Grep routes for
  `except` blocks and framework HTTP exceptions raised in handlers: an `except` listing >3
  types, or two endpoints mapping the same domain failure to different statuses = medium.
  HTTP status codes appearing inside `domain/` = high.

## R7 — Ports named for the need, not the vendor

- Read port module names and signatures: a vendor name (`stripe_client.py`) or vendor type
  in a port signature = medium.
- Every port should have a fake adapter beside the real one. Ports with no fake = medium
  (check what application tests use instead — if they mock the port ad hoc per test, same finding).

## R8 / R8b — Two types per boundary; reads may shortcut

- Request schemas own the conversion (`to_input()` or equivalent); use cases never see
  pydantic = high if they do.
- A schema class imported by `application/` code, or a use-case Input imported by `schemas.py`
  *as the schema itself* = medium.
- Read side: list endpoints may use query objects returning read models + `from_attributes`
  responses. A use case whose execute() is 30 lines of `field=row.field` = low (invite R8b).

## R9 — One `ApiModel` base owns the wire convention

- Find the base model; every request/response model should inherit it. Ad-hoc `BaseModel`
  subclasses in `api/**/schemas.py` = medium.
- The base should own alias generation, unknown-field policy (`extra`), and frozen-ness in
  ONE place. Multiple bases with identical config = low.

## R10 — Endpoints grouped by resource; audience is a file inside

- `api/v1/` layout: resource packages (`orders/`) with audience files inside (`admin.py`),
  not `orders.py` + `admin_orders.py` siblings = medium if violated.
- Router modules >~300 lines or >8 endpoints unsplit = low (§5).

## R11 — Persistence split by context, one MetaData/registry

- `tables/__init__.py` imports every context module onto one shared `MetaData`; migrations
  autogenerate from it. Two `MetaData` objects, or tables defined outside `tables/` = medium.
- Schema change without a migration in the same commit (check migration tool's drift gate
  exists in CI) = high if there is no drift gate at all.

## R12 — The transaction boundary is one line, in one place

- Grep for `commit()`: it should appear at exactly the edges (middleware / worker job
  function). Any `commit()` inside a repository or use case = high.
- Routes opening their own sessions ad hoc (rather than one dependency/middleware) = medium.

## R13 — The container is composed, not one class

- One DI idiom for use-case assembly: either all routes pull from the container or all
  construct via a per-resource dependency seam. Two idioms coexisting = medium.
- A single container >~200 lines = low (§5). `container.wire(...)` with no `@inject` usage = low.

## R14 — Settings typed, validated once, injected

- Grep for `os.environ`/`getenv` outside the settings module: any hit = medium (high if it
  gates auth/security behavior).
- Dangerous switches (mock auth, fake payments) must be validated impossible outside
  dev/local *inside the settings class* = high if reachable in prod config.

## §5 thresholds / §6 tests (cross-cutting)

- Flag modules past the spec's splitting thresholds = low each.
- Test suite shape: domain tests with fixtures/DB = medium; use-case tests hitting a real DB =
  medium (the fake is missing or the use case reaches past its ports); no API-behavior suite
  (real app + real DB, auth + error mapping per endpoint) = medium.
