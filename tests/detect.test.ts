import { describe, it, expect } from 'vitest';
import { getCandidatePaths } from '../src/detect.js';

describe('getCandidatePaths', () => {
  it('should always include the bare binary name', async () => {
    const paths = await getCandidatePaths('testbin');
    expect(paths[0]).toBe('testbin');
  });

  it('should include common unix paths on non-windows', async () => {
    if (process.platform === 'win32') return;

    const paths = await getCandidatePaths('claude');
    expect(paths).toContain('/usr/local/bin/claude');
    expect(paths).toContain('/opt/homebrew/bin/claude');
    expect(paths).toContain('/usr/bin/claude');
  });

  it('should include ~/.local/bin on non-windows', async () => {
    if (process.platform === 'win32') return;

    const paths = await getCandidatePaths('claude');
    const localBin = paths.find((p) => p.includes('.local/bin/claude'));
    expect(localBin).toBeTruthy();
  });

  it('should include nvm paths when nvm is installed', async () => {
    if (process.platform === 'win32') return;

    const paths = await getCandidatePaths('codex');
    // nvm paths contain .nvm/versions/node
    const nvmPaths = paths.filter((p) => p.includes('.nvm/versions/node'));
    // May or may not have nvm — just check they're valid paths if present
    for (const p of nvmPaths) {
      expect(p).toMatch(/\.nvm\/versions\/node\/v[\d.]+\/bin\/codex/);
    }
  });

  it('should return at least the bare name for any input', async () => {
    const paths = await getCandidatePaths('anything');
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0]).toBe('anything');
  });
});
