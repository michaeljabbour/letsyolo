import { beforeEach, describe, expect, it, vi } from 'vitest';

const detectBinaryMock = vi.fn();

vi.mock('../src/detect.js', () => ({
  detectBinary: detectBinaryMock,
}));

describe('yolo config metadata', () => {
  beforeEach(() => {
    detectBinaryMock.mockReset();
  });

  it('marks session-only agents in status output', async () => {
    detectBinaryMock.mockResolvedValue({ found: false, path: null, version: null });
    const { checkYoloStatus } = await import('../src/configure.js');

    const status = await checkYoloStatus();
    const byType = new Map(status.map((entry) => [entry.type, entry]));

    expect(byType.get('claude-code')?.config?.sessionOnly).toBe(false);
    expect(byType.get('codex')?.config?.sessionOnly).toBe(false);
    expect(byType.get('copilot')?.config?.sessionOnly).toBe(true);
    expect(byType.get('amplifier')?.config?.sessionOnly).toBe(true);
  });

  it('enable on session-only agent does not report persistent enabled', async () => {
    detectBinaryMock.mockResolvedValue({ found: true, path: '/usr/local/bin/amp', version: '1.0.0' });
    const { enableYolo } = await import('../src/configure.js');

    const result = await enableYolo('amplifier');

    expect(result.success).toBe(true);
    expect(result.config?.sessionOnly).toBe(true);
    expect(result.config?.enabled).toBe(false);
    expect(result.config?.details).toContain('No persistent yolo toggle exists for Amplifier');
  });
});
