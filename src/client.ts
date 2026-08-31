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
      }),
    });
  }

  createVideo(input: {
    model: string;
    prompt: string;
    duration?: number | undefined;
    resolution?: string | undefined;
    mode?: string | undefined;
    aspect_ratio?: string | undefined;
    generate_audio?: boolean | undefined;
    frame_images?: string[] | undefined;
    input_references?: string[] | undefined;
  }): Promise<{ job: { id: string; status: string; credits_reserved?: string | null; content_url?: string | null; error_message?: string | null } }> {
    return this.request('/v1/videos', {
      method: 'POST',
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        ...(input.duration ? { duration_seconds: input.duration } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
        ...(input.generate_audio !== undefined ? { generate_audio: input.generate_audio } : {}),
        ...(input.frame_images && input.frame_images.length > 0 ? { frame_images: input.frame_images } : {}),
        ...(input.input_references && input.input_references.length > 0 ? { input_references: input.input_references } : {}),
      }),
    });
  }

  getTask(id: string): Promise<{ job: { id: string; status: string; content_url?: string | null; error_message?: string | null } }> {
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
}
