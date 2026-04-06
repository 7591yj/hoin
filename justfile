set positional-arguments

default:
  @just --list

fmt:
  cargo fmt --all
  ./scripts/ruff-models.sh format

lint:
  cargo clippy --workspace --all-targets -- -D warnings
  ./scripts/ruff-models.sh lint

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

check-models *models:
  ./scripts/build-models.sh verify {{models}}
