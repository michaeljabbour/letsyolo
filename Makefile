.PHONY: install test lint build clean help setup enable disable status detect keys flags link uninstall

# Find node/npm — handle nvm lazy-loading which breaks in non-interactive shells
NODE_BIN := $(shell command -v node 2>/dev/null || echo "$(HOME)/.nvm/versions/node/$(shell ls $(HOME)/.nvm/versions/node 2>/dev/null | grep '^v' | sort -V | tail -1)/bin/node")
NPM_BIN  := $(dir $(NODE_BIN))npm
NPX_BIN  := $(dir $(NODE_BIN))npx
RUN      = @$(NPX_BIN) tsx src/index.ts

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

# --- User commands ---

setup: install ## Set up API keys (interactive)
	$(RUN) setup

enable: install ## Enable YOLO mode (all agents, or AGENT=claude)
	$(RUN) enable $(AGENT)

disable: install ## Disable YOLO mode (all agents, or AGENT=claude)
	$(RUN) disable $(AGENT)

status: install ## Show full status (agents + yolo + API keys)
	$(RUN) status

detect: install ## Detect installed agents
	$(RUN) detect

keys: install ## Show API key status
	$(RUN) keys

flags: install ## Show CLI flags cheat sheet
	$(RUN) flags

# --- Maintenance ---

link: build ## Install globally via npm link
	@$(NPM_BIN) link

uninstall: ## Remove global link
	@$(NPM_BIN) unlink -g letsyolo 2>/dev/null || true

clean: ## Remove build artifacts and node_modules
	@rm -rf dist node_modules
