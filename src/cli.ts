/* eslint-disable no-console */
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { CallirraClient, KEY_PREFIX } from './client.js';
import { CliError, resolveApiKey, saveApiKey } from './config.js';

let activeClient: CallirraClient | null = null;

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
  prompt templates           List Prompt Studio templates
  prompt enhance <id> <text> Enhance a prompt with a built-in template
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
    console.log('0.1.0');
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

  if (command === 'cancel') {
    const id = rest[0];
    if (!id) throw new CliError('Usage: callirra cancel <id>');
    const c = await client();
    const { job } = await c.cancelTask(id);
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  if (command === 'prompt') {
    const c = await client();
    const sub = rest[0];
    if (sub === 'templates') {
      const { templates } = await c.listPromptTemplates();
      for (const t of templates) console.log(`${t.id}\t${t.name}\t${t.tagline}`);
      return;
    }
    if (sub === 'enhance') {
      const templateId = rest[1];
      const idea = rest[2];
      if (!templateId || !idea) throw new CliError('Usage: callirra prompt enhance <templateId> "<idea>" [--kind video|image] [--language zh|en]');
      const parsed = parseArgs({
        args: rest.slice(3),
        options: { kind: { type: 'string' }, language: { type: 'string' } },
        strict: false,
      });
      const result = await c.enhancePrompt({
        templateId,
        idea,
        kind: parsed.values.kind === 'video' || parsed.values.kind === 'image' ? parsed.values.kind : undefined,
        language: parsed.values.language === 'zh' || parsed.values.language === 'en' ? parsed.values.language : undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    throw new CliError('Usage: callirra prompt <templates|enhance>');
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
    const data = await readFile(resolve(file), 'base64');
    const result = await c.uploadReference({
      data,
      content_type: stringOption(parsed.values['content-type']) ?? 'image/png',
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
    },
    strict: false,
  });
  const model = requireModel(parsed.values as Record<string, unknown>);
  const n = parsed.values.n ? Number(parsed.values.n) : 1;
  const size = stringOption(parsed.values.size);
  const out = stringOption(parsed.values.out) ? resolve(stringOption(parsed.values.out)!) : undefined;
  const reference = stringOption(parsed.values.reference)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const result = await c.generateImage({
    model,
    prompt,
    size,
    n: Number.isFinite(n) && n > 0 ? n : 1,
    image_input: stringOption(parsed.values['image-input']),
    reference_images: reference.length > 0 ? reference : undefined,
  });
  const images = result.data ?? [];
  const urls = images.map((img) => img.url).filter((v): v is string => Boolean(v));
  const firstB64 = images[0]?.b64_json;
  if (firstB64 && out) {
    await c.saveBase64Image(firstB64, out);
    console.log(`Saved image to ${out}`);
    if (urls.length > 0) urls.forEach((url) => console.log(url));
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
