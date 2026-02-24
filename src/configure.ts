import fs from 'node:fs/promises';
import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml';
import { AGENT_DEFINITIONS, getDefinitionOrThrow } from './agents.js';
import { detectBinary } from './detect.js';
import { isFileNotFoundError, writeFileAtomic } from './fs-utils.js';
import type { AgentType, YoloResult } from './types.js';

type JsonConfig = Record<string, unknown>;
type TomlConfig = Record<string, unknown>;

function toToml(obj: TomlConfig): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return stringifyToml(obj as any).trimEnd();
}

function fromToml(text: string): TomlConfig {
  const parsed = parseToml(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as TomlConfig;
}

/**
 * Read a JSON config file, returning {} if it doesn't exist.
 */
async function readJsonConfig(filePath: string): Promise<JsonConfig> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Expected a JSON object in ${filePath}`);
    }
    return parsed as JsonConfig;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {};
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }

    throw error;
  }
}

/**
 * Write a JSON config file, creating parent dirs as needed.
 */
async function writeJsonConfig(filePath: string, config: JsonConfig): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Read a TOML config file, returning {} if it doesn't exist.
 */
async function readTomlConfig(filePath: string): Promise<TomlConfig> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return fromToml(data);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {};
    }

    if (error instanceof Error) {
      throw new Error(`Invalid TOML in ${filePath}: ${error.message}`);
    }

    throw error;
  }
}

/**
 * Write a TOML config file, creating parent dirs as needed.
 */
async function writeTomlConfig(filePath: string, config: TomlConfig): Promise<void> {
  await writeFileAtomic(filePath, toToml(config) + '\n');
}

function getOrCreateObject(parent: JsonConfig, key: string): JsonConfig {
  const value = parent[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonConfig;
  }

  const next: JsonConfig = {};
  parent[key] = next;
  return next;
}

function getTomlString(config: TomlConfig, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' ? value : undefined;
}

function requireConfigPath(configPath: string | undefined, agentName: string): string {
  if (!configPath) {
    throw new Error(`${agentName} does not expose a persistent config file`);
  }
  return configPath;
}

// --- Per-agent enable/disable logic ---

async function enableClaudeCode(configPath: string): Promise<string> {
  const config = await readJsonConfig(configPath);
  const permissions = getOrCreateObject(config, 'permissions');
  permissions.defaultMode = 'bypassPermissions';
  await writeJsonConfig(configPath, config);
  return 'Set permissions.defaultMode = "bypassPermissions"';
}

async function disableClaudeCode(configPath: string): Promise<string> {
  const config = await readJsonConfig(configPath);
  const permissions = config.permissions;

  if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
    const perms = permissions as JsonConfig;
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

function isClaudeCodeEnabled(config: JsonConfig): boolean {
  const permissions = config.permissions;
  if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
    return (permissions as JsonConfig).defaultMode === 'bypassPermissions';
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

  if (getTomlString(config, 'approval_policy') === 'never') {
    delete config.approval_policy;
    changed = true;
  }

  if (getTomlString(config, 'sandbox_mode') === 'danger-full-access') {
    delete config.sandbox_mode;
    changed = true;
  }

  if (changed) {
    await writeTomlConfig(configPath, config);
    return 'Removed approval_policy and sandbox_mode overrides';
  }

  return 'Already disabled (no yolo settings found)';
}

function isCodexEnabled(config: TomlConfig): boolean {
  return (
    getTomlString(config, 'approval_policy') === 'never' &&
    getTomlString(config, 'sandbox_mode') === 'danger-full-access'
  );
}

async function enableCopilot(configPath: string): Promise<string> {
  // Copilot has no persistent yolo toggle — only CLI flags.
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

async function enableAmplifier(_configPath?: string): Promise<string> {
  // Microsoft Amplifier has no persistent yolo toggle and no bypass flag.
  // Run `amplifier` to start chat or `amplifier run "<prompt>"` for a single prompt.
  return 'No persistent yolo toggle exists for Amplifier. Run `amplifier` to start or `amplifier run "<prompt>"` for one-shot use.';
}

async function disableAmplifier(_configPath?: string): Promise<string> {
  return 'No persistent yolo toggle to disable for Amplifier.';
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
    let enabled = false;
    const sessionOnly = !def.persistentToggle;

    switch (agentType) {
      case 'claude-code':
        details = await enableClaudeCode(requireConfigPath(def.configPath, def.displayName));
        enabled = true;
        break;
      case 'codex':
        details = await enableCodex(requireConfigPath(def.configPath, def.displayName));
        enabled = true;
        break;
      case 'copilot':
        details = await enableCopilot(requireConfigPath(def.configPath, def.displayName));
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
        enabled,
        sessionOnly,
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
    const sessionOnly = !def.persistentToggle;
    switch (agentType) {
      case 'claude-code':
        details = await disableClaudeCode(requireConfigPath(def.configPath, def.displayName));
        break;
      case 'codex':
        details = await disableCodex(requireConfigPath(def.configPath, def.displayName));
        break;
      case 'copilot':
        details = await disableCopilot(requireConfigPath(def.configPath, def.displayName));
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
        sessionOnly,
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
          sessionOnly: !def.persistentToggle,
          configPath: def.configPath,
          cliFlag: def.yoloFlag,
          details: 'Not installed',
        },
      });
      continue;
    }

    let enabled = false;
    let details = '';
    const sessionOnly = !def.persistentToggle;

    try {
      switch (def.type) {
        case 'claude-code': {
          const config = await readJsonConfig(requireConfigPath(def.configPath, def.displayName));
          enabled = isClaudeCodeEnabled(config);
          details = enabled ? 'permissions.defaultMode = "bypassPermissions"' : 'Default permissions';
          break;
        }
        case 'codex': {
          const config = await readTomlConfig(requireConfigPath(def.configPath, def.displayName));
          enabled = isCodexEnabled(config);
          details = enabled ? 'approval_policy = "never", sandbox_mode = "danger-full-access"' : 'Default approval policy';
          break;
        }
        case 'copilot':
          details = 'No persistent yolo toggle (use --yolo flag)';
          break;
        case 'amplifier':
          details = 'No persistent yolo toggle. Run `amplifier` or `amplifier run "<prompt>"`.';
          break;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      details = `Could not read config (${reason})`;
    }

    results.push({
      type: def.type,
      displayName: def.displayName,
      success: true,
      config: {
        enabled,
        sessionOnly,
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
