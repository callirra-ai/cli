import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_API_BASE = 'https://api.callirra.com';
export const KEY_PREFIX = 'sk-cal-';

export class CallirraClient {
  readonly apiKey: string;
  readonly apiBase: string;

  constructor(options: { apiKey: string; apiBase?: string | undefined }) {
    this.apiKey = options.apiKey;
    this.apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  }

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.apiBase}${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const message =
        (json as { error?: { message?: string; code?: string } } | null)?.error?.message ??
        `Request failed (${res.status})`;
      throw new Error(message);
    }
    return json as T;
  }

  listModels(): Promise<{ data: Array<{ id: string; object: string; owned_by: string }> }> {
    return this.request('/v1/models');
  }

  getBalance(): Promise<{ credits: string; available: string }> {
    return this.request('/v1/balance');
  }

  getUsage(limit = 20): Promise<{
    data: Array<{
      request_id: string | null;
      model: string;
      category: string;
      input_tokens: number;
      output_tokens: number;
      units: number;
      cost_credits: string;
      status: number;
      created_at: string;
    }>;
  }> {
    return this.request(`/v1/usage?limit=${limit}`);
  }

  generateImage(input: {
    model: string;
    prompt: string;
    n?: number | undefined;
    size?: string | undefined;
    image_input?: string | undefined;
    reference_images?: string[] | undefined;
    nsfw_checker?: boolean | undefined;
    google_search?: boolean | undefined;
  }): Promise<{ data?: Array<{ url?: string; b64_json?: string }> }> {
    return this.request('/v1/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        ...(input.n ? { n: input.n } : {}),
        ...(input.size ? { size: input.size } : {}),
        ...(input.image_input ? { image_input: input.image_input } : {}),
        ...(input.reference_images && input.reference_images.length > 0 ? { reference_images: input.reference_images } : {}),
        ...(typeof input.nsfw_checker === 'boolean' ? { nsfw_checker: input.nsfw_checker } : {}),
        ...(typeof input.google_search === 'boolean' ? { google_search: input.google_search } : {}),
      }),
    });
  }

  createVideo(input: {
    model: string;
    prompt: string;
    mode?: string | undefined;
    resolution?: string | undefined;
    duration?: number | undefined;
    aspect_ratio?: string | undefined;
    generate_audio?: boolean | undefined;
    frame_images?: string[] | undefined;
    input_references?: string[] | undefined;
    input_images?: string[] | undefined;
    input_videos?: string[] | undefined;
    audio_input?: string[] | undefined;
    seed?: number | undefined;
    seedance_mode?: string | undefined;
    kling_mode?: string | undefined;
    minimax_h3_mode?: string | undefined;
    camera_fixed?: boolean | undefined;
    kling_orientation?: string | undefined;
    background_source?: string | undefined;
    output_format?: string | undefined;
    return_last_frame?: boolean | undefined;
    audio_setting?: string | undefined;
    nsfw_checker?: boolean | undefined;
    google_search?: boolean | undefined;
  }): Promise<{ job: { id: string; status: string; credits_reserved?: string | null; content_url?: string | null; extra_media?: Array<{ url: string; kind: string }> | null; error_message?: string | null } }> {
    return this.request('/v1/videos', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.duration ? { duration_seconds: input.duration } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
        ...(typeof input.generate_audio === 'boolean' ? { generate_audio: input.generate_audio } : {}),
        ...(input.frame_images && input.frame_images.length > 0 ? { frame_images: input.frame_images } : {}),
        ...(input.input_references && input.input_references.length > 0 ? { input_references: input.input_references } : {}),
        ...(input.input_images && input.input_images.length > 0 ? { input_images: input.input_images } : {}),
        ...(input.input_videos && input.input_videos.length > 0 ? { input_videos: input.input_videos } : {}),
        ...(input.audio_input && input.audio_input.length > 0 ? { audio_input: input.audio_input } : {}),
        ...(typeof input.seed === 'number' ? { seed: input.seed } : {}),
        ...(input.seedance_mode ? { seedance_mode: input.seedance_mode } : {}),
        ...(input.kling_mode ? { kling_mode: input.kling_mode } : {}),
        ...(input.minimax_h3_mode ? { minimax_h3_mode: input.minimax_h3_mode } : {}),
        ...(typeof input.camera_fixed === 'boolean' ? { camera_fixed: input.camera_fixed } : {}),
        ...(input.kling_orientation ? { kling_orientation: input.kling_orientation } : {}),
        ...(input.background_source ? { background_source: input.background_source } : {}),
        ...(input.output_format ? { output_format: input.output_format } : {}),
        ...(typeof input.return_last_frame === 'boolean' ? { return_last_frame: input.return_last_frame } : {}),
        ...(input.audio_setting ? { audio_setting: input.audio_setting } : {}),
        ...(typeof input.nsfw_checker === 'boolean' ? { nsfw_checker: input.nsfw_checker } : {}),
        ...(typeof input.google_search === 'boolean' ? { google_search: input.google_search } : {}),
      }),
    });
  }

  listVideos(limit = 20): Promise<{ object: string; data: Array<{ id: string; status: string }> }> {
    return this.request(`/v1/videos?limit=${limit}`);
  }

  getTask(id: string): Promise<{ job: { id: string; status: string; content_url?: string | null; extra_media?: Array<{ url: string; kind: string }> | null; error_message?: string | null } }> {
    return this.request(`/v1/videos/${encodeURIComponent(id)}`);
  }

  cancelTask(id: string): Promise<{ job: { id: string; status: string } }> {
    return this.request(`/v1/videos/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  }

  uploadReference(input: {
    data: string;
    content_type?: string | undefined;
    filename?: string | undefined;
  }): Promise<{ id: string; url: string; content_type: string }> {
    return this.request('/v1/media/references', {
      method: 'POST',
      body: JSON.stringify({
        data: input.data,
        ...(input.content_type ? { content_type: input.content_type } : {}),
        ...(input.filename ? { filename: input.filename } : {}),
      }),
    });
  }

  /** Upload a file via multipart (supports up to 100MB video / 15MB audio / 20MB image). */
  async uploadReferenceFile(input: { data: Buffer; filename: string; contentType?: string | undefined }): Promise<{ id: string; url: string; content_type: string; owner?: string }> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.data)], { type: input.contentType ?? 'application/octet-stream' }), input.filename);
    const res = await fetch(`${this.apiBase}/v1/media/references/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error((json as { error?: { message?: string } } | null)?.error?.message ?? `Upload failed (${res.status})`);
    }
    return json as { id: string; url: string; content_type: string; owner?: string };
  }

  listPromptTemplates(): Promise<{ templates: Array<{ id: string; name: string; tagline: string; kind: string; icon: string; goal: string; recommendedModels?: string[] }> }> {
    return this.request('/api/v1/prompts/templates');
  }

  enhancePrompt(input: {
    templateId: string;
    idea: string;
    kind?: 'video' | 'image' | undefined;
    language?: 'zh' | 'en' | undefined;
  }): Promise<{
    template: { id: string; name: string; tagline: string; kind: string };
    result: {
      prompt: string;
      negative_prompt: string;
      style: string;
      camera: string;
      lighting: string;
      recommended_model: string;
      duration_seconds: number;
      aspect_ratio: string;
      source: 'llm' | 'fallback';
    };
  }> {
    return this.request('/v1/prompts/enhance', {
      method: 'POST',
      body: JSON.stringify({
        templateId: input.templateId,
        idea: input.idea,
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.language ? { language: input.language } : {}),
      }),
    });
  }

  getCreativeKnowledge(): Promise<{
    version: string;
    categories: Array<{ id: string; title: string; emoji: string }>;
    resources: Array<{ id: string; name: string; description: string; url: string; tags: string[] }>;
    styles: Array<{ name: string; description: string }>;
    craft: Record<string, string[]>;
  }> {
    return this.request('/api/v1/creative');
  }

  async waitForTask(id: string, intervalMs = 5000, timeoutMs = 900_000): Promise<{ id: string; status: string; content_url?: string | null; error_message?: string | null }> {
    const started = Date.now();
    for (;;) {
      const { job } = await this.getTask(id);
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'expired') {
        return job;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Task ${id} timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async downloadVideo(id: string, outPath: string): Promise<void> {
    const res = await fetch(`${this.apiBase}/v1/videos/${encodeURIComponent(id)}/content`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to download video (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);
  }

  async saveBase64Image(data: string, outPath: string): Promise<void> {
    const buffer = Buffer.from(data, 'base64');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);
  }

  /** Download a remote image (signed URL) to a local path. */
  async downloadImage(url: string, outPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download image (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, buffer);
  }
}
