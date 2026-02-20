import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  readJsonConfig,
  writeJsonConfig,
  readTomlConfig,
  writeTomlConfig,
  fromToml,
  toToml,
} from '../src/configure.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'letsyolo-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('toToml', () => {
  it('should serialize string values', () => {
    const result = toToml({ name: 'hello' });
    expect(result).toContain('name = "hello"');
  });

  it('should handle multiple keys', () => {
    const result = toToml({ a: 'one', b: 'two' });
    expect(result).toContain('a = "one"');
    expect(result).toContain('b = "two"');
  });
});

describe('fromToml', () => {
  it('should parse string values', () => {
    const result = fromToml('name = "hello"');
    expect(result.name).toBe('hello');
  });

  it('should parse multiple keys', () => {
    const result = fromToml('a = "one"\nb = "two"');
    expect(result.a).toBe('one');
    expect(result.b).toBe('two');
  });
});

describe('readJsonConfig / writeJsonConfig', () => {
  it('should write and read back JSON config', async () => {
    const filePath = path.join(tmpDir, 'config.json');
    await writeJsonConfig(filePath, { hello: 'world', nested: { a: 1 } });

    const result = await readJsonConfig(filePath);
    expect(result).toEqual({ hello: 'world', nested: { a: 1 } });
  });

  it('should return empty object for missing file', async () => {
    const result = await readJsonConfig(path.join(tmpDir, 'nonexistent.json'));
    expect(result).toEqual({});
  });

  it('should create parent directories', async () => {
    const filePath = path.join(tmpDir, 'deep', 'nested', 'config.json');
    await writeJsonConfig(filePath, { ok: true });

    const result = await readJsonConfig(filePath);
    expect(result).toEqual({ ok: true });
  });

  it('should pretty-print with 2-space indentation', async () => {
    const filePath = path.join(tmpDir, 'pretty.json');
    await writeJsonConfig(filePath, { a: 1 });

    const raw = await fs.readFile(filePath, 'utf-8');
    expect(raw).toBe('{\n  "a": 1\n}\n');
  });
});

describe('readTomlConfig / writeTomlConfig', () => {
  it('should write and read back TOML config', async () => {
    const filePath = path.join(tmpDir, 'config.toml');
    await writeTomlConfig(filePath, { key: 'value', mode: 'test' });

    const result = await readTomlConfig(filePath);
    expect(result.key).toBe('value');
    expect(result.mode).toBe('test');
  });

  it('should return empty object for missing file', async () => {
    const result = await readTomlConfig(path.join(tmpDir, 'nonexistent.toml'));
    expect(result).toEqual({});
  });

  it('should create parent directories', async () => {
    const filePath = path.join(tmpDir, 'deep', 'config.toml');
    await writeTomlConfig(filePath, { ok: 'true' });

    const result = await readTomlConfig(filePath);
    expect(result.ok).toBe('true');
  });
});

describe('Codex TOML config roundtrip', () => {
  it('should handle codex yolo config', async () => {
    const filePath = path.join(tmpDir, 'codex.toml');
    const config = {
      approval_policy: 'never',
      sandbox_mode: 'danger-full-access',
    };

    await writeTomlConfig(filePath, config);
    const result = await readTomlConfig(filePath);
    expect(result.approval_policy).toBe('never');
    expect(result.sandbox_mode).toBe('danger-full-access');
  });
});

describe('Claude Code JSON config roundtrip', () => {
  it('should handle claude yolo config', async () => {
    const filePath = path.join(tmpDir, 'claude.json');
    const config = {
      permissions: {
        defaultMode: 'bypassPermissions',
      },
    };

    await writeJsonConfig(filePath, config);
    const result = await readJsonConfig(filePath);
    expect((result.permissions as Record<string, unknown>).defaultMode).toBe('bypassPermissions');
  });

  it('should preserve existing keys when updating', async () => {
    const filePath = path.join(tmpDir, 'claude.json');
    await writeJsonConfig(filePath, {
      existing: 'data',
      permissions: { allow: ['Edit'] },
    });

    const config = await readJsonConfig(filePath);
    if (!config.permissions || typeof config.permissions !== 'object') {
      config.permissions = {};
    }
    (config.permissions as Record<string, unknown>).defaultMode = 'bypassPermissions';
    await writeJsonConfig(filePath, config);

    const result = await readJsonConfig(filePath);
    expect(result.existing).toBe('data');
    expect((result.permissions as Record<string, unknown>).allow).toEqual(['Edit']);
    expect((result.permissions as Record<string, unknown>).defaultMode).toBe('bypassPermissions');
  });
});
