# letsyolo

Detect and configure YOLO / autonomous mode for AI coding agent CLIs.

Supports **Claude Code**, **Codex**, **GitHub Copilot**, and **Amplifier (Amp)**.

## Quick Start

```bash
git clone https://github.com/michaeljabbour/letsyolo.git
cd letsyolo
make install
make run
```

## Setup API Keys

```bash
make run ARGS="setup"
```

This will:
1. Prompt you for each API key (skip any with Enter)
2. Save them to `~/.letsyolo/secrets.env` (mode 600)
3. Add a source line to your `.zshrc` / `.bashrc`
4. Tell you exactly what to run next

After setup, activate immediately:

```bash
source ~/.letsyolo/secrets.env
```

Or just open a new terminal — it loads automatically.

## Enable YOLO Mode

```bash
make run ARGS="enable"          # enable for all agents
make run ARGS="enable claude"   # just Claude Code
make run ARGS="enable codex"    # just Codex
```

After enabling, you'll see the ready-to-run commands:

```
Ready to go! Run any of these:

  claude --dangerously-skip-permissions
  codex --yolo
  copilot --yolo
  amp --dangerously-allow-all
```

## All Commands

| Command | Description |
|---------|-------------|
| `letsyolo` | Detect agents, show yolo status + API key status |
| `letsyolo setup` | Interactive API key setup |
| `letsyolo keys` | Show which API keys are configured |
| `letsyolo enable [agent]` | Enable persistent yolo config |
| `letsyolo disable [agent]` | Disable persistent yolo config |
| `letsyolo detect` | Show installed agents |
| `letsyolo status` | Full status overview |
| `letsyolo flags` | CLI flags cheat sheet |

Pass commands via make:

```bash
make run ARGS="setup"
make run ARGS="enable"
make run ARGS="keys"
make run ARGS="flags"
```

## Install Globally

```bash
make link      # npm link — adds `letsyolo` to your PATH
letsyolo       # now works from anywhere
```

## Agent Aliases

| Input | Agent |
|-------|-------|
| `claude`, `claude-code` | Claude Code |
| `codex` | OpenAI Codex |
| `copilot`, `github-copilot` | GitHub Copilot |
| `amp`, `amplifier` | Sourcegraph Amplifier |

## What It Configures

### Persistent Config (via `enable`)

| Agent | Config File | Setting |
|-------|-------------|---------|
| Claude Code | `~/.claude/settings.json` | `permissions.defaultMode = "bypassPermissions"` |
| Codex | `~/.codex/config.toml` | `approval_policy = "never"`, `sandbox_mode = "danger-full-access"` |
| Copilot | — | No persistent toggle (use `copilot --yolo`) |
| Amplifier | `~/.config/amp/settings.json` | `permissions.defaultLevel = "allow"` |

### API Keys (via `setup`)

| Env Var | Agent | Where to get it |
|---------|-------|-----------------|
| `ANTHROPIC_API_KEY` | Claude Code | https://console.anthropic.com/settings/keys |
| `OPENAI_API_KEY` | Codex | https://platform.openai.com/api-keys |
| `GITHUB_TOKEN` | GitHub Copilot | https://github.com/settings/tokens |
| `SRC_ACCESS_TOKEN` | Amplifier | https://sourcegraph.com/user/settings/tokens |

Keys are stored in `~/.letsyolo/secrets.env` and auto-sourced by your shell.

### Per-Session CLI Flags

```bash
claude --dangerously-skip-permissions
codex --yolo
copilot --yolo
amp --dangerously-allow-all
```

## Tests

```bash
make test      # 55+ tests across 4 test files
make lint      # TypeScript type-check
```

## Requirements

- Node.js 18+
- make (preinstalled on macOS/Linux)

## Security

All bypass modes are for **trusted/sandboxed environments only**.

- Use isolated worktrees, containers, or VMs
- Prefer allowlists over blanket bypass where possible
- API keys are stored with `600` permissions (owner read/write only)
- The secrets file is gitignored by default

## License

MIT
