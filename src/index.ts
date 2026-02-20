#!/usr/bin/env node

import { createRequire } from 'node:module';
import { AGENT_DEFINITIONS, parseAgentType } from './agents.js';
import {
  checkYoloStatus,
  disableAll,
  disableYolo,
  enableAll,
  enableYolo,
} from './configure.js';
import { detectAll } from './detect.js';
import {
  SECRETS_FILE,
  addSourceLine,
  checkApiKeyStatus,
  getShellProfiles,
  interactiveSetup,
  isSourcedIn,
} from './secrets.js';
import type { AgentStatus, YoloResult } from './types.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string };
const VERSION = packageJson.version ?? '0.0.0';

const ANSI = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
} as const;

let colorEnabled = true;

interface CliOptions {
  json: boolean;
  noColor: boolean;
  help: boolean;
  version: boolean;
  positionals: string[];
}

interface SetupResult {
  saved: string[];
  skipped: string[];
  shellProfilesConfigured: string[];
}

function style(code: string, value: string): string {
  if (!colorEnabled) return value;
  return `${code}${value}${ANSI.reset}`;
}

function bold(value: string): string {
  return style(ANSI.bold, value);
}

function dim(value: string): string {
  return style(ANSI.dim, value);
}

function green(value: string): string {
  return style(ANSI.green, value);
}

function red(value: string): string {
  return style(ANSI.red, value);
}

function yellow(value: string): string {
  return style(ANSI.yellow, value);
}

function cyan(value: string): string {
  return style(ANSI.cyan, value);
}

function statusIcon(ok: boolean): string {
  return ok ? green('✓') : red('✗');
}

function parseCliOptions(rawArgs: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    noColor: false,
    help: false,
    version: false,
    positionals: [],
  };

  for (const arg of rawArgs) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--no-color') {
      options.noColor = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      options.version = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.positionals.push(arg);
  }

  return options;
}

function configureColors(options: CliOptions): void {
  const noColorEnv = Object.prototype.hasOwnProperty.call(process.env, 'NO_COLOR');
  const forceColor = (process.env.FORCE_COLOR ?? '') !== '' && process.env.FORCE_COLOR !== '0';

  colorEnabled =
    !options.json &&
    !options.noColor &&
    !noColorEnv &&
    (forceColor || Boolean(process.stdout.isTTY));
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printDetection(agents: AgentStatus[]): void {
  console.log(`\n${bold('Detected Agents')}\n`);
  console.log(`  ${'Agent'.padEnd(20)} ${'Status'.padEnd(12)} ${'Version'.padEnd(16)} Path`);
  console.log(`  ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(16)} ${'─'.repeat(30)}`);

  for (const agent of agents) {
    const status = agent.installed ? green('installed') : red('missing');
    const version = agent.version ?? '—';
    const agentPath = agent.path ?? '—';
    console.log(
      `  ${statusIcon(agent.installed)} ${agent.displayName.padEnd(18)} ${status.padEnd(21)} ${version.padEnd(16)} ${dim(agentPath)}`,
    );
  }
  console.log();
}

function printYoloResults(results: YoloResult[], action: string): void {
  console.log(`\n${bold(`YOLO Mode — ${action}`)}\n`);

  for (const r of results) {
    if (!r.success) {
      console.log(`  ${red('✗')} ${r.displayName}: ${red(r.error ?? 'Unknown error')}`);
      continue;
    }

    if (!r.config) continue;

    const icon = r.config.enabled ? green('●') : r.config.sessionOnly ? yellow('◐') : dim('○');
    console.log(`  ${icon} ${bold(r.displayName)}`);
    if (r.config.configPath) {
      console.log(`    ${dim('Config:')}  ${r.config.configPath}`);
    } else {
      console.log(`    ${dim('Config:')}  n/a (session-only)`);
    }
    console.log(`    ${dim('CLI:')}     ${cyan(r.config.cliFlag)}`);
    console.log(`    ${dim('Status:')}  ${r.config.details}`);
    console.log();
  }
}

function getReadyCommands(results: YoloResult[]): string[] {
  const commands: Record<string, string> = {
    'claude-code': 'claude --dangerously-skip-permissions',
    codex: 'codex --yolo',
    copilot: 'copilot --yolo',
    amplifier: 'amp --dangerously-allow-all',
  };

  return results
    .filter((result) => result.success && result.config && (result.config.enabled || result.config.sessionOnly))
    .map((result) => commands[result.type])
    .filter((command): command is string => Boolean(command));
}

function printReadyToRun(results: YoloResult[]): void {
  const commands = getReadyCommands(results);
  if (commands.length === 0) return;

  console.log(`${bold('Ready to go! Run any of these:')}\n`);

  for (const command of commands) {
    console.log(`  ${cyan(command)}`);
  }

  console.log();
}

async function printApiKeyStatus(): Promise<void> {
  const keys = await checkApiKeyStatus();

  console.log(`\n${bold('API Keys')}\n`);
  for (const k of keys) {
    const icon = k.set ? green('✓') : red('✗');
    const sourceLabel = k.set ? dim(`(${k.source})`) : dim('(not set)');

    console.log(`  ${icon} ${k.envVar.padEnd(24)} ${k.agent.padEnd(18)} ${sourceLabel}`);
  }

  console.log(`\n  ${dim(`Secrets file: ${SECRETS_FILE}`)}`);
  console.log();
}

async function runSetup(jsonMode: boolean): Promise<SetupResult> {
  if (!jsonMode) {
    console.log(`\n${bold('API Key Setup')}\n`);
    console.log('  Enter your API keys below. Press Enter to skip any key.\n');
  }

  const { saved, skipped } = await interactiveSetup();
  const profiles = getShellProfiles();
  const hooked: string[] = [];

  for (const profile of profiles) {
    try {
      const added = await addSourceLine(profile);
      if (added || (await isSourcedIn(profile))) {
        hooked.push(profile);
      }
    } catch {
      // Keep setup moving even if one shell profile is unreadable.
    }
  }

  if (!jsonMode) {
    if (saved.length > 0) {
      console.log(`\n  ${green('✓')} Saved ${saved.length} key(s) to ${dim(SECRETS_FILE)}`);
      console.log(`  ${dim('(file permissions: 600 — owner read/write only)')}`);

      if (hooked.length > 0) {
        console.log(`\n  ${green('✓')} Shell profile(s) configured:`);
        for (const profile of hooked) {
          console.log(`    ${dim(profile)}`);
        }
      }

      console.log(`\n${bold('Activate now — run this in your terminal:')}\n`);
      console.log(`  ${cyan(`source ${SECRETS_FILE}`)}\n`);
      console.log(dim('Or open a new terminal tab — it will load automatically.'));
    }

    if (skipped.length > 0) {
      console.log(`\n  ${dim(`Skipped: ${skipped.join(', ')}`)}`);
    }

    console.log();
  }

  return {
    saved,
    skipped,
    shellProfilesConfigured: hooked,
  };
}

function printHelp(): void {
  const agentNames = AGENT_DEFINITIONS.map((agent) => agent.type).join(', ');

  console.log(`
${bold('letsyolo')} — Configure YOLO mode for AI coding agents

${bold('Usage:')}
  letsyolo [command] [agent] [--json] [--no-color]

${bold('Commands:')}
  letsyolo                     Detect agents and show current YOLO status
  letsyolo enable              Enable YOLO mode for all detected agents
  letsyolo enable <agent>      Enable YOLO mode for a specific agent
  letsyolo disable             Disable YOLO mode for all agents
  letsyolo disable <agent>     Disable YOLO mode for a specific agent
  letsyolo detect              Detect installed agents
  letsyolo status              Show current YOLO configuration status
  letsyolo setup               Interactive API key setup
  letsyolo keys                Show API key status
  letsyolo flags               Show recommended CLI flags

${bold('Agents:')}
  claude, claude-code          Claude Code CLI
  codex                        OpenAI Codex CLI
  copilot, github-copilot      GitHub Copilot CLI
  amp, amplifier               Sourcegraph Amplifier

${bold('Global Options:')}
  --json                       Emit machine-readable JSON output
  --no-color                   Disable ANSI colors
  --help, -h                   Show help
  --version, -v                Show version

${bold('Known Agent Types:')} ${agentNames}
`);
}

function printFlags(): void {
  console.log(`
${bold('Recommended CLI Flags (per-session)')}

  ${cyan('claude --dangerously-skip-permissions')}
  ${cyan('codex --yolo')}
  ${cyan('copilot --yolo')}
  ${cyan('amp --dangerously-allow-all')}

${bold('Full Autonomous Launch Commands')}

  ${cyan('claude --dangerously-skip-permissions -p "your prompt"')}
  ${cyan('codex --sandbox danger-full-access --ask-for-approval never')}
  ${cyan('copilot --autopilot --yolo --no-ask-user')}
  ${cyan('amp --dangerously-allow-all -x "your prompt"')}

${yellow('⚠  All bypass modes are for trusted/sandboxed environments only.')}
`);
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  configureColors(options);

  if (options.version) {
    console.log(VERSION);
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const [rawCommand, target, extra] = options.positionals;
  if (extra) {
    throw new Error(`Unexpected argument: ${extra}`);
  }

  const command = rawCommand?.toLowerCase();

  switch (command) {
    case undefined:
    case 'status': {
      const detection = await detectAll();
      const status = await checkYoloStatus();
      const keys = await checkApiKeyStatus();

      if (options.json) {
        printJson({ detection, yolo: status, keys });
      } else {
        printDetection(detection.agents);
        printYoloResults(status, 'Current Status');
        await printApiKeyStatus();
      }
      break;
    }

    case 'detect': {
      const detection = await detectAll();
      if (options.json) {
        printJson(detection);
      } else {
        printDetection(detection.agents);
      }
      break;
    }

    case 'enable': {
      if (target) {
        const agentType = parseAgentType(target);
        if (!agentType) {
          throw new Error(`Unknown agent: ${target}`);
        }

        const result = await enableYolo(agentType);
        if (options.json) {
          printJson({ results: [result], readyCommands: getReadyCommands([result]) });
        } else {
          printYoloResults([result], 'Enable');
          printReadyToRun([result]);
        }
      } else {
        const results = await enableAll();
        if (options.json) {
          printJson({ results, readyCommands: getReadyCommands(results) });
        } else {
          printYoloResults(results, 'Enable All');
          printReadyToRun(results);
        }
      }
      break;
    }

    case 'disable': {
      if (target) {
        const agentType = parseAgentType(target);
        if (!agentType) {
          throw new Error(`Unknown agent: ${target}`);
        }

        const result = await disableYolo(agentType);
        if (options.json) {
          printJson({ results: [result] });
        } else {
          printYoloResults([result], 'Disable');
        }
      } else {
        const results = await disableAll();
        if (options.json) {
          printJson({ results });
        } else {
          printYoloResults(results, 'Disable All');
        }
      }
      break;
    }

    case 'setup': {
      const setupResult = await runSetup(options.json);
      if (options.json) {
        printJson(setupResult);
      }
      break;
    }

    case 'keys': {
      const keys = await checkApiKeyStatus();
      if (options.json) {
        printJson({ keys });
      } else {
        await printApiKeyStatus();
      }
      break;
    }

    case 'flags': {
      if (options.json) {
        printJson({
          flags: {
            claude: 'claude --dangerously-skip-permissions',
            codex: 'codex --yolo',
            copilot: 'copilot --yolo',
            amplifier: 'amp --dangerously-allow-all',
          },
          warning: 'All bypass modes are for trusted/sandboxed environments only.',
        });
      } else {
        printFlags();
      }
      break;
    }

    default: {
      throw new Error(`Unknown command: ${command}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const options = parseCliOptions(process.argv.slice(2));
    if (options.json) {
      printJson({ error: message });
    } else {
      console.error(`${red('Error:')} ${message}`);
      console.error(`Run ${cyan('letsyolo --help')} for usage.`);
    }
  } catch {
    console.error(`${red('Error:')} ${message}`);
  }
  process.exit(1);
});
