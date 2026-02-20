import { describe, it, expect } from 'vitest';
import { AGENT_DEFINITIONS, getDefinition, getDefinitionOrThrow, parseAgentType } from '../src/agents.js';

describe('AGENT_DEFINITIONS', () => {
  it('should define exactly 4 agents', () => {
    expect(AGENT_DEFINITIONS).toHaveLength(4);
  });

  it('should have unique types', () => {
    const types = AGENT_DEFINITIONS.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('should have all required fields on every definition', () => {
    for (const def of AGENT_DEFINITIONS) {
      expect(def.type).toBeTruthy();
      expect(def.displayName).toBeTruthy();
      expect(def.binaries.length).toBeGreaterThan(0);
      expect(def.npmPackage).toBeTruthy();
      expect(def.versionFlag).toBeTruthy();
      expect(def.installCommand).toBeTruthy();
      expect(def.yoloFlag).toBeTruthy();
      expect(def.configPath).toBeTruthy();
      expect(def.configFormat).toMatch(/^(json|toml)$/);
    }
  });

  it('codex should use toml config format', () => {
    const codex = AGENT_DEFINITIONS.find((d) => d.type === 'codex');
    expect(codex?.configFormat).toBe('toml');
  });

  it('should have correct yolo flags', () => {
    const flags = Object.fromEntries(AGENT_DEFINITIONS.map((d) => [d.type, d.yoloFlag]));
    expect(flags['claude-code']).toBe('--dangerously-skip-permissions');
    expect(flags['codex']).toBe('--yolo');
    expect(flags['copilot']).toBe('--yolo');
    expect(flags['amplifier']).toBe('--dangerously-allow-all');
  });
});

describe('getDefinition', () => {
  it('should return definition for known types', () => {
    expect(getDefinition('claude-code')?.displayName).toBe('Claude Code');
    expect(getDefinition('codex')?.displayName).toBe('Codex');
    expect(getDefinition('copilot')?.displayName).toBe('GitHub Copilot');
    expect(getDefinition('amplifier')?.displayName).toBe('Amplifier');
  });

  it('should return undefined for unknown types', () => {
    expect(getDefinition('nonexistent' as any)).toBeUndefined();
  });
});

describe('getDefinitionOrThrow', () => {
  it('should return definition for known types', () => {
    expect(getDefinitionOrThrow('claude-code').displayName).toBe('Claude Code');
  });

  it('should throw for unknown types', () => {
    expect(() => getDefinitionOrThrow('nonexistent' as any)).toThrow('Unknown agent type');
  });
});

describe('parseAgentType', () => {
  it('should parse claude aliases', () => {
    expect(parseAgentType('claude')).toBe('claude-code');
    expect(parseAgentType('claude-code')).toBe('claude-code');
    expect(parseAgentType('claudecode')).toBe('claude-code');
    expect(parseAgentType('CLAUDE')).toBe('claude-code');
  });

  it('should parse codex', () => {
    expect(parseAgentType('codex')).toBe('codex');
    expect(parseAgentType('CODEX')).toBe('codex');
  });

  it('should parse copilot aliases', () => {
    expect(parseAgentType('copilot')).toBe('copilot');
    expect(parseAgentType('github-copilot')).toBe('copilot');
  });

  it('should parse amplifier aliases', () => {
    expect(parseAgentType('amp')).toBe('amplifier');
    expect(parseAgentType('amplifier')).toBe('amplifier');
    expect(parseAgentType('AMP')).toBe('amplifier');
  });

  it('should return undefined for unknown inputs', () => {
    expect(parseAgentType('unknown')).toBeUndefined();
    expect(parseAgentType('')).toBeUndefined();
    expect(parseAgentType('cursor')).toBeUndefined();
  });

  it('should trim whitespace', () => {
    expect(parseAgentType('  claude  ')).toBe('claude-code');
  });
});
