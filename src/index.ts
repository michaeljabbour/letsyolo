#!/usr/bin/env node

import { detectAll } from './detect.js';
import { enableAll, enableYolo, disableAll, disableYolo, checkYoloStatus } from './configure.js';
import { parseAgentType, AGENT_DEFINITIONS } from './agents.js';
import {
  interactiveSetup,
  checkApiKeyStatus,
  addSourceLine,
  getShellProfiles,
  getSourceLine,
  isSourcedIn,
  SECRETS_FILE,
} from './secrets.js';
import type { AgentStatus, YoloResult } from './types.js';

// --- Formatting ---

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function statusIcon(ok: boolean): string {
  return ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
}

function printDetection(agents: AgentStatus[]): void {
  console.log(`\n${BOLD}Detected Agents${RESET}\n`);
  console.log(`  ${'Agent'.padEnd(20)} ${'Status'.padEnd(12)} ${'Version'.padEnd(16)} Path`);
  console.log(`  ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(16)} ${'─'.repeat(30)}`);

  for (const agent of agents) {
    const status = agent.installed
      ? `${GREEN}installed${RESET}`
      : `${RED}missing${RESET}`;
    const version = agent.version ?? '—';
    const agentPath = agent.path ?? '—';
    console.log(`  ${statusIcon(agent.installed)} ${agent.displayName.padEnd(18)} ${status.padEnd(21)} ${version.padEnd(16)} ${DIM}${agentPath}${RESET}`);
  }
  console.log();
}

function printYoloResults(results: YoloResult[], action: string): void {
  console.log(`\n${BOLD}YOLO Mode — ${action}${RESET}\n`);

  for (const r of results) {
    if (!r.success) {
      console.log(`  ${RED}✗${RESET} ${r.displayName}: ${RED}${r.error}${RESET}`);
      continue;
    }
    if (!r.config) continue;

    const icon = r.config.enabled ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${icon} ${BOLD}${r.displayName}${RESET}`);
    console.log(`    ${DIM}Config:${RESET}  ${r.config.configPath}`);
    console.log(`    ${DIM}CLI:${RESET}     ${CYAN}${r.config.cliFlag}${RESET}`);
    console.log(`    ${DIM}Status:${RESET}  ${r.config.details}`);
    console.log();
  }
}

function printReadyToRun(results: YoloResult[]): void {
  const enabled = results.filter((r) => r.success && r.config?.enabled);
  if (enabled.length === 0) return;

  console.log(`${BOLD}Ready to go! Run any of these:${RESET}\n`);

  const commands: Record<string, string> = {
    'claude-code': 'claude --dangerously-skip-permissions',
    'codex': 'codex --yolo',
    'copilot': 'copilot --yolo',
    'amplifier': 'amp --dangerously-allow-all',
  };

  for (const r of enabled) {
    const cmd = commands[r.type];
    if (cmd) {
      console.log(`  ${CYAN}${cmd}${RESET}`);
    }
  }
  console.log();
}

async function printApiKeyStatus(): Promise<void> {
  const keys = await checkApiKeyStatus();

  console.log(`\n${BOLD}API Keys${RESET}\n`);
  for (const k of keys) {
    const icon = k.set ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const sourceLabel = k.source === 'env' ? `${DIM}(in env)${RESET}`
      : k.source === 'file' ? `${DIM}(in secrets file)${RESET}`
      : `${DIM}(not set)${RESET}`;
    console.log(`  ${icon} ${k.envVar.padEnd(24)} ${k.agent.padEnd(18)} ${sourceLabel}`);
  }
  console.log(`\n  ${DIM}Secrets file: ${SECRETS_FILE}${RESET}`);
  console.log();
}

async function runSetup(): Promise<void> {
  console.log(`\n${BOLD}API Key Setup${RESET}\n`);
  console.log(`  Enter your API keys below. Press Enter to skip any key.\n`);

  const { saved, skipped } = await interactiveSetup();

  if (saved.length > 0) {
    console.log(`\n  ${GREEN}✓${RESET} Saved ${saved.length} key(s) to ${DIM}${SECRETS_FILE}${RESET}`);
    console.log(`  ${DIM}(file permissions: 600 — owner read/write only)${RESET}`);

    // Try to add source line to shell profiles
    const profiles = getShellProfiles();
    const hooked: string[] = [];

    for (const profile of profiles) {
      const added = await addSourceLine(profile);
      if (added) {
        hooked.push(profile);
      } else {
        const alreadyThere = await isSourcedIn(profile);
        if (alreadyThere) {
          hooked.push(profile);
        }
      }
    }

    if (hooked.length > 0) {
      console.log(`\n  ${GREEN}✓${RESET} Shell profile(s) configured:`);
      for (const p of hooked) {
        console.log(`    ${DIM}${p}${RESET}`);
      }
    }

    // Tell them exactly what to do next
    console.log(`\n${BOLD}Activate now — run this in your terminal:${RESET}\n`);
    console.log(`  ${CYAN}source ${SECRETS_FILE}${RESET}\n`);

    console.log(`${DIM}Or open a new terminal tab — it will load automatically.${RESET}`);
  }

  if (skipped.length > 0) {
    console.log(`\n  ${DIM}Skipped: ${skipped.join(', ')}${RESET}`);
  }

  console.log();
}

function printHelp(): void {
  console.log(`
${BOLD}letsyolo${RESET} — Configure YOLO mode for AI coding agents

${BOLD}Usage:${RESET}
  letsyolo                     Detect agents & show current YOLO status
  letsyolo enable              Enable YOLO mode for all detected agents
  letsyolo enable <agent>      Enable YOLO mode for a specific agent
  letsyolo disable             Disable YOLO mode for all agents
  letsyolo disable <agent>     Disable YOLO mode for a specific agent
  letsyolo detect              Detect installed agents
  letsyolo status              Show current YOLO configuration status
  letsyolo setup               Interactive API key setup
  letsyolo keys                Show API key status
  letsyolo flags               Show recommended CLI flags for each agent

${BOLD}Agents:${RESET}
  claude, claude-code          Claude Code CLI
  codex                        OpenAI Codex CLI
  copilot, github-copilot      GitHub Copilot CLI
  amp, amplifier               Sourcegraph Amplifier

${BOLD}Examples:${RESET}
  letsyolo setup               ${DIM}# Set up API keys (interactive)${RESET}
  letsyolo enable              ${DIM}# Enable yolo for everything${RESET}
  letsyolo enable claude       ${DIM}# Just Claude Code${RESET}
  letsyolo disable codex       ${DIM}# Disable yolo for Codex${RESET}
  letsyolo flags               ${DIM}# Show CLI flags cheat sheet${RESET}
`);
}

function printFlags(): void {
  console.log(`
${BOLD}Recommended CLI Flags (per-session)${RESET}

  ${CYAN}claude --dangerously-skip-permissions${RESET}
  ${CYAN}codex --yolo${RESET}
  ${CYAN}copilot --yolo${RESET}
  ${CYAN}amp --dangerously-allow-all${RESET}

${BOLD}Full Autonomous Launch Commands${RESET}

  ${CYAN}claude --dangerously-skip-permissions -p "your prompt"${RESET}
  ${CYAN}codex --sandbox danger-full-access --ask-for-approval never${RESET}
  ${CYAN}copilot --autopilot --yolo --no-ask-user${RESET}
  ${CYAN}amp --dangerously-allow-all -x "your prompt"${RESET}

${YELLOW}⚠  All bypass modes are for trusted/sandboxed environments only.${RESET}
`);
}

// --- Main ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const target = args[1];

  switch (command) {
    case undefined:
    case 'status': {
      const detection = await detectAll();
      printDetection(detection.agents);
      const status = await checkYoloStatus();
      printYoloResults(status, 'Current Status');
      await printApiKeyStatus();
      break;
    }

    case 'detect': {
      const detection = await detectAll();
      printDetection(detection.agents);
      break;
    }

    case 'enable': {
      if (target) {
        const agentType = parseAgentType(target);
        if (!agentType) {
          console.error(`${RED}Unknown agent: ${target}${RESET}. Run ${CYAN}letsyolo --help${RESET} for options.`);
          process.exit(1);
        }
        const result = await enableYolo(agentType);
        printYoloResults([result], 'Enable');
        printReadyToRun([result]);
      } else {
        const results = await enableAll();
        printYoloResults(results, 'Enable All');
        printReadyToRun(results);
      }
      break;
    }

    case 'disable': {
      if (target) {
        const agentType = parseAgentType(target);
        if (!agentType) {
          console.error(`${RED}Unknown agent: ${target}${RESET}. Run ${CYAN}letsyolo --help${RESET} for options.`);
          process.exit(1);
        }
        const result = await disableYolo(agentType);
        printYoloResults([result], 'Disable');
      } else {
        const results = await disableAll();
        printYoloResults(results, 'Disable All');
      }
      break;
    }

    case 'setup': {
      await runSetup();
      break;
    }

    case 'keys': {
      await printApiKeyStatus();
      break;
    }

    case 'flags': {
      printFlags();
      break;
    }

    case '--help':
    case '-h':
    case 'help': {
      printHelp();
      break;
    }

    default: {
      console.error(`${RED}Unknown command: ${command}${RESET}`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
