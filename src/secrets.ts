import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

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
    envVar: 'SRC_ACCESS_TOKEN',
    displayName: 'Sourcegraph Access Token',
    agent: 'Amplifier',
    hint: 'https://sourcegraph.com/user/settings/tokens',
  },
];

/**
 * Common dotfiles and env files where API keys might already live.
 */
export function getSearchPaths(): string[] {
  return [
    // Our own file first
    SECRETS_FILE,
    // Common env files
    path.join(home, '.env'),
    path.join(home, '.secrets'),
    path.join(home, '.secrets.env'),
    // Shell profiles (people export keys here)
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
    path.join(home, '.profile'),
    path.join(home, '.zshenv'),
    // XDG / config locations
    path.join(home, '.config', '.env'),
    path.join(home, '.config', 'env'),
    path.join(home, '.config', 'secrets'),
  ];
}

/**
 * Parse a file for env var assignments.
 * Handles: export KEY="value", export KEY=value, KEY=value, KEY="value"
 */
export function parseEnvLines(content: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"'\s#]*)["']?/);
    if (match && match[2]) {
      result.set(match[1], match[2]);
    }
  }
  return result;
}

/**
 * Read our secrets file into a map.
 */
export async function readSecrets(): Promise<Map<string, string>> {
  try {
    const data = await fs.readFile(SECRETS_FILE, 'utf-8');
    return parseEnvLines(data);
  } catch {
    return new Map();
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
    const val = process.env[envVar];
    if (val) {
      found.set(envVar, { value: val, source: 'environment' });
    }
  }

  // Scan files — earlier finds don't get overwritten (env takes priority)
  for (const filePath of searchPaths) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = parseEnvLines(data);
      for (const [key, value] of parsed) {
        if (targetVars.has(key) && !found.has(key)) {
          const relPath = filePath.startsWith(home)
            ? '~' + filePath.slice(home.length)
            : filePath;
          found.set(key, { value, source: relPath });
        }
      }
    } catch {
      // File doesn't exist or can't be read — skip
    }
  }

  return found;
}

/**
 * Write secrets to the env file.
 */
export async function writeSecrets(secrets: Map<string, string>): Promise<void> {
  await fs.mkdir(SECRETS_DIR, { recursive: true });

  const lines = [
    '# letsyolo API keys — sourced by your shell profile',
    '# DO NOT commit this file to version control',
    '',
  ];

  for (const keyDef of API_KEYS) {
    const value = secrets.get(keyDef.envVar);
    if (value) {
      lines.push(`export ${keyDef.envVar}="${value}"`);
    }
  }

  // Preserve any extra keys the user added manually
  for (const [key, value] of secrets) {
    if (!API_KEYS.some((d) => d.envVar === key)) {
      lines.push(`export ${key}="${value}"`);
    }
  }

  lines.push('');
  await fs.writeFile(SECRETS_FILE, lines.join('\n'), { mode: 0o600 });
}

/**
 * Get shell profile paths for the current platform.
 */
export function getShellProfiles(): string[] {
  if (process.platform === 'win32') {
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
  return `[ -f "$HOME/.letsyolo/secrets.env" ] && source "$HOME/.letsyolo/secrets.env"`;
}

/**
 * Check if a shell profile already sources the secrets file.
 */
export async function isSourcedIn(profilePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(profilePath, 'utf-8');
    return content.includes('.letsyolo/secrets.env');
  } catch {
    return false;
  }
}

/**
 * Add the source line to a shell profile.
 */
export async function addSourceLine(profilePath: string): Promise<boolean> {
  const alreadySourced = await isSourcedIn(profilePath);
  if (alreadySourced) return false;

  try {
    let content = '';
    try {
      content = await fs.readFile(profilePath, 'utf-8');
    } catch {
      // File doesn't exist — we'll create it
    }

    const line = getSourceLine();
    const addition = `\n# letsyolo API keys\n${line}\n`;

    await fs.mkdir(path.dirname(profilePath), { recursive: true });
    await fs.writeFile(profilePath, content + addition);
    return true;
  } catch {
    return false;
  }
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
 * Mask an API key for display: show first 8 and last 4 chars.
 */
export function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * Interactive setup — scans for existing keys, prompts for missing ones.
 */
export async function interactiveSetup(): Promise<{ saved: string[]; skipped: string[]; found: string[] }> {
  const scanned = await scanForExistingKeys();
  const existing = await readSecrets();

  // Merge scanned keys into existing (scanned values are defaults, existing file wins)
  for (const [key, { value }] of scanned) {
    if (!existing.has(key)) {
      existing.set(key, value);
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const saved: string[] = [];
  const skipped: string[] = [];
  const found: string[] = [];

  try {
    for (const keyDef of API_KEYS) {
      const currentValue = existing.get(keyDef.envVar);
      const scanResult = scanned.get(keyDef.envVar);

      if (currentValue && scanResult) {
        // Key was found — show where and let user confirm with Enter
        console.log(`  ${keyDef.displayName} (${keyDef.agent})`);
        console.log(`    Found: ${maskKey(currentValue)} (from ${scanResult.source})`);

        const answer = await askQuestion(rl, `    Keep this? [Y/n] `);

        if (answer === '' || answer.toLowerCase().startsWith('y')) {
          found.push(keyDef.envVar);
        } else if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
          // Ask for new value
          const newVal = await askQuestion(rl, `    ${keyDef.envVar}= `);
          if (newVal) {
            existing.set(keyDef.envVar, newVal);
            saved.push(keyDef.envVar);
          } else {
            existing.delete(keyDef.envVar);
            skipped.push(keyDef.envVar);
          }
        } else {
          // Treat any other input as the new key value
          existing.set(keyDef.envVar, answer);
          saved.push(keyDef.envVar);
        }
        console.log();
      } else {
        // Key not found — prompt for it
        const answer = await askQuestion(
          rl,
          `  ${keyDef.displayName} (${keyDef.agent})\n  ${keyDef.hint}\n  ${keyDef.envVar}= `,
        );

        if (answer) {
          existing.set(keyDef.envVar, answer);
          saved.push(keyDef.envVar);
        } else {
          skipped.push(keyDef.envVar);
        }
        console.log();
      }
    }
  } finally {
    rl.close();
  }

  await writeSecrets(existing);
  return { saved, skipped, found };
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
