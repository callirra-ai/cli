import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { KEY_PREFIX } from './client.js';

export const CONFIG_DIR = path.join(homedir(), '.config', 'callirra');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'api_key');

export class CliError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CliError';
    this.status = status;
  }
}

export async function saveApiKey(key: string): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, key.trim(), 'utf8');
  return CONFIG_FILE;
}

export async function resolveApiKey(explicit?: string): Promise<string> {
  const key = explicit?.trim() || process.env.CALLIRRA_API_KEY?.trim() || (await readFile(CONFIG_FILE, 'utf8').catch(() => '')).trim();
  if (!key) {
    throw new CliError(
      `Missing API key. Run "callirra setup-api-key <sk-cal-...>" or set CALLIRRA_API_KEY.`,
    );
  }
  if (!key.startsWith(KEY_PREFIX)) {
    throw new CliError(`API key must start with "${KEY_PREFIX}".`);
  }
  return key;
}
