# R1 enforcement — import-linter contracts

The backend spec's one invariant (`infrastructure → application → domain`) is enforced by
[import-linter](https://import-linter.readthedocs.io/), not by review discipline.

Add the `import-linter` dev dependency, paste this into your `pyproject.toml`, replace
`myapp` with your root package, and edit the forbidden lists to name the frameworks your
repo actually uses (the point is: no web framework, no ORM, no vendor SDK below
infrastructure — pydantic included). Run `lint-imports` in CI.

```toml
[tool.importlinter]
root_package = "myapp"
include_external_packages = true

# R1: dependencies point inward. Entrypoint shims (composition roots) sit
# outside the three layers.
[[tool.importlinter.contracts]]
name = "Layers point inward"
type = "layers"
layers = ["myapp.infrastructure", "myapp.application", "myapp.domain"]

# R1: domain imports stdlib + domain only.
[[tool.importlinter.contracts]]
name = "Domain is dependency-free"
type = "forbidden"
source_modules = ["myapp.domain"]
forbidden_modules = [
    "sqlalchemy",
    "fastapi",
    "starlette",
    "asyncpg",
    "pydantic",
    "pydantic_settings",
    "jwt",
    "cryptography",
    "httpx",
]

# R1: application imports domain only.
[[tool.importlinter.contracts]]
name = "Application imports domain only"
type = "forbidden"
source_modules = ["myapp.application"]
forbidden_modules = [
    "fastapi",
    "starlette",
    "pydantic",
    "pydantic_settings",
    "sqlalchemy",
    "asyncpg",
    "jwt",
    "cryptography",
    "httpx",
]
```

Never add a contract exemption; fix the import direction instead.
