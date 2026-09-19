/**
 * Copy the generated recipe snapshots next to the compiled CLI.
 *
 * `tsc` emits JavaScript only; the JSON is read at runtime relative to `dist/`, so skipping this step ships a
 * CLI whose recipe commands throw ENOENT.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'src', 'data');
const to = join(here, '..', 'dist', 'data');

mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith('.json'));
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`copied ${files.length} data file(s) to dist/data`);
