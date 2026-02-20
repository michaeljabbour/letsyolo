import os from 'node:os';
import path from 'node:path';
import type { AgentDefinition, AgentType } from './types.js';

const home = os.homedir();

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    type: 'claude-code',
    displayName: 'Claude Code',
    binaries: ['claude'],
    npmPackage: '@anthropic-ai/claude-code',
    versionFlag: '--version',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    yoloFlag: '--dangerously-skip-permissions',
    configPath: path.join(home, '.claude', 'settings.json'),
    configFormat: 'json',
  },
  {
    type: 'codex',
    displayName: 'Codex',
    binaries: ['codex'],
    npmPackage: '@openai/codex',
    versionFlag: '--version',
    installCommand: 'npm install -g @openai/codex',
    yoloFlag: '--yolo',
    configPath: path.join(home, '.codex', 'config.toml'),
    configFormat: 'toml',
  },
  {
    type: 'copilot',
    displayName: 'GitHub Copilot',
    binaries: ['copilot'],
    npmPackage: '@anthropic-ai/claude-code',
    versionFlag: '--version',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    yoloFlag: '--yolo',
    configPath: path.join(home, '.copilot', 'config.json'),
    configFormat: 'json',
  },
  {
    type: 'amplifier',
    displayName: 'Amplifier',
    binaries: ['amplifier', 'amp'],
    npmPackage: 'amplifier',
    versionFlag: '--version',
    installCommand: 'npm install -g amplifier',
    yoloFlag: '--dangerously-allow-all',
    configPath: path.join(home, '.config', 'amp', 'settings.json'),
    configFormat: 'json',
  },
];

export function getDefinition(type: AgentType): AgentDefinition | undefined {
  return AGENT_DEFINITIONS.find((d) => d.type === type);
}

export function getDefinitionOrThrow(type: AgentType): AgentDefinition {
  const def = getDefinition(type);
  if (!def) throw new Error(`Unknown agent type: ${type}`);
  return def;
}

export function parseAgentType(input: string): AgentType | undefined {
  const normalized = input.toLowerCase().trim();
  const aliases: Record<string, AgentType> = {
    'claude': 'claude-code',
    'claude-code': 'claude-code',
    'claudecode': 'claude-code',
    'codex': 'codex',
    'copilot': 'copilot',
    'github-copilot': 'copilot',
    'amp': 'amplifier',
    'amplifier': 'amplifier',
  };
  return aliases[normalized];
}
