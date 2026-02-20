.PHONY: install test lint build run clean uninstall help

# Find node/npm — handle nvm lazy-loading which breaks in non-interactive shells
NODE_BIN := $(shell command -v node 2>/dev/null || echo "$(HOME)/.nvm/versions/node/$(shell ls $(HOME)/.nvm/versions/node 2>/dev/null | grep '^v' | sort -V | tail -1)/bin/node")
NPM_BIN  := $(dir $(NODE_BIN))npm
NPX_BIN  := $(dir $(NODE_BIN))npx

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	@$(NPM_BIN) install

test: install ## Run tests
	@$(NPX_BIN) vitest run

lint: install ## Type-check with TypeScript
	@$(NPX_BIN) tsc --noEmit

build: install ## Compile TypeScript to dist/
	@$(NPX_BIN) tsc

run: install ## Run letsyolo (pass ARGS="enable claude" etc.)
	@$(NPX_BIN) tsx src/index.ts $(ARGS)

link: build ## Install globally via npm link
	@$(NPM_BIN) link

uninstall: ## Remove global link
	@$(NPM_BIN) unlink -g letsyolo 2>/dev/null || true

clean: ## Remove build artifacts and node_modules
	@rm -rf dist node_modules
