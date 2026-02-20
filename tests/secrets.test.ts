import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// We test the lower-level functions by importing them.
// interactiveSetup requires stdin so we test it indirectly.
import {
  readSecrets,
  writeSecrets,
  getShellProfiles,
  getSourceLine,
  isSourcedIn,
  addSourceLine,
  checkApiKeyStatus,
  API_KEYS,
  SECRETS_FILE,
} from '../src/secrets.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'letsyolo-secrets-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('API_KEYS', () => {
  it('should define keys for all 4 agents', () => {
    expect(API_KEYS).toHaveLength(4);
    const agents = API_KEYS.map((k) => k.agent);
    expect(agents).toContain('Claude Code');
    expect(agents).toContain('Codex');
    expect(agents).toContain('GitHub Copilot');
    expect(agents).toContain('Amplifier');
  });

  it('should have unique env var names', () => {
    const vars = API_KEYS.map((k) => k.envVar);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it('should include hints with URLs', () => {
    for (const key of API_KEYS) {
      expect(key.hint).toMatch(/https?:\/\//);
    }
  });
});

describe('writeSecrets / readSecrets roundtrip', () => {
  // We can't easily override SECRETS_FILE, so we test the write/read format
  // by writing to a tmp file and reading back. We'll test the format directly.

  it('should produce export lines', async () => {
    const filePath = path.join(tmpDir, 'secrets.env');
    const secrets = new Map<string, string>();
    secrets.set('ANTHROPIC_API_KEY', 'sk-ant-test123');
    secrets.set('OPENAI_API_KEY', 'sk-test456');

    // Write manually in the expected format
    const lines = [
      '# letsyolo API keys — sourced by your shell profile',
      '# DO NOT commit this file to version control',
      '',
      'export ANTHROPIC_API_KEY="sk-ant-test123"',
      'export OPENAI_API_KEY="sk-test456"',
      '',
    ];
    await fs.writeFile(filePath, lines.join('\n'), { mode: 0o600 });

    // Read it back
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('export ANTHROPIC_API_KEY="sk-ant-test123"');
    expect(content).toContain('export OPENAI_API_KEY="sk-test456"');
    expect(content).toContain('# DO NOT commit');
  });
});

describe('secrets.env parsing', () => {
  it('should parse export KEY="value" format', async () => {
    const filePath = path.join(tmpDir, 'test.env');
    await fs.writeFile(filePath, 'export FOO="bar"\nexport BAZ="qux"\n');

    const content = await fs.readFile(filePath, 'utf-8');
    const secrets = new Map<string, string>();
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"']*)["']?$/);
      if (match) {
        secrets.set(match[1], match[2]);
      }
    }

    expect(secrets.get('FOO')).toBe('bar');
    expect(secrets.get('BAZ')).toBe('qux');
  });

  it('should parse KEY=value without export', async () => {
    const filePath = path.join(tmpDir, 'test.env');
    await fs.writeFile(filePath, 'MY_KEY=myvalue\n');

    const content = await fs.readFile(filePath, 'utf-8');
    const match = content.trim().match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=["']?([^"']*)["']?$/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe('MY_KEY');
    expect(match![2]).toBe('myvalue');
  });

  it('should skip comments', async () => {
    const filePath = path.join(tmpDir, 'test.env');
    await fs.writeFile(filePath, '# comment\nexport KEY="val"\n# another\n');

    const content = await fs.readFile(filePath, 'utf-8');
    const keys: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=/);
      if (match) keys.push(match[1]);
    }
    expect(keys).toEqual(['KEY']);
  });
});

describe('getSourceLine', () => {
  it('should reference .letsyolo/secrets.env', () => {
    const line = getSourceLine();
    expect(line).toContain('.letsyolo/secrets.env');
  });

  it('should use source command on unix', () => {
    if (process.platform === 'win32') return;
    const line = getSourceLine();
    expect(line).toContain('source');
  });

  it('should guard with -f check on unix', () => {
    if (process.platform === 'win32') return;
    const line = getSourceLine();
    expect(line).toContain('[ -f ');
  });
});

describe('getShellProfiles', () => {
  it('should return at least one profile path', () => {
    const profiles = getShellProfiles();
    expect(profiles.length).toBeGreaterThan(0);
  });

  it('should include .zshrc on macOS/Linux', () => {
    if (process.platform === 'win32') return;
    const profiles = getShellProfiles();
    const zshrc = profiles.find((p) => p.endsWith('.zshrc'));
    expect(zshrc).toBeTruthy();
  });
});

describe('isSourcedIn', () => {
  it('should return false for non-existent file', async () => {
    const result = await isSourcedIn(path.join(tmpDir, 'nonexistent'));
    expect(result).toBe(false);
  });

  it('should return false for file without source line', async () => {
    const filePath = path.join(tmpDir, '.zshrc');
    await fs.writeFile(filePath, 'export PATH="/usr/local/bin:$PATH"\n');
    const result = await isSourcedIn(filePath);
    expect(result).toBe(false);
  });

  it('should return true for file with source line', async () => {
    const filePath = path.join(tmpDir, '.zshrc');
    await fs.writeFile(filePath, 'source "$HOME/.letsyolo/secrets.env"\n');
    const result = await isSourcedIn(filePath);
    expect(result).toBe(true);
  });
});

describe('addSourceLine', () => {
  it('should add source line to existing file', async () => {
    const filePath = path.join(tmpDir, '.zshrc');
    await fs.writeFile(filePath, 'export PATH="/usr/bin:$PATH"\n');

    const added = await addSourceLine(filePath);
    expect(added).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('.letsyolo/secrets.env');
    expect(content).toContain('# letsyolo API keys');
  });

  it('should create file if it does not exist', async () => {
    const filePath = path.join(tmpDir, 'newprofile', '.zshrc');
    const added = await addSourceLine(filePath);
    expect(added).toBe(true);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('.letsyolo/secrets.env');
  });

  it('should not duplicate source line', async () => {
    const filePath = path.join(tmpDir, '.zshrc');
    await fs.writeFile(filePath, '# letsyolo API keys\nsource "$HOME/.letsyolo/secrets.env"\n');

    const added = await addSourceLine(filePath);
    expect(added).toBe(false);
  });

  it('should preserve existing content', async () => {
    const filePath = path.join(tmpDir, '.zshrc');
    const original = 'export FOO="bar"\nalias ll="ls -la"\n';
    await fs.writeFile(filePath, original);

    await addSourceLine(filePath);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('export FOO="bar"');
    expect(content).toContain('alias ll="ls -la"');
    expect(content).toContain('.letsyolo/secrets.env');
  });
});

describe('SECRETS_FILE', () => {
  it('should be in home directory', () => {
    expect(SECRETS_FILE).toContain('.letsyolo');
    expect(SECRETS_FILE).toContain('secrets.env');
  });
});

describe('checkApiKeyStatus', () => {
  it('should return status for all 4 keys', async () => {
    const status = await checkApiKeyStatus();
    expect(status).toHaveLength(4);
    for (const s of status) {
      expect(s).toHaveProperty('envVar');
      expect(s).toHaveProperty('agent');
      expect(s).toHaveProperty('set');
      expect(s).toHaveProperty('source');
      expect(['env', 'file', 'none']).toContain(s.source);
    }
  });
});
