import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { AGENT_DEFINITIONS } from './agents.js';
import type { AgentStatus, DetectionResult } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Build candidate paths for a binary name.
 * Checks PATH first, then common install locations that may not be
 * on PATH in all environments (cron, launchd, GUI apps, etc.).
 */
export async function getCandidatePaths(binaryName: string): Promise<string[]> {
  const home = os.homedir();
  const candidates = new Set<string>([binaryName]);

  if (process.platform !== 'win32') {
    [
      `/usr/local/bin/${binaryName}`,
      `/opt/homebrew/bin/${binaryName}`,
      `/usr/bin/${binaryName}`,
      path.join(home, '.local', 'bin', binaryName),
    ].forEach((candidate) => candidates.add(candidate));

    // nvm-managed node versions (filter to v* directories only)
    const nvmDir = path.join(home, '.nvm', 'versions', 'node');
    try {
      const entries = await readdir(nvmDir);
      for (const entry of entries) {
        if (!entry.startsWith('v')) continue;
        candidates.add(path.join(nvmDir, entry, 'bin', binaryName));
      }
    } catch {
      // nvm not installed — skip
    }
  }

  return [...candidates];
}

/**
 * Try to detect a binary by running it with a version flag.
 * Returns the resolved path and version string if found.
 */
export async function detectBinary(
  binaries: string[],
  versionFlag: string,
): Promise<{ found: boolean; path: string | null; version: string | null }> {
  for (const binary of binaries) {
    const candidates = await getCandidatePaths(binary);
    for (const cmd of candidates) {
      try {
        const { stdout, stderr } = await execFileAsync(cmd, [versionFlag], {
          timeout: 5000,
          encoding: 'utf8',
        });
        const output = `${stdout || ''}\n${stderr || ''}`.trim();
        const version = output.split('\n')[0]?.trim() || null;

        let resolvedPath = cmd;
        if (!path.isAbsolute(cmd)) {
          try {
            const whichCmd = process.platform === 'win32' ? 'where' : 'which';
            const { stdout: whichOut } = await execFileAsync(whichCmd, [cmd], {
              timeout: 3000,
              encoding: 'utf8',
            });
            if (whichOut) {
              resolvedPath = whichOut.trim().split('\n')[0];
            }
          } catch {
            // Keep the bare name
          }
        }

        return { found: true, path: resolvedPath, version };
      } catch {
        // Try next candidate
      }
    }
  }
  return { found: false, path: null, version: null };
}

/**
 * Detect all known AI coding agents.
 */
export async function detectAll(): Promise<DetectionResult> {
  const agents: AgentStatus[] = await Promise.all(
    AGENT_DEFINITIONS.map(async (def): Promise<AgentStatus> => {
      const result = await detectBinary(def.binaries, def.versionFlag);
      return {
        type: def.type,
        displayName: def.displayName,
        installed: result.found,
        version: result.version,
        path: result.path,
        installCommand: def.installCommand,
      };
    }),
  );
  return { agents, checkedAt: Date.now() };
}
