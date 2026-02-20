# AI Coding Agent "YOLO Mode" Configuration Guide

> How to enable full autonomous / auto-approve / bypass-permissions mode for major AI coding agent CLIs. Covers both per-session (flags) and persistent (config) approaches.
>
> Last validated with online docs: 2026-02-20

---

## Table of Contents

1. [Claude Code (`claude`)](#1-claude-code-claude-cli)
2. [OpenAI Codex (`codex`)](#2-openai-codex-cli-codex)
3. [GitHub Copilot (`copilot`)](#3-github-copilot-cli-copilot)
4. [Amp / Amplifier (`amp`)](#4-amp--amplifier-amp)
5. [Claude Desktop (MCP)](#5-claude-desktop-mcp-tool-auto-approve)
6. [Quick Reference Table](#6-quick-reference-table)

---

## 1. Claude Code (`claude` CLI)

### CLI Flags (per-session)

```bash
# Full bypass: no permission prompts
claude --dangerously-skip-permissions

# Equivalent via explicit mode
claude --permission-mode bypassPermissions

# Makes dangerous bypass available as an option, not default
claude --allow-dangerously-skip-permissions

# Safer allowlist approach
claude --allowedTools "Bash(git:*)" "Bash(npm:*)" "Edit" "Read" "Write"

# Deny specific patterns
claude --disallowedTools "Bash(rm -rf /:*)" "Bash(sudo:*)"

# Non-interactive usage
claude --dangerously-skip-permissions --print -p "fix all lint errors"
```

### Permission Mode Values

| Mode | Behavior |
|------|----------|
| `default` | Normal permission prompts |
| `acceptEdits` | Auto-accept edits; still prompt for command/tool risk |
| `bypassPermissions` | Skip permission prompts |
| `dontAsk` | Do not prompt; reject privileged actions instead |
| `plan` | Planning mode only (no tool execution) |

### Persistent Config: `~/.claude/settings.json` (User Global)

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

- `defaultMode: "bypassPermissions"` sets bypass mode as the default for that user.

### Project Config: `.claude/settings.json` (Checked In)

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test:*)",
      "Bash(git status)",
      "Bash(git diff)"
    ]
  }
}
```

### Project-Local Config: `.claude/settings.local.json` (Not Checked In)

```json
{
  "permissions": {
    "allow": [
      "Edit",
      "Read",
      "Write",
      "Glob",
      "Grep",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(python3:*)"
    ],
    "deny": [
      "Bash(rm -rf /:*)",
      "Bash(sudo:*)"
    ],
    "ask": []
  }
}
```

### Permission Syntax Notes

```text
"Edit"                  Allow edit tool
"Read"                  Allow read tool
"Write"                 Allow write tool
"Bash"                  Allow all shell commands
"Bash(git:*)"           Prefix match (legacy style, still supported)
"Bash(git *)"           Preferred wildcard style in newer docs
"mcp__server__tool"     Specific MCP tool
```

### Settings Precedence (Highest to Lowest)

1. Enterprise policy settings
2. CLI arguments
3. Local project settings (`.claude/settings.local.json`)
4. Shared project settings (`.claude/settings.json`)
5. User settings (`~/.claude/settings.json`)

Useful overrides:

- `--settings /path/to/custom.json`
- `--settings '{"permissions":{"defaultMode":"bypassPermissions"}}'`
- `--setting-sources "user,project,local"`

### Sources

- [Claude Code Settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Claude Code IAM and Policy Controls](https://docs.anthropic.com/en/docs/claude-code/iam)
- `claude --help`

---

## 2. OpenAI Codex CLI (`codex`)

### CLI Flags (per-session)

```bash
# Maximum autonomy (no approvals + no sandbox)
codex --dangerously-bypass-approvals-and-sandbox
# Alias:
codex --yolo

# Low-friction sandboxed automation
# Equivalent to: --ask-for-approval on-request --sandbox workspace-write
codex --full-auto

# Explicit full autonomy without sandbox
codex --sandbox danger-full-access --ask-for-approval never

# Full-auto plus additional writable roots
codex --full-auto --add-dir /tmp/builds
```

### Approval Policy Values

| Policy | Behavior |
|--------|----------|
| `untrusted` | Auto-run trusted commands; ask for untrusted commands |
| `on-failure` | Deprecated; runs then escalates on failure |
| `on-request` | Model decides when to ask |
| `never` | Never ask; return failures directly |

### Sandbox Mode Values

| Mode | Behavior |
|------|----------|
| `read-only` | Read-only filesystem |
| `workspace-write` | Write in workspace (plus allowed extras) |
| `danger-full-access` | No sandbox limits |

### Persistent Config: `~/.codex/config.toml`

```toml
# Full autonomous mode
approval_policy = "never"
sandbox_mode = "danger-full-access"

# Safer full-auto equivalent
# approval_policy = "on-request"
# sandbox_mode = "workspace-write"
```

### Advanced Sandbox Config

```toml
[sandbox_workspace_write]
network_access = true
writable_roots = ["/tmp"]
exclude_slash_tmp = false
```

### Project-Level: `.codex/config.toml`

Same keys, scoped to the project (loaded for trusted projects).

### Admin-Enforced Limits: `~/.codex/requirements.toml`

```toml
allowed_approval_policies = ["on-request", "never"]
allowed_sandbox_modes = ["workspace-write", "danger-full-access"]
```

### Sources

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Codex Config](https://developers.openai.com/codex/config/)
- [Codex Security](https://developers.openai.com/codex/security/)
- [Codex Sandboxing](https://developers.openai.com/codex/sandboxing/)
- `codex --help`

---

## 3. GitHub Copilot CLI (`copilot`)

### CLI Flags (per-session)

```bash
# Full permission bypass (tools + paths + URLs)
copilot --yolo
# Alias:
copilot --allow-all

# Autopilot continuation mode (persistence behavior, not permission bypass)
copilot --autopilot

# Fully unattended style for many workflows
copilot --autopilot --yolo --no-ask-user

# Granular controls
copilot --allow-all-tools
copilot --allow-all-paths
copilot --allow-all-urls
copilot --allow-url example.com
copilot --deny-url malicious-site.com

# Non-interactive single shot
copilot -p "refactor the auth module"
copilot --agent my-agent -p "do the thing"
```

### `--autopilot` vs `--yolo`

| Flag | What it does |
|------|--------------|
| `--autopilot` | Enables continuation behavior in prompt mode |
| `--yolo` / `--allow-all` | Enables all permissions (`--allow-all-tools --allow-all-paths --allow-all-urls`) |

### Other Useful Flags

```bash
--disable-parallel-tools-execution
--enable-all-github-mcp-tools
--available-tools <list>
--excluded-tools <list>
--config-dir <path>     # default ~/.copilot
--continue
--resume [session-id]
```

### Config File: `~/.copilot/config.json`

```json
{
  "trusted_folders": [
    "/Users/username/dev"
  ]
}
```

Notes:

- `--yolo` / `--allow-all` are session flags, not a persistent config toggle.
- `trusted_folders` and other preferences persist in Copilot config.

### Installation

```bash
npm install -g @github/copilot
# or: brew install github/copilot/copilot
# or via gh: gh copilot
```

Requires an active GitHub Copilot subscription. Auth is prompted on first launch.

### Sources

- [Installing Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)
- [Using Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- [About Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli)
- [gh copilot integration](https://cli.github.com/manual/gh_copilot)
- `copilot --help`

---

## 4. Amp / Amplifier (`amp`)

### CLI Flags (per-session)

```bash
# Sourcegraph Amp CLI examples
amp --dangerously-allow-all -x "your prompt here"
amp -x "what files are markdown?"
amp --dangerously-allow-all --stream-json -x "task description"
amp --mcp-config /path/to/mcp.json -x "use the tools"
```

### Permission System

Amp uses a 4-level permission model per tool:

| Level | Behavior |
|-------|----------|
| **Allow** | Runs without prompting |
| **Ask** | Prompts for confirmation |
| **Reject** | Blocks execution |
| **Delegate** | Defers decision to external policy program |

`--dangerously-allow-all` bypasses permission checks.

### Config Files

User config:

- macOS/Linux: `~/.config/amp/settings.json`
- Windows: `%USERPROFILE%\.config\amp\settings.json`

Workspace config:

- `.amp/settings.json`

Managed settings (enterprise):

- macOS: `/Library/Application Support/ampcode/managed-settings.json`
- Linux: `/etc/ampcode/managed-settings.json`
- Windows: `C:\ProgramData\ampcode\managed-settings.json`

> Note: there are multiple tools named "amp"/"amplifier" in the ecosystem. Confirm you are using Sourcegraph Amp before applying these flags.

### Sources

- [Amp Manual](https://ampcode.com/manual)
- [Amp by Sourcegraph](https://sourcegraph.com/amp)

---

## 5. Claude Desktop (MCP Tool Auto-Approve)

### Config File Location

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Limitation

Claude Desktop does not document a global "always auto-approve MCP tools" config switch. Current documented UX is approval-focused (human-in-the-loop), with per-tool allow options in chat.

### Recommendation

If you need unattended MCP execution, prefer Claude Code CLI (`claude --dangerously-skip-permissions`) in a sandboxed environment.

### Sources

- [MCP Quickstart (Claude Desktop)](https://modelcontextprotocol.io/quickstart/user)
- [Claude Support: Using MCP with Claude Desktop](https://support.claude.com/en/articles/10167454-using-the-model-context-protocol-mcp-with-claude-desktop)

---

## 6. Quick Reference Table

| Agent | CLI YOLO Flag | Persistent Config File | Persistent YOLO Setting |
|-------|---------------|------------------------|--------------------------|
| **Claude Code** | `--dangerously-skip-permissions` | `~/.claude/settings.json` | `permissions.defaultMode = "bypassPermissions"` |
| **Codex** | `--yolo` or `--sandbox danger-full-access --ask-for-approval never` | `~/.codex/config.toml` | `approval_policy = "never"` + `sandbox_mode = "danger-full-access"` |
| **Copilot** | `--yolo` / `--allow-all` | `~/.copilot/config.json` | No persistent global YOLO toggle |
| **Amp** | `--dangerously-allow-all` (Sourcegraph Amp) | `~/.config/amp/settings.json` | Permission rules in settings / managed policy |
| **Claude Desktop** | N/A | `claude_desktop_config.json` | No documented global auto-approve toggle |

### Recommended Startup Commands

```bash
claude --dangerously-skip-permissions
codex --sandbox danger-full-access --ask-for-approval never
copilot --yolo
amp --dangerously-allow-all
```

---

## Security Notes

All bypass modes are for trusted/sandboxed environments.

- Use isolated worktrees, containers, or VMs.
- Prefer allowlists (`allowedTools`, `--allow-tool`) over blanket bypass.
- Restrict network when not needed.
- Keep backups and commit often.
