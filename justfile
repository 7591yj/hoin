set positional-arguments

default:
  @just --list

fmt:
  cargo fmt --all

lint:
  cargo clippy --workspace --all-targets -- -D warnings

test:
  cargo test --workspace

check:
  cargo check --workspace

build-models *models:
  ./scripts/build-models.sh build {{models}}

run-cli *args:
  cargo run -p hoin-cli -- {{args}}

check-models *models:
  ./scripts/build-models.sh verify {{models}}
