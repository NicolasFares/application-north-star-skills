# Python backend north star

A target architecture for any Python backend service I build. Application-agnostic: no business domain is assumed. Examples use `ordering`, `billing`, `identity` as stand-in bounded contexts.

This is a **goal document**, not a description of any existing repo. Real repos are measured against it and diverge deliberately, with the divergence written down.

**How to use it:** every rule below has an ID (`R1`…`R14`), a rationale, a source, and the smell that should make you reach for it. In review, cite the ID. When you break a rule, record which one and why.

---

## 0 · The one invariant

**Dependencies point inward. Nothing else about the layering is negotiable.**

```
infrastructure  →  application  →  domain
     (knows everything)              (knows nothing)
```

- `domain/` imports the standard library and `domain/` only.
- `application/` imports `domain/` only.
- `infrastructure/` may import anything.

Source: Cockburn, _Hexagonal Architecture_ (2005) — the application is "equally driven by users, programs, automated test or batch scripts, and can be developed and tested in isolation from its eventual run-time devices and databases." Martin, _Clean Architecture_ (2017), ch. 22 — the Dependency Rule: "source code dependencies must point only inward, toward higher-level policies."

The payoff is not purity. It is that the rules can be executed with no database, no HTTP client and no event loop of anyone else's making — which is what makes them fast to test and cheap to change.

### R1 · The invariant is enforced by a tool, not by discipline

A convention no tool checks is a convention that survives exactly until the first deadline.

```toml
# pyproject.toml
[tool.importlinter]
root_package = "myapp"

[[tool.importlinter.contracts]]
name = "Layers point inward"
type = "layers"
layers = ["myapp.infrastructure", "myapp.application", "myapp.domain"]

[[tool.importlinter.contracts]]
name = "Domain is dependency-free"
type = "forbidden"
source_modules = ["myapp.domain"]
forbidden_modules = ["sqlalchemy", "fastapi", "pydantic", "httpx", "redis", "boto3"]
```

Run `lint-imports` in CI next to `ruff` and `mypy`. Source: [import-linter](https://import-linter.readthedocs.io/) `layers` and `forbidden` contract types.

**Smell:** "the boundary is clean because we keep it clean by hand."

---

## 1 · Reference tree

```
src/myapp/
├── domain/
│   ├── shared/
│   │   ├── errors.py                 DomainError + the 5 root categories (R6)
│   │   └── value_objects/            Email, Money, CountryCode — reused everywhere
│   ├── ordering/                     one package per bounded context (R2)
│   │   ├── entities/
│   │   ├── value_objects/
│   │   ├── services/                 rules that span entities, and only those
│   │   ├── errors.py                 OrderNotFound, OrderAlreadyShipped…
│   │   └── ports/
│   │       ├── repositories/         one ABC per aggregate root
│   │       └── services/             one ABC per external capability (R7)
│   ├── billing/
│   └── identity/
│
├── application/
│   ├── ordering/
│   │   ├── place_order.py            PlaceOrderInput + PlaceOrderOutput + PlaceOrderUseCase
│   │   ├── cancel_order.py
│   │   ├── _read_models.py           only DTOs shared by 2+ use cases in THIS package (R4)
│   │   └── queries/                  read side, allowed to bypass entities (R5)
│   │       └── list_orders.py
│   └── billing/
│
└── infrastructure/
    ├── api/
    │   ├── app.py                    app factory: middleware, handlers, lifespan
    │   ├── errors.py                 ONE domain-error → HTTP mapping (R6)
    │   ├── models.py                 ApiModel base: alias generator, config (R9)
    │   ├── deps.py                   auth, session, container access
    │   └── v1/
    │       ├── router.py             aggregates the resource routers
    │       └── orders/
    │           ├── router.py         endpoints only
    │           ├── schemas.py        request/response models only (R8)
    │           └── admin.py          same resource, different audience (R10)
    ├── persistence/
    │   ├── database.py               engine + session factory; the unit of work (R12)
    │   ├── tables/
    │   │   ├── __init__.py           imports every module → one MetaData for Alembic
    │   │   └── ordering.py           one module per context (R11)
    │   ├── mappers/
    │   │   ├── __init__.py           configure_mappers() entry point
    │   │   └── ordering.py
    │   └── repositories/
    │       └── ordering/             one adapter per port
    ├── auth/ · storage/ · cache/ · external/ · messaging/
    │                                 one adapter per vendor, each behind a port
    └── containers/                   composed DI, split by concern (R13)
        ├── __init__.py               ApplicationContainer
        ├── infrastructure.py         singletons: db, cache, storage, clients
        └── repositories.py           factories: session-scoped
```

Two things to notice: **the second level is the business, not the pattern** (`ordering/`, not `entities/`), and **the same context name appears in all three layers**, so a feature is a vertical slice you can grep by name.

Source: Martin, _Clean Architecture_, ch. 21 "Screaming Architecture" — the top level of a codebase should announce what the system does, not what framework it uses. Parnas, _On the Criteria To Be Used in Decomposing Systems into Modules_ (CACM, 1972) — decompose around the design decisions likely to change, not around processing steps.

### R2 · Package by feature, then by pattern — never the reverse

`domain/entities/*.py` flat across all contexts works up to roughly 20 entities and then stops working: every business change touches four directories, and nothing tells you which entities belong together.

Under ~15 entities total, a flat `entities/ value_objects/ ports/` is fine and splitting early is speculative. Past that, introduce the context packages. The migration is mechanical (move + fix imports), so it is safe to defer — but do it before the first cross-context circular import, not after.

**Smell:** a directory with 30+ sibling files whose only shared property is "they are all entities."

---

## 2 · Application layer

### R3 · A use case is one file: Input + Output + UseCase

Everything about one operation lives in one module. Not a `dtos/` package, not a `services/` package, not a `commands/` package.

```python
# application/ordering/place_order.py

@dataclass(frozen=True)
class PlaceOrderInput:
    customer_id: UUID
    lines: tuple[OrderLineInput, ...]
    currency: Currency          # a domain value object, not a str

@dataclass(frozen=True)
class PlaceOrderOutput:
    order_id: UUID
    status: str

class PlaceOrderUseCase:
    def __init__(self, orders: OrderRepository, pricing: PricingService) -> None: ...
    async def execute(self, data: PlaceOrderInput) -> PlaceOrderOutput: ...
```

Why one file: the three types change together, always, and never independently. Splitting them puts a file boundary where there is no change boundary — you pay three opens to read one operation, and so does every agent working in the repo.

Source: Ousterhout, _A Philosophy of Software Design_ (2018), ch. 6 — "bring together if information is shared"; the cost of a module boundary is paid on every read. Vernon, _Implementing DDD_ (2013), ch. 14 — Application Services are thin, one per use case, and hold no business logic.

### R4 · There is no global `dtos/` package

An empty `application/dtos/` is worse than none: it advertises a location nobody uses, so every newcomer looks there first and finds nothing.

Shared DTOs are real, but their scope is the context package, not the app:

- used by **one** use case → stays in the use-case module (R3);
- used by **2+ use cases in one context** → `application/<context>/_read_models.py`;
- used by **two contexts** → you have found a missing shared kernel, or a wrong boundary. Decide which, don't paper over it with a global package.

A global `dtos/` module has no reason to change — which means it changes for _every_ reason. That is the definition of low cohesion.

**Smell:** a package whose docstring describes a category rather than a capability.

### R5 · Application services are use cases; `application/services/` is the exception

In DDD vocabulary an "application service" _is_ the use case. If a service package exists at all, it holds cross-cutting orchestration that many use cases invoke and that is not a business rule — audit trail writing, outbox dispatch, idempotency bookkeeping.

**One or two modules there is a sign of health. Ten is an anemic domain**: logic that belongs on entities has drained into procedural services and the entities have become data bags.

Source: Fowler, [_AnemicDomainModel_](https://martinfowler.com/bliki/AnemicDomainModel.html) (2003). Vernon, _Implementing DDD_, ch. 14.

### R6 · Errors: five roots, then one module per context

Two failure modes to avoid. One 600-line `exceptions.py` for the whole app is a module every context imports and every change touches. But a bare class-per-failure explosion is just as bad at the edge: it forces the transport layer into an N-arm `try/except` per endpoint.

Both are fixed by a taxonomy:

```python
# domain/shared/errors.py
class DomainError(Exception): ...
class NotFoundError(DomainError): ...      # → 404
class ConflictError(DomainError): ...      # → 409
class ValidationError(DomainError): ...    # → 422
class PermissionError_(DomainError): ...   # → 403
class PreconditionFailedError(DomainError):  # → 400 + structured reasons
    def __init__(self, message: str, reasons: Sequence[Reason]) -> None: ...

# domain/ordering/errors.py
class OrderNotFound(NotFoundError): ...
class OrderAlreadyShipped(ConflictError): ...
```

```python
# infrastructure/api/errors.py — registered once on the app
_STATUS = {NotFoundError: 404, ConflictError: 409, ValidationError: 422, ...}
```

Endpoints then catch nothing routine. They only intercept the handful of errors that need a _bespoke_ payload, and the rest are handled centrally — which is also the only way the mapping stays consistent across 200 endpoints.

Concrete rules: exceptions live in the context they belong to; the domain never knows an HTTP status code; the message is for developers, the machine-readable `code`/`reasons` are for clients.

**Smell:** an `except` block in a route that lists more than three exception types; or two endpoints returning different statuses for the same domain failure.

---

## 3 · Boundary types

### R7 · Ports are named for the need, not for the vendor

`ports/services/payment_provider.py` with `charge(amount, customer)` — not `stripe_client.py`, and no vendor type in any signature. The port belongs to the _inside_; the adapter belongs to the outside. If you can tell which SaaS you bought by reading the port, the dependency has been inverted in name only.

Source: Cockburn (2005) — ports are defined by the application's conversation, adapters translate that conversation to a technology.

A second adapter you always get for free and should always keep: the fake. `FakePaymentProvider` next to `StripePaymentProvider` is not test clutter, it is the reason the port exists.

### R8 · Two types per boundary, and they are allowed to look alike

An HTTP request schema and a use-case Input will often carry the same field names. Sharing one class to remove the duplication is the single most tempting mistake at this seam.

Keep them separate because **they are different kinds of type, not two copies of one type**:

|              | Request/Response schema                                  | Use-case Input/Output                                   |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------- |
| Job          | describe the wire contract                               | describe the operation's arguments                      |
| Types        | JSON-native: `str`, `int`, ISO strings                   | domain types: `Currency`, `Email`, `OrderStatus`        |
| Validates    | shape, format, size, required-ness                       | nothing — invalid values were already rejected upstream |
| Changes when | clients need a new field, a rename, a deprecation window | the business operation changes                          |
| Owned by     | `infrastructure`                                         | `application`                                           |
| Depends on   | pydantic                                                 | nothing but `domain`                                    |

Sharing them means: a wire rename becomes an application-layer change; a field kept only for a deprecated client leaks into the domain; the use case can no longer be called from a CLI, a worker or a test without constructing pydantic models; and `application/` grows a pydantic dependency, which breaks R1.

**Honest counter-argument.** Fowler, [_LocalDTO_](https://martinfowler.com/bliki/LocalDTO.html) (2004), argues against DTOs when there is no remote boundary: the mapping is real work and buys nothing if both sides are identical. Ousterhout calls the same thing a _pass-through_ — a layer that adds no abstraction. Both are right when the two types are field-for-field identical **with identical types**.

So the criterion is: **the schema and the Input must differ in kind, or one of them should not exist.** In practice they do, at the conversion point — `type: str` on the wire becomes `type: VehicleType` in the Input, and that `str → enum` conversion is exactly the translation the boundary exists to perform. Put that conversion in one place:

```python
# schemas.py — infrastructure owns the translation, both directions
class PlaceOrderRequest(ApiModel):
    currency: str
    def to_input(self) -> PlaceOrderInput:
        return PlaceOrderInput(currency=Currency(self.currency), ...)
```

`to_input()` on the request, `from_output()` (or `model_validate`) on the response. The route then reads: parse → convert → execute → convert → return, with zero business vocabulary in it.

### R8b · Reads may take the shortcut

For a 40-field list endpoint, three near-identical types (row → Output → Response) is pure ceremony. On the **read side only**, allow:

- a query object in `application/<context>/queries/` that returns a flat read-model dataclass, built directly from a projection — no aggregate rehydration;
- the response model declared with `model_config = ConfigDict(from_attributes=True)` and built with `Response.model_validate(read_model)`, so the field list is declared twice, never _copied_ twice.

The write side keeps the full path: commands go through aggregates so invariants hold. Source: Fowler, [_CQRS_](https://martinfowler.com/bliki/CQRS.html) (2011) — the read model may be shaped for the screen and need not be the domain model.

**Smell:** a use case whose `execute()` is 30 lines of `field=row.field`.

---

## 4 · Infrastructure

### R9 · One `ApiModel` base owns every wire convention

```python
# infrastructure/api/models.py
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,   # snake_case in Python, camelCase on the wire
        populate_by_name=True,      # accept both when validating
        extra="forbid",             # unknown fields are a client bug, not a shrug
        frozen=True,                # responses are values
    )
```

Every request and response model inherits from it. One class controls casing, unknown-field policy, and JSON encoders for the whole API, and the OpenAPI schema follows automatically — including generated client types.

Source: pydantic [Alias docs](https://docs.pydantic.dev/latest/concepts/alias/) — `alias_generator` in `ConfigDict`, and `pydantic.alias_generators.to_camel`. Google JSON Style Guide recommends camelCase property names for JSON APIs.

Three cautions:

- **One base, not two.** `RequestModel` and `ResponseModel` split is worth it only when the configs genuinely differ (e.g. responses `frozen`, requests not). Otherwise it is two names for one rule.
- `to_camel` has no acronym handling — `api_key` → `apiKey`, but `product_id` → `productId` and `iso_code` → `isoCode` are fine while `oauth2_url` is not. Pin the odd ones with an explicit `Field(alias=...)`.
- **Retrofitting is a breaking change.** Flipping casing on a live API changes every payload and every generated client. Do it at a version bump, or ship it serialization-only (`serialization_alias` + `populate_by_name`) so old clients keep sending snake_case during the window.

### R10 · Endpoints are grouped by resource; audience is a file inside it

```
api/v1/orders/
├── router.py     public endpoints
├── admin.py      admin endpoints, same resource
└── schemas.py
```

Not `orders.py` + `admin_orders.py` as siblings at the top level. The resource is the thing that changes together; the audience is a property of individual endpoints. Grouping by audience scatters one concept across two directories and guarantees the two drift.

Source: FastAPI, [Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/) — `APIRouter` per resource module, assembled by a parent router.

**Split trigger:** a router module past ~300 lines, or holding more than ~8 endpoints, becomes a package. Schemas leave the router file at the _first_ split, not later.

### R11 · Persistence mapping is split by context, with one registry

Table definitions and mappers grow linearly with the schema and hit four figures fast. Split them per context — but respect the two constraints that make this non-obvious:

1. **Alembic autogenerate needs one `MetaData` object** containing every table. So `tables/__init__.py` imports every submodule and re-exports the shared `metadata`; `env.py` imports only that.
2. **SQLAlchemy needs every mapper configured before first use.** `mappers/__init__.py` exposes a single `configure_all()` that imports each context module; the app calls it once at startup.

```python
# persistence/tables/__init__.py
from .base import metadata            # the single MetaData
from . import ordering, billing, identity   # noqa: F401 — registers tables on it
```

With imperative mapping (`registry.map_imperatively`), the same split applies to mappers, and the domain classes stay free of ORM decoration — which is what keeps R1 true for `domain/`. Source: SQLAlchemy, [Imperative Mapping](https://docs.sqlalchemy.org/en/20/orm/mapping_styles.html#imperative-mapping).

### R12 · The transaction boundary is one line, in one place

One request = one transaction, opened at the outermost edge and nowhere else. Repositories `flush()` to get identities; they never `commit()`. If two use cases must be atomic, they share the session that was already opened — not a nested transaction invented inside a repository.

Prefer a single dependency (`Depends(get_session)` or one middleware) over "every endpoint remembers to open a session": a boundary that each endpoint re-implements is a boundary each endpoint can forget.

**Smell:** `commit()` anywhere below the edge, or a route that opens two sessions.

### R13 · The container is composed, not one class

Past ~200 lines a single container becomes the file every feature branch touches and every merge conflicts on. Split it by lifetime and concern, compose at the top:

```python
class Infrastructure(containers.DeclarativeContainer):
    config = providers.Configuration()
    database = providers.Singleton(Database, dsn=config.db.dsn)
    cache    = providers.Singleton(RedisCache, url=config.redis.url)
    storage  = providers.Singleton(S3Storage, bucket=config.s3.bucket)

class Repositories(containers.DeclarativeContainer):
    infra  = providers.DependenciesContainer()
    orders = providers.Factory(SqlAlchemyOrderRepository)

class ApplicationContainer(containers.DeclarativeContainer):
    config = providers.Configuration()
    infra  = providers.Container(Infrastructure, config=config)
    repos  = providers.Container(Repositories, infra=infra)
```

Source: dependency-injector, [Application example (multiple containers)](https://python-dependency-injector.ets-labs.org/examples/application-multiple-containers.html) and [Decoupled packages](https://python-dependency-injector.ets-labs.org/examples/decoupled-packages.html) — `providers.Container` for nesting, `providers.DependenciesContainer` for packages that must not know their parent.

Two related rules:

- **Register adapters and repositories. Assemble use cases at exactly one seam.** Either every route pulls a use-case provider from the container, or every route constructs it — one idiom, not two. Two idioms for the same job is the most common way this layer rots.
- **Delete `container.wire(...)` if nothing uses `@inject`/`Provide[...]`.** Dead wiring is a call that costs startup time and teaches the next reader a pattern the codebase does not follow.

### R14 · Settings are typed, validated once, and injected

One `pydantic-settings` class, validated at startup, passed into the container — never `os.environ` reads scattered at module import time. Environment-dependent switches (mock auth, fake payments) are validated to be impossible outside `development`/`local` _in the settings class itself_, so the guarantee is one assertion instead of a convention.

---

## 5 · Splitting thresholds

Heuristics, not laws — but when one trips, the burden of proof is on _not_ splitting.

| Artifact                   | Split when                            | Into                                        |
| -------------------------- | ------------------------------------- | ------------------------------------------- |
| Any module                 | > ~400 lines, or covers > 1 aggregate | per aggregate / per context                 |
| Router module              | > ~300 lines or > 8 endpoints         | package: `router.py` + `schemas.py`         |
| `exceptions.py`            | > ~15 classes                         | roots in `shared/`, rest per context        |
| `tables.py` / `mappers.py` | > ~300 lines                          | per context, one shared `MetaData`/registry |
| DI container               | > ~200 lines                          | sub-containers by lifetime                  |
| `entities/` flat dir       | > ~15 files                           | context packages (R2)                       |
| Use-case package           | > ~15 modules                         | sub-package by sub-capability               |

---

## 6 · Testing, per layer

The layering is only worth its cost if the test pyramid matches it.

| Layer                         | Test kind            | Dependencies             | Should be                                       |
| ----------------------------- | -------------------- | ------------------------ | ----------------------------------------------- |
| `domain/`                     | pure unit            | none                     | thousands, milliseconds, no fixtures            |
| `application/`                | unit with fake ports | in-memory fakes          | one per use case, including each failure branch |
| `infrastructure/persistence/` | integration          | real DB (testcontainers) | one per repository, plus a migration-drift gate |
| `infrastructure/api/`         | integration          | real app, real DB        | happy path + auth + error mapping per endpoint  |
| architecture                  | fitness function     | none                     | `lint-imports` in CI (R1)                       |

If a use-case test needs a database, either the use case reached past its ports or the fake is missing. Both are bugs in the design, not in the test.

Source: Martin, _Clean Architecture_, ch. 28 "The Test Boundary". Ford/Parsons/Kua, _Building Evolutionary Architectures_ (2017) — architectural fitness functions as executable guardrails.

---

## 7 · Review checklist

- [ ] `lint-imports` passes; no new contract exemptions.
- [ ] No new file in a global `dtos/`, `helpers/`, `utils/`, `common/` package.
- [ ] New exception subclasses one of the five roots and lives in its context.
- [ ] New endpoint's schemas inherit `ApiModel`; no ad-hoc `BaseModel`.
- [ ] No pydantic import under `application/` or `domain/`.
- [ ] No `commit()` outside the transaction boundary.
- [ ] New port has a fake adapter alongside the real one.
- [ ] Use case is assembled the same way as its neighbours.
- [ ] Nothing crossed a splitting threshold without being split.

---

## Sources

- Alistair Cockburn — [_Hexagonal Architecture_](https://alistair.cockburn.us/hexagonal-architecture/) (2005)
- Robert C. Martin — _Clean Architecture_ (2017), ch. 21–22, 28
- Eric Evans — _Domain-Driven Design_ (2003)
- Vaughn Vernon — _Implementing Domain-Driven Design_ (2013), ch. 14
- David Parnas — _On the Criteria To Be Used in Decomposing Systems into Modules_ (CACM 15/12, 1972)
- John Ousterhout — _A Philosophy of Software Design_ (2018), ch. 4–7
- Martin Fowler — [_LocalDTO_](https://martinfowler.com/bliki/LocalDTO.html), [_AnemicDomainModel_](https://martinfowler.com/bliki/AnemicDomainModel.html), [_CQRS_](https://martinfowler.com/bliki/CQRS.html)
- Ford, Parsons, Kua — _Building Evolutionary Architectures_ (2017)
- [import-linter](https://import-linter.readthedocs.io/) · [pydantic aliases](https://docs.pydantic.dev/latest/concepts/alias/) · [FastAPI bigger applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/) · [SQLAlchemy imperative mapping](https://docs.sqlalchemy.org/en/20/orm/mapping_styles.html#imperative-mapping) · [dependency-injector multiple containers](https://python-dependency-injector.ets-labs.org/examples/application-multiple-containers.html)
