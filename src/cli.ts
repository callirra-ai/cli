/* eslint-disable no-console */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { CallirraClient, KEY_PREFIX } from './client.js';
import { CliError, resolveApiKey, saveApiKey } from './config.js';

let activeClient: CallirraClient | null = null;

/** Read the CLI version from package.json (avoid hardcoded drift). */
async function packageVersion(): Promise<string> {
  try {
    const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function client(): Promise<CallirraClient> {
  if (!activeClient) {
    activeClient = new CallirraClient({
      apiKey: await resolveApiKey(),
      apiBase: process.env.CALLIRRA_API_BASE,
    });
  }
  return activeClient;
}

function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
}

function stringOption(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

interface PromptRecipe {
  slug: string;
  title: string;
  category: string;
  scene: string;
  config: Record<string, unknown>;
  credits: number | null;
  keywords: string[];
  prompt: string;
  deepLink: string | null;
}

let promptCache: { recipes: PromptRecipe[]; byCategory: Record<string, number> } | null = null;
function promptRecipes(): { recipes: PromptRecipe[]; byCategory: Record<string, number> } {
  promptCache ??= JSON.parse(
    readFileSync(new URL('./data/prompt-recipes.json', import.meta.url), 'utf8'),
  ) as { recipes: PromptRecipe[]; byCategory: Record<string, number> };
  return promptCache;
}

interface SceneRecipe {
  slug: string;
  title: string;
  prompt: string;
  settings: Record<string, unknown>;
  refused: string[];
  page: string;
}

let sceneCache: { count: number; slugs: string[]; scenes: SceneRecipe[] } | null = null;
function sceneRecipes(): { count: number; slugs: string[]; scenes: SceneRecipe[] } {
  sceneCache ??= JSON.parse(
    readFileSync(new URL('./data/scene-recipes.json', import.meta.url), 'utf8'),
  ) as { count: number; slugs: string[]; scenes: SceneRecipe[] };
  return sceneCache;
}

function printHelp(): void {
  console.log(`Callirra CLI

Usage:
  callirra <command> [options]

Commands:
  setup-api-key <key>        Save an API key locally
  models                     List available models
  balance                    Show balance and available credits
  whoami                     Show configured key and current balance
  usage [--limit n]          Show recent usage (default 20)
  task <id>                  Show one video task
  cancel <id>                Cancel a queued/running video task
  upload <file>              Upload a reference image
  recipes [--category x]     List the curated prompt library (172 recipes)
    --limit <n>              How many to show (default 20)
  recipe <slug>              Show one recipe: prompt, settings, credits, deep link
  scenes [slug]              Show the six worked Seedance 2.5 scene recipes
  creative [--full]          Show creative knowledge / resource data
  gen image <prompt>         Generate an image
    --model <slug>           Model slug (required)
    --size <size>            Image size (e.g. 1024x1024)
    --n <count>              Number of images (default 1)
    --out <file>             Save output to file
  gen video <prompt>         Generate a video
    --model <slug>           Model slug (required)
    --duration <seconds>     Duration in seconds
    --resolution <res>       Resolution (e.g. 720p)
    --mode <mode>            Mode (e.g. text_to_video, image_to_video)
    --aspect-ratio <value>   Aspect ratio (e.g. 16:9)
    --generate-audio         Generate audio
    --wait                   Wait for completion and download
    --out <file>             Save video to file when using --wait

Environment:
  CALLIRRA_API_KEY            API key (optional if saved with setup-api-key)
  CALLIRRA_API_BASE           Override API base URL (default https://api.callirra.com)
`);
}

function requireModel(options: Record<string, unknown>): string {
  const model = options.model;
  if (typeof model !== 'string' || !model) {
    throw new CliError('--model is required.');
  }
  return model;
}

async function run(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    return;
  }

  const [command, ...rest] = argv;

  if (command === '--version' || command === '-v') {
    console.log(await packageVersion());
    return;
  }

  if (command === 'setup-api-key') {
    const key = rest[0];
    if (!key) throw new CliError(`Usage: callirra setup-api-key <${KEY_PREFIX}...>`);
    const file = await saveApiKey(key);
    console.log(`API key saved to ${file}`);
    return;
  }

  if (command === 'models') {
    const c = await client();
    const { data } = await c.listModels();
    for (const model of data) console.log(`${model.id}\t${model.owned_by}`);
    return;
  }

  if (command === 'balance') {
    const c = await client();
    const balance = await c.getBalance();
    console.log(`credits: ${balance.credits}`);
    console.log(`available: ${balance.available}`);
    return;
  }

  if (command === 'whoami') {
    const c = await client();
    const balance = await c.getBalance();
    console.log('Callirra API key is configured.');
    console.log(`credits: ${balance.credits}`);
    console.log(`available: ${balance.available}`);
    return;
  }

  if (command === 'usage') {
    const c = await client();
    const parsed = parseArgs({ args: rest, options: { limit: { type: 'string' } }, strict: false });
    const limit = Number(parsed.values.limit ?? 20);
    const { data } = await c.getUsage(Number.isFinite(limit) ? limit : 20);
    for (const row of data) {
      console.log(`${row.created_at}\t${row.model}\t${row.category}\t${row.cost_credits} credits\t${row.status}`);
    }
    if (data.length === 0) console.log('No usage found.');
    return;
  }

  if (command === 'task') {
    const id = rest[0];
    if (!id) throw new CliError('Usage: callirra task <id>');
    const c = await client();
    const { job } = await c.getTask(id);
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (command === 'videos' || command === 'list-videos') {
    const c = await client();
    const parsed = parseArgs({ args: rest, options: { limit: { type: 'string' } }, strict: false });
    const limit = Number(parsed.values.limit ?? 20);
    const { data } = await c.listVideos(Number.isFinite(limit) ? limit : 20);
    for (const row of data) console.log(`${row.id}\t${row.status}`);
    if (data.length === 0) console.log('No video jobs found.');
    return;
  }

  if (command === 'cancel') {
    const id = rest[0];
    if (!id) throw new CliError('Usage: callirra cancel <id>');
    const c = await client();
    const { job } = await c.cancelTask(id);
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  /*
   * Recipe commands.
   *
   * These replace `prompt templates` / `prompt enhance`, which called an endpoint that now returns an empty
   * template list. The snapshot below is generated from our own library (172 recipes) and the six worked
   * Seedance 2.5 scenes, and ships inside the package.
   */
  if (command === 'recipes') {
    const parsed = parseArgs({
      args: rest,
      options: { category: { type: 'string' }, scene: { type: 'string' }, limit: { type: 'string' }, json: { type: 'boolean', default: false } },
      strict: false,
    });
    const { recipes, byCategory } = promptRecipes();
    const category = parsed.values.category;
    const scene = parsed.values.scene;
    const limit = Number(parsed.values.limit ?? 20);
    const rows = recipes.filter(
      (r) => (!category || r.category === category) && (!scene || r.scene === scene),
    );
    if (parsed.values.json) {
      console.log(JSON.stringify({ total: rows.length, categories: byCategory, recipes: rows.slice(0, limit) }, null, 2));
      return;
    }
    console.log(`${rows.length} recipe(s)${category ? ` in "${category}"` : ''}${scene ? ` for ${scene}` : ''}`);
    console.log(`categories: ${Object.keys(byCategory).sort().join(', ')}`);
    console.log('');
    for (const r of rows.slice(0, limit)) {
      console.log(`  ${r.slug}`);
      console.log(`    ${r.title} — ${r.category} · ${r.scene} · ${r.credits ?? '?'} credits`);
    }
    if (rows.length > limit) console.log(`\n  … ${rows.length - limit} more (use --limit)`);
    console.log('\n  Show one with:  callirra recipe <slug>');
    return;
  }

  if (command === 'recipe') {
    const slug = rest[0];
    if (!slug) throw new CliError('Usage: callirra recipe <slug>   (list them with: callirra recipes)');
    const { recipes } = promptRecipes();
    const r = recipes.find((x) => x.slug === slug);
    if (!r) throw new CliError(`No recipe "${slug}". Run "callirra recipes" to see the slugs.`);
    console.log(`${r.title}`);
    console.log(`${r.category} · ${r.scene} · ${r.credits ?? '?'} credits`);
    console.log('');
    console.log(r.prompt);
    console.log('');
    console.log(`Settings: ${JSON.stringify(r.config)}`);
    if (r.deepLink) console.log(`Open in the generator: ${r.deepLink}`);
    return;
  }

  if (command === 'scenes') {
    const slug = rest[0];
    const data = sceneRecipes();
    if (!slug) {
      console.log(`${data.count} worked scenes — ${data.slugs.join(', ')}`);
      console.log('');
      for (const s of data.scenes) {
        console.log(`  ${s.slug.padEnd(12)} ${s.title}`);
        console.log(`      ${String(s.settings.modelLabel)} · ${String(s.settings.aspectRatio)} · ${String(s.settings.duration)}s · ${String(s.settings.credits)} credits`);
      }
      console.log('\n  Show one with:  callirra scenes <slug>');
      return;
    }
    const s = data.scenes.find((x) => x.slug === slug);
    if (!s) throw new CliError(`No scene "${slug}". Available: ${data.slugs.join(', ')}`);
    console.log(`${s.title}\n`);
    console.log(s.prompt);
    console.log('');
    console.log(`Settings: ${JSON.stringify(s.settings)}`);
    console.log(`A filtered route refuses: ${s.refused.join(' | ')}`);
    console.log(`Page: ${s.page}`);
    return;
  }

  if (command === 'creative') {
    const c = await client();
    const data = await c.getCreativeKnowledge();
    const parsed = parseArgs({ args: rest, options: { full: { type: 'boolean', default: false } }, strict: false });
    if (parsed.values.full) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    console.log(`version: ${data.version}`);
    console.log(`categories: ${data.categories.length}`);
    console.log(`resources: ${data.resources.length}`);
    console.log(`styles: ${data.styles.length}`);
    return;
  }

  if (command === 'upload') {
    const file = rest[0];
    if (!file) throw new CliError('Usage: callirra upload <file> [--content-type image/png]');
    const parsed = parseArgs({ args: rest.slice(1), options: { 'content-type': { type: 'string' } }, strict: false });
    const c = await client();
    const data = await readFile(resolve(file));
    const result = await c.uploadReferenceFile({
      data,
      contentType: stringOption(parsed.values['content-type']) ?? 'application/octet-stream',
      filename: basename(file),
    });
    console.log(result.url);
    return;
  }

  if (command === 'gen') {
    const sub = rest[0];
    const args = rest.slice(1);
    const c = await client();
    if (sub === 'image') return runImage(c, args);
    if (sub === 'video') return runVideo(c, args);
    throw new CliError('Usage: callirra gen <image|video> <prompt> [options]');
  }

  throw new CliError(`Unknown command: ${command}. Run "callirra --help".`);
}

async function runImage(c: CallirraClient, args: string[]): Promise<void> {
  const promptIndex = args.findIndex((a) => !a.startsWith('-'));
  if (promptIndex === -1) throw new CliError('Image prompt is required.');
  const prompt = args[promptIndex]!;
  const parsed = parseArgs({
    args: args.filter((_, i) => i !== promptIndex),
    options: {
      model: { type: 'string' },
      size: { type: 'string' },
      n: { type: 'string' },
      out: { type: 'string' },
      reference: { type: 'string' },
      'image-input': { type: 'string' },
      'nsfw-checker': { type: 'boolean' },
      'google-search': { type: 'boolean' },
    },
    strict: false,
  });
  const model = requireModel(parsed.values as Record<string, unknown>);
  const n = parsed.values.n ? Number(parsed.values.n) : 1;
  const size = stringOption(parsed.values.size);
  const out = stringOption(parsed.values.out) ? resolve(stringOption(parsed.values.out)!) : undefined;
  const reference = stringOption(parsed.values.reference)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const boolOf = (v: unknown) => (v === undefined ? undefined : v === true || String(v) === 'true');
  const result = await c.generateImage({
    model,
    prompt,
    size,
    n: Number.isFinite(n) && n > 0 ? n : 1,
    image_input: stringOption(parsed.values['image-input']),
    reference_images: reference.length > 0 ? reference : undefined,
    nsfw_checker: boolOf(parsed.values['nsfw-checker']),
    google_search: boolOf(parsed.values['google-search']),
  });
  const images = result.data ?? [];
  const urls = images.map((img) => img.url).filter((v): v is string => Boolean(v));
  const firstB64 = images[0]?.b64_json;
  if (out && firstB64) {
    await c.saveBase64Image(firstB64, out);
    console.log(`Saved image to ${out}`);
    if (urls.length > 0) urls.forEach((url) => console.log(url));
    return;
  }
  if (out && urls[0]) {
    // The live API returns locally-stored signed URLs (no b64) — download it
    // so --out always writes a file as advertised.
    await c.downloadImage(urls[0], out);
    console.log(`Saved image to ${out}`);
    if (urls.length > 1) urls.slice(1).forEach((url) => console.log(url));
    return;
  }
  if (urls.length > 0) {
    urls.forEach((url) => console.log(url));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

async function runVideo(c: CallirraClient, args: string[]): Promise<void> {
  const promptIndex = args.findIndex((a) => !a.startsWith('-'));
  if (promptIndex === -1) throw new CliError('Video prompt is required.');
  const prompt = args[promptIndex]!;
  const parsed = parseArgs({
    args: args.filter((_, i) => i !== promptIndex),
    options: {
      model: { type: 'string' },
      duration: { type: 'string' },
      resolution: { type: 'string' },
      mode: { type: 'string' },
      'aspect-ratio': { type: 'string' },
      'generate-audio': { type: 'boolean', default: false },
      'frame-image': { type: 'string' },
      'input-reference': { type: 'string' },
      'input-images': { type: 'string' },
      'input-videos': { type: 'string' },
      'audio-input': { type: 'string' },
      seed: { type: 'string' },
      'seedance-mode': { type: 'string' },
      'kling-mode': { type: 'string' },
      'minimax-mode': { type: 'string' },
      'camera-fixed': { type: 'boolean' },
      'kling-orientation': { type: 'string' },
      'background-source': { type: 'string' },
      'output-format': { type: 'string' },
      'return-last-frame': { type: 'boolean' },
      'audio-setting': { type: 'string' },
      'nsfw-checker': { type: 'boolean' },
      'google-search': { type: 'boolean' },
      wait: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
    strict: false,
  });
  const model = requireModel(parsed.values as Record<string, unknown>);
  const duration = parsed.values.duration ? Number(parsed.values.duration) : undefined;
  const resolution = stringOption(parsed.values.resolution);
  const mode = stringOption(parsed.values.mode);
  const aspectRatio = stringOption(parsed.values['aspect-ratio']);
  const frameImages = stringOption(parsed.values['frame-image'])?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const inputReferences = stringOption(parsed.values['input-reference'])?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const inputImages = stringOption(parsed.values['input-images'])?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const inputVideos = stringOption(parsed.values['input-videos'])?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const audioInput = stringOption(parsed.values['audio-input'])?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const seed = parsed.values.seed ? Number(parsed.values.seed) : undefined;
  const boolOf = (v: unknown) => (v === undefined ? undefined : v === true || String(v) === 'true');
  const { job } = await c.createVideo({
    model,
    prompt,
    duration: duration && Number.isFinite(duration) ? duration : undefined,
    resolution,
    mode,
    aspect_ratio: aspectRatio,
    generate_audio: parsed.values['generate-audio'] === true,
    frame_images: frameImages.length > 0 ? frameImages : undefined,
    input_references: inputReferences.length > 0 ? inputReferences : undefined,
    input_images: inputImages.length > 0 ? inputImages : undefined,
    input_videos: inputVideos.length > 0 ? inputVideos : undefined,
    audio_input: audioInput.length > 0 ? audioInput : undefined,
    seed: seed && Number.isFinite(seed) ? seed : undefined,
    seedance_mode: stringOption(parsed.values['seedance-mode']),
    kling_mode: stringOption(parsed.values['kling-mode']),
    minimax_h3_mode: stringOption(parsed.values['minimax-mode']),
    camera_fixed: boolOf(parsed.values['camera-fixed']),
    kling_orientation: stringOption(parsed.values['kling-orientation']),
    background_source: stringOption(parsed.values['background-source']),
    output_format: stringOption(parsed.values['output-format']),
    return_last_frame: boolOf(parsed.values['return-last-frame']),
    audio_setting: stringOption(parsed.values['audio-setting']),
    nsfw_checker: boolOf(parsed.values['nsfw-checker']),
    google_search: boolOf(parsed.values['google-search']),
  });
  console.log(`Job created: ${job.id} (${job.status})`);

  if (parsed.values.wait) {
    const final = await c.waitForTask(job.id);
    if (final.status !== 'completed') {
      console.error(`Task ${final.status}: ${final.error_message ?? 'no output'}`);
      process.exitCode = 1;
      return;
    }
    const outValue = stringOption(parsed.values.out);
    const out = outValue ? resolve(outValue) : `${basename(job.id)}.mp4`;
    await c.downloadVideo(job.id, out);
    console.log(`Saved video to ${out}`);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    await run(argv);
  } catch (err) {
    printError(err);
    process.exitCode = 1;
  }
}
