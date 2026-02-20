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
 * Read existing secrets file into a map.
 */
export async function readSecrets(): Promise<Map<string, string>> {
  const secrets = new Map<string, string>();
  try {
    const data = await fs.readFile(SECRETS_FILE, 'utf-8');
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // Match: export KEY="value" or export KEY=value or KEY=value
      const match = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"']*)["']?$/);
      if (match) {
        secrets.set(match[1], match[2]);
      }
    }
  } catch {
    // File doesn't exist yet
  }
  return secrets;
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
  // Use $HOME so it works if the file is shared or copied
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
    // Check if file exists
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
 * Check which API keys are currently set (in env or secrets file).
 */
export async function checkApiKeyStatus(): Promise<{ envVar: string; agent: string; set: boolean; source: 'env' | 'file' | 'none' }[]> {
  const fileSecrets = await readSecrets();

  return API_KEYS.map((keyDef) => {
    const inEnv = !!process.env[keyDef.envVar];
    const inFile = fileSecrets.has(keyDef.envVar);
    return {
      envVar: keyDef.envVar,
      agent: keyDef.agent,
      set: inEnv || inFile,
      source: inEnv ? 'env' as const : inFile ? 'file' as const : 'none' as const,
    };
  });
}
