# letsyolo

CLI utility to detect AI coding-agent CLIs and configure their persistent "YOLO"/autonomous settings.

Supported agents:
- Claude Code
- Codex
- GitHub Copilot
- Sourcegraph Amplifier

Requirements:
- Node.js 20+

## Why this exists

Different agent CLIs use different flags and config files for autonomous mode. `letsyolo` provides one consistent interface for:
- detecting installed agent CLIs
- enabling/disabling persistent bypass settings where supported
- setting up required API keys in one secure secrets file
- exposing a machine-readable mode (`--json`) for automation

## Install

### Local development

```bash
git clone https://github.com/michaeljabbour/letsyolo.git
cd letsyolo
npm ci
npm run build
```

### Global CLI install

```bash
npm install -g letsyolo
```

Or from source:

```bash
make link
```

## Usage

### Human-readable output

```bash
letsyolo status
letsyolo enable
letsyolo enable codex
letsyolo disable claude
letsyolo keys
letsyolo flags
```

### Machine-readable output

```bash
letsyolo status --json
letsyolo detect --json
letsyolo enable codex --json
```

### API key setup

```bash
letsyolo setup
```

This writes keys to:

```text
~/.letsyolo/secrets.env
```

and attempts to source that file from common shell profiles (`.zshrc`, `.bashrc`, `.bash_profile`).

During setup/status, letsyolo also scans common dotfiles (`~/.env`, `~/.zshrc`, etc.) to detect existing keys before prompting.

## Commands

| Command | Description |
|---|---|
| `letsyolo` / `letsyolo status` | Detect agents + show YOLO + key status |
| `letsyolo detect` | Show detected agents |
| `letsyolo enable [agent]` | Enable YOLO mode for one/all agents |
| `letsyolo disable [agent]` | Disable YOLO mode for one/all agents |
| `letsyolo setup` | Interactive API key setup |
| `letsyolo keys` | Show API key status |
| `letsyolo flags` | Show recommended per-session CLI flags |
| `letsyolo --version` | Print CLI version |
| `letsyolo --help` | Print help |

Global options:
- `--json`: output JSON
- `--no-color`: disable ANSI colors

## Agent aliases

| Input | Agent |
|---|---|
| `claude`, `claude-code`, `claudecode` | Claude Code |
| `codex` | Codex |
| `copilot`, `github-copilot` | GitHub Copilot |
| `amp`, `amplifier` | Sourcegraph Amplifier |

## Configuration details

### Persistent config (`enable`/`disable`)

| Agent | Config file | Setting |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | `permissions.defaultMode = "bypassPermissions"` |
| Codex | `~/.codex/config.toml` | `approval_policy = "never"`, `sandbox_mode = "danger-full-access"` |
| Copilot | `~/.copilot/config.json` | no persistent global YOLO toggle (session flag only) |
| Amplifier | N/A | no persistent global YOLO toggle (session flag only) |

### API keys (`setup`)

| Env var | Agent |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Code |
| `OPENAI_API_KEY` | Codex |
| `GITHUB_TOKEN` | GitHub Copilot |
| `AMPLIFIER_CONFIGURED` | Amplifier status probe (keys are self-managed in `~/.amplifier/keys.env`) |

## Development

```bash
npm ci
npm run lint
npm run test
npm run build
npm run check
```

`make` wrappers:

```bash
make help
make setup
make enable AGENT=codex
make status
make check
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR with:
- Node 20 and 22
- lint (`tsc --noEmit`)
- tests (`vitest run`)
- build (`tsc`)
- package validation (`npm pack --dry-run`)

## Security notes

Autonomous/bypass modes are unsafe in untrusted environments.

Use only in isolated worktrees, containers, or VMs when possible.

`~/.letsyolo/secrets.env` is written with `0600` permissions.

## License

MIT (`LICENSE`)
