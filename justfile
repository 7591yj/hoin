set positional-arguments

default:
  @just --list

fmt:
  cargo fmt --all
  ./scripts/ruff-models.sh format

lint fix="":
  if [ "{{fix}}" = "--fix" ]; then cargo clippy --fix --allow-dirty --allow-staged --workspace --all-targets -- -D warnings; else cargo clippy --workspace --all-targets -- -D warnings; fi
  if [ "{{fix}}" = "--fix" ]; then ./scripts/ruff-models.sh lint --fix; else ./scripts/ruff-models.sh lint; fi

test:
  cargo test --workspace

check:
  cargo check --workspace
  ./scripts/ruff-models.sh check

fmt-models *models:
  ./scripts/ruff-models.sh format {{models}}

lint-models *models:
  ./scripts/ruff-models.sh lint {{models}}

check-models-python *models:
  ./scripts/ruff-models.sh check {{models}}

build-models *models:
  ./scripts/build-models.sh build {{models}}

run-cli *args:
  cargo run -p hoin-cli -- {{args}}

serve:
  cd apps/web && bun run src/server.ts

check-models *models:
  ./scripts/build-models.sh verify {{models}}
