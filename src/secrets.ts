import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { isFileNotFoundError, writeFileAtomic } from './fs-utils.js';

const home = os.homedir();

export const SECRETS_DIR = path.join(home, '.letsyolo');
export const SECRETS_FILE = path.join(SECRETS_DIR, 'secrets.env');

export interface ApiKeyDefinition {
  envVar: string;
  displayName: string;
  agent: string;
  hint: string;
}

export const API_KEYS: ApiKeyDefinition[] = [
  {
    envVar: 'ANTHROPIC_API_KEY',
    displayName: 'Anthropic API Key',
    agent: 'Claude Code',
    hint: 'https://console.anthropic.com/settings/keys',
  },
  {
    envVar: 'OPENAI_API_KEY',
    displayName: 'OpenAI API Key',
    agent: 'Codex',
    hint: 'https://platform.openai.com/api-keys',
  },
  {
    envVar: 'GITHUB_TOKEN',
    displayName: 'GitHub Token',
    agent: 'GitHub Copilot',
    hint: 'https://github.com/settings/tokens (or use `gh auth login`)',
  },
  {
    envVar: 'AMPLIFIER_CONFIGURED',
    displayName: 'Amplifier Provider Keys',
    agent: 'Amplifier',
    hint: 'Managed by Amplifier in ~/.amplifier/keys.env (run `amplifier init` or `amplifier provider use`)',
  },
];

function escapeForDoubleQuotes(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

function unescapeDoubleQuotedValue(value: string): string {
  let result = '';

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== '\\') {
      result += ch;
      continue;
    }

    const next = value[i + 1];
    if (next === undefined) {
      result += '\\';
      continue;
    }

    i += 1;
    switch (next) {
      case 'n':
        result += '\n';
        break;
      case 'r':
        result += '\r';
        break;
      case 't':
        result += '\t';
        break;
      case '"':
      case '$':
      case '`':
      case '\\':
        result += next;
        break;
      default:
        result += next;
        break;
    }
  }

  return result;
}

function quoteEnvValue(value: string): string {
  return `"${escapeForDoubleQuotes(value)}"`;
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const match = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    return undefined;
  }

  const key = match[1];
  let rawValue = match[2].trim();

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    rawValue = unescapeDoubleQuotedValue(rawValue.slice(1, -1));
  } else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    rawValue = rawValue.slice(1, -1);
  } else {
    rawValue = rawValue.split(/\s+#/, 1)[0].trim();
  }

  return { key, value: rawValue };
}

/**
 * Read existing secrets file into a map.
 */
export async function readSecrets(): Promise<Map<string, string>> {
  const secrets = new Map<string, string>();
  try {
    const data = await fs.readFile(SECRETS_FILE, 'utf-8');
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parsed = parseEnvLine(trimmed);
      if (parsed) {
        secrets.set(parsed.key, parsed.value);
      }
    }
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }
  return secrets;
}

/**
 * Write secrets to the env file.
 */
export async function writeSecrets(secrets: Map<string, string>): Promise<void> {
  await fs.mkdir(SECRETS_DIR, { recursive: true, mode: 0o700 });

  const lines = [
    '# letsyolo API keys — sourced by your shell profile',
    '# DO NOT commit this file to version control',
    '',
  ];

  for (const keyDef of API_KEYS) {
    if (keyDef.envVar === 'AMPLIFIER_CONFIGURED') continue; // Virtual — not a real env var
    const value = secrets.get(keyDef.envVar);
    if (value) {
      lines.push(`export ${keyDef.envVar}=${quoteEnvValue(value)}`);
    }
  }

  // Preserve any extra keys the user added manually
  for (const [key, value] of secrets) {
    if (!API_KEYS.some((d) => d.envVar === key)) {
      lines.push(`export ${key}=${quoteEnvValue(value)}`);
    }
  }

  lines.push('');
  await writeFileAtomic(SECRETS_FILE, lines.join('\n'), { mode: 0o600 });
  await fs.chmod(SECRETS_FILE, 0o600);
}

/**
 * Get shell profile paths for the current platform.
 */
export function getShellProfiles(): string[] {
  if (process.platform === 'win32') {
    // PowerShell profile
    const psProfile = path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
    const psProfileAlt = path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1');
    return [psProfile, psProfileAlt];
  }

  return [
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
  ];
}

/**
 * The source line to add to shell profiles.
 */
export function getSourceLine(): string {
  if (process.platform === 'win32') {
    return `. "${SECRETS_FILE.replace(/\\/g, '\\\\')}"`;
  }
  // Use $HOME so it works if the file is shared or copied.
  return `[ -f "$HOME/.letsyolo/secrets.env" ] && source "$HOME/.letsyolo/secrets.env"`;
}

/**
 * Check if a shell profile already sources the secrets file.
 */
export async function isSourcedIn(profilePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(profilePath, 'utf-8');
    return content.includes('.letsyolo/secrets.env');
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

/**
 * Add the source line to a shell profile.
 */
export async function addSourceLine(profilePath: string): Promise<boolean> {
  const alreadySourced = await isSourcedIn(profilePath);
  if (alreadySourced) return false;

  let content = '';
  try {
    content = await fs.readFile(profilePath, 'utf-8');
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  const line = getSourceLine();
  const addition = `\n# letsyolo API keys\n${line}\n`;

  await writeFileAtomic(profilePath, content + addition);
  return true;
}

/**
 * Prompt user for a single value via stdin.
 */
function askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive setup — prompts for each API key.
 */
export async function interactiveSetup(): Promise<{ saved: string[]; skipped: string[] }> {
  const existing = await readSecrets();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const saved: string[] = [];
  const skipped: string[] = [];

  try {
    for (const keyDef of API_KEYS) {
      // Amplifier manages its own keys — skip interactive prompt
      if (keyDef.envVar === 'AMPLIFIER_CONFIGURED') {
        const amp = await checkAmplifierKeys();
        if (amp.configured) {
          console.log(`  ${keyDef.displayName} (${keyDef.agent})`);
          console.log(`    Self-managed in ${amp.source} — skipping\n`);
        } else {
          console.log(`  ${keyDef.displayName} (${keyDef.agent})`);
          console.log(`    Not configured. Run: amplifier init\n`);
          skipped.push(keyDef.envVar);
        }
        continue;
      }

      const current = existing.get(keyDef.envVar) || process.env[keyDef.envVar];
      const masked = current ? `${current.slice(0, 8)}...${current.slice(-4)}` : '';
      const currentDisplay = masked ? ` [current: ${masked}]` : '';

      const answer = await askQuestion(
        rl,
        `  ${keyDef.displayName} (${keyDef.agent})${currentDisplay}\n  ${keyDef.hint}\n  ${keyDef.envVar}= `,
      );

      if (answer) {
        existing.set(keyDef.envVar, answer);
        saved.push(keyDef.envVar);
      } else {
        skipped.push(keyDef.envVar);
      }
    }
  } finally {
    rl.close();
  }

  await writeSecrets(existing);
  return { saved, skipped };
}

/**
 * Common dotfiles and env files where API keys might already live.
 */
export function getSearchPaths(): string[] {
  return [
    SECRETS_FILE,
    path.join(home, '.env'),
    path.join(home, '.secrets'),
    path.join(home, '.secrets.env'),
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
    path.join(home, '.profile'),
    path.join(home, '.zshenv'),
    path.join(home, '.config', '.env'),
    path.join(home, '.config', 'env'),
    path.join(home, '.config', 'secrets'),
    // Agent-specific key files
    path.join(home, '.amplifier', 'keys.env'),
  ];
}

/**
 * Check if Amplifier has its own keys configured in ~/.amplifier/keys.env.
 * Amplifier manages its own provider keys — we just detect whether it's set up.
 */
async function checkAmplifierKeys(): Promise<{ configured: boolean; source: string }> {
  const keysFile = path.join(home, '.amplifier', 'keys.env');
  try {
    const data = await fs.readFile(keysFile, 'utf-8');
    // Check if it has at least one actual key (not just comments/blanks)
    const hasKeys = data.split('\n').some((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return false;
      const parsed = parseEnvLine(trimmed);
      return parsed && parsed.value.length > 0;
    });
    return { configured: hasKeys, source: '~/.amplifier/keys.env' };
  } catch {
    return { configured: false, source: '' };
  }
}

/**
 * Scan common dotfiles for existing API keys.
 * Returns found keys with where they were found.
 */
export async function scanForExistingKeys(): Promise<Map<string, { value: string; source: string }>> {
  const found = new Map<string, { value: string; source: string }>();
  const targetVars = new Set(API_KEYS.map((k) => k.envVar));
  const searchPaths = getSearchPaths();

  // Check current environment first
  for (const envVar of targetVars) {
    if (envVar === 'AMPLIFIER_CONFIGURED') continue; // Not a real env var
    const val = process.env[envVar];
    if (val) {
      found.set(envVar, { value: val, source: 'environment' });
    }
  }

  // Scan files — earlier finds don't get overwritten (env takes priority)
  for (const filePath of searchPaths) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      for (const line of data.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parsed = parseEnvLine(trimmed);
        if (parsed && targetVars.has(parsed.key) && !found.has(parsed.key)) {
          const relPath = filePath.startsWith(home)
            ? '~' + filePath.slice(home.length)
            : filePath;
          found.set(parsed.key, { value: parsed.value, source: relPath });
        }
      }
    } catch {
      // File doesn't exist or can't be read — skip
    }
  }

  // Check Amplifier's self-managed keys
  if (!found.has('AMPLIFIER_CONFIGURED')) {
    const amp = await checkAmplifierKeys();
    if (amp.configured) {
      found.set('AMPLIFIER_CONFIGURED', { value: 'configured', source: amp.source });
    }
  }

  return found;
}

/**
 * Mask an API key for display: show first 8 and last 4 chars.
 */
export function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * Check which API keys are currently set (env, secrets file, or scanned).
 */
export async function checkApiKeyStatus(): Promise<{ envVar: string; agent: string; set: boolean; source: string }[]> {
  const scanned = await scanForExistingKeys();
  const fileSecrets = await readSecrets();

  return API_KEYS.map((keyDef) => {
    const inEnv = !!process.env[keyDef.envVar];
    const inFile = fileSecrets.has(keyDef.envVar);
    const scanResult = scanned.get(keyDef.envVar);

    let source = 'not set';
    if (inEnv) source = 'environment';
    else if (inFile) source = 'secrets file';
    else if (scanResult) source = scanResult.source;

    return {
      envVar: keyDef.envVar,
      agent: keyDef.agent,
      set: inEnv || inFile || !!scanResult,
      source,
    };
  });
}
