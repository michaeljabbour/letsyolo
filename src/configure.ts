import fs from 'node:fs/promises';
import path from 'node:path';
import { AGENT_DEFINITIONS, getDefinitionOrThrow } from './agents.js';
import { detectBinary } from './detect.js';
import type { AgentType, YoloResult } from './types.js';

/**
 * Minimal TOML writer — handles flat key = "value" pairs.
 * Good enough for codex config.toml which is flat.
 */
function toToml(obj: Record<string, string | boolean | number>): string {
  return Object.entries(obj)
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key} = "${value}"`;
      return `${key} = ${value}`;
    })
    .join('\n');
}

/**
 * Minimal TOML reader — handles flat key = "value" / key = value.
 */
function fromToml(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Read a JSON config file, returning {} if it doesn't exist.
 */
async function readJsonConfig(filePath: string): Promise<Record<string, unknown>> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Write a JSON config file, creating parent dirs as needed.
 */
async function writeJsonConfig(filePath: string, config: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Read a TOML config file, returning {} if it doesn't exist.
 */
async function readTomlConfig(filePath: string): Promise<Record<string, string>> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return fromToml(data);
  } catch {
    return {};
  }
}

/**
 * Write a TOML config file, creating parent dirs as needed.
 */
async function writeTomlConfig(filePath: string, config: Record<string, string>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, toToml(config) + '\n');
}

// --- Per-agent enable/disable logic ---

async function enableClaudeCode(configPath: string): Promise<string> {
  const config = await readJsonConfig(configPath);
  if (!config.permissions || typeof config.permissions !== 'object') {
    config.permissions = {};
  }
  (config.permissions as Record<string, unknown>).defaultMode = 'bypassPermissions';
  await writeJsonConfig(configPath, config);
  return 'Set permissions.defaultMode = "bypassPermissions"';
}

async function disableClaudeCode(configPath: string): Promise<string> {
  const config = await readJsonConfig(configPath);
  if (config.permissions && typeof config.permissions === 'object') {
    const perms = config.permissions as Record<string, unknown>;
    if (perms.defaultMode === 'bypassPermissions') {
      delete perms.defaultMode;
      if (Object.keys(perms).length === 0) {
        delete config.permissions;
      }
      await writeJsonConfig(configPath, config);
      return 'Removed permissions.defaultMode';
    }
  }
  return 'Already disabled (no bypassPermissions found)';
}

function isClaudeCodeEnabled(config: Record<string, unknown>): boolean {
  if (config.permissions && typeof config.permissions === 'object') {
    return (config.permissions as Record<string, unknown>).defaultMode === 'bypassPermissions';
  }
  return false;
}

async function enableCodex(configPath: string): Promise<string> {
  const config = await readTomlConfig(configPath);
  config.approval_policy = 'never';
  config.sandbox_mode = 'danger-full-access';
  await writeTomlConfig(configPath, config);
  return 'Set approval_policy = "never", sandbox_mode = "danger-full-access"';
}

async function disableCodex(configPath: string): Promise<string> {
  const config = await readTomlConfig(configPath);
  let changed = false;
  if (config.approval_policy === 'never') {
    delete config.approval_policy;
    changed = true;
  }
  if (config.sandbox_mode === 'danger-full-access') {
    delete config.sandbox_mode;
    changed = true;
  }
  if (changed) {
    await writeTomlConfig(configPath, config);
    return 'Removed approval_policy and sandbox_mode overrides';
  }
  return 'Already disabled (no yolo settings found)';
}

function isCodexEnabled(config: Record<string, string>): boolean {
  return config.approval_policy === 'never' && config.sandbox_mode === 'danger-full-access';
}

async function enableCopilot(configPath: string): Promise<string> {
  // Copilot has no persistent yolo toggle — only CLI flags
  // We can set trusted_folders as the closest thing
  const config = await readJsonConfig(configPath);
  if (!Array.isArray(config.trusted_folders)) {
    config.trusted_folders = [];
  }
  await writeJsonConfig(configPath, config);
  return 'No persistent yolo toggle exists for Copilot. Use `copilot --yolo` per-session. Config preserved.';
}

async function disableCopilot(_configPath: string): Promise<string> {
  return 'No persistent yolo toggle to disable. Stop using `copilot --yolo` flag.';
}

async function enableAmplifier(configPath: string): Promise<string> {
  // Amp settings can set default permission levels
  const config = await readJsonConfig(configPath);
  if (!config.permissions || typeof config.permissions !== 'object') {
    config.permissions = {};
  }
  (config.permissions as Record<string, unknown>).defaultLevel = 'allow';
  await writeJsonConfig(configPath, config);
  return 'Set permissions.defaultLevel = "allow"';
}

async function disableAmplifier(configPath: string): Promise<string> {
  const config = await readJsonConfig(configPath);
  if (config.permissions && typeof config.permissions === 'object') {
    const perms = config.permissions as Record<string, unknown>;
    if (perms.defaultLevel === 'allow') {
      delete perms.defaultLevel;
      if (Object.keys(perms).length === 0) {
        delete config.permissions;
      }
      await writeJsonConfig(configPath, config);
      return 'Removed permissions.defaultLevel';
    }
  }
  return 'Already disabled (no allow-all settings found)';
}

function isAmplifierEnabled(config: Record<string, unknown>): boolean {
  if (config.permissions && typeof config.permissions === 'object') {
    return (config.permissions as Record<string, unknown>).defaultLevel === 'allow';
  }
  return false;
}

/**
 * Enable yolo mode for a specific agent.
 */
export async function enableYolo(agentType: AgentType): Promise<YoloResult> {
  const def = getDefinitionOrThrow(agentType);
  const detection = await detectBinary(def.binaries, def.versionFlag);

  if (!detection.found) {
    return {
      type: agentType,
      displayName: def.displayName,
      success: false,
      error: `Not installed. Install with: ${def.installCommand}`,
    };
  }

  try {
    let details: string;
    switch (agentType) {
      case 'claude-code':
        details = await enableClaudeCode(def.configPath);
        break;
      case 'codex':
        details = await enableCodex(def.configPath);
        break;
      case 'copilot':
        details = await enableCopilot(def.configPath);
        break;
      case 'amplifier':
        details = await enableAmplifier(def.configPath);
        break;
    }

    return {
      type: agentType,
      displayName: def.displayName,
      success: true,
      config: {
        enabled: true,
        configPath: def.configPath,
        cliFlag: def.yoloFlag,
        details,
      },
    };
  } catch (error) {
    return {
      type: agentType,
      displayName: def.displayName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Disable yolo mode for a specific agent.
 */
export async function disableYolo(agentType: AgentType): Promise<YoloResult> {
  const def = getDefinitionOrThrow(agentType);

  try {
    let details: string;
    switch (agentType) {
      case 'claude-code':
        details = await disableClaudeCode(def.configPath);
        break;
      case 'codex':
        details = await disableCodex(def.configPath);
        break;
      case 'copilot':
        details = await disableCopilot(def.configPath);
        break;
      case 'amplifier':
        details = await disableAmplifier(def.configPath);
        break;
    }

    return {
      type: agentType,
      displayName: def.displayName,
      success: true,
      config: {
        enabled: false,
        configPath: def.configPath,
        cliFlag: def.yoloFlag,
        details,
      },
    };
  } catch (error) {
    return {
      type: agentType,
      displayName: def.displayName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Enable yolo mode for all detected agents.
 */
export async function enableAll(): Promise<YoloResult[]> {
  const types: AgentType[] = ['claude-code', 'codex', 'copilot', 'amplifier'];
  return Promise.all(types.map(enableYolo));
}

/**
 * Disable yolo mode for all agents.
 */
export async function disableAll(): Promise<YoloResult[]> {
  const types: AgentType[] = ['claude-code', 'codex', 'copilot', 'amplifier'];
  return Promise.all(types.map(disableYolo));
}

/**
 * Check current yolo status for all agents.
 */
export async function checkYoloStatus(): Promise<YoloResult[]> {
  const results: YoloResult[] = [];

  for (const def of AGENT_DEFINITIONS) {
    const detection = await detectBinary(def.binaries, def.versionFlag);
    if (!detection.found) {
      results.push({
        type: def.type,
        displayName: def.displayName,
        success: true,
        config: {
          enabled: false,
          configPath: def.configPath,
          cliFlag: def.yoloFlag,
          details: 'Not installed',
        },
      });
      continue;
    }

    let enabled = false;
    let details = '';

    try {
      switch (def.type) {
        case 'claude-code': {
          const config = await readJsonConfig(def.configPath);
          enabled = isClaudeCodeEnabled(config);
          details = enabled ? 'permissions.defaultMode = "bypassPermissions"' : 'Default permissions';
          break;
        }
        case 'codex': {
          const config = await readTomlConfig(def.configPath);
          enabled = isCodexEnabled(config);
          details = enabled ? 'approval_policy = "never", sandbox_mode = "danger-full-access"' : 'Default approval policy';
          break;
        }
        case 'copilot':
          details = 'No persistent yolo toggle (use --yolo flag)';
          break;
        case 'amplifier': {
          const config = await readJsonConfig(def.configPath);
          enabled = isAmplifierEnabled(config);
          details = enabled ? 'permissions.defaultLevel = "allow"' : 'Default permissions';
          break;
        }
      }
    } catch {
      details = 'Could not read config';
    }

    results.push({
      type: def.type,
      displayName: def.displayName,
      success: true,
      config: {
        enabled,
        configPath: def.configPath,
        cliFlag: def.yoloFlag,
        details,
      },
    });
  }

  return results;
}

// Export internals for testing
export { readJsonConfig, writeJsonConfig, readTomlConfig, writeTomlConfig, fromToml, toToml };
