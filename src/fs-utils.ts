import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Check if an error is a file-not-found error (ENOENT).
 */
export function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

interface WriteOptions {
  mode?: number;
}

/**
 * Write a file atomically — write to a temp file then rename.
 * Prevents partial writes from corrupting config files.
 */
export async function writeFileAtomic(
  filePath: string,
  content: string,
  options?: WriteOptions,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(4).toString('hex')}.tmp`);

  try {
    await fs.writeFile(tmpFile, content, { mode: options?.mode });
    await fs.rename(tmpFile, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
