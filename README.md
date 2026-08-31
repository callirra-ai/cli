# @callirra/cli

Callirra CLI — generate images and videos, check balance and manage tasks from your terminal.

## Install

```bash
npm install -g @callirra/cli
# or
pnpm add -g @callirra/cli
```

## Quick start

```bash
# Save your key once
callirra setup-api-key sk-cal-xxxxxxxxxxxxxxxx

# List models
callirra models

# Generate an image
callirra gen image "A cinematic product hero shot" --model nano-banana --out hero.png

# Create a video and wait for it to finish
callirra gen video "A drone shot over mountains" --model seedance-2.5 --duration 10 --wait --out clip.mp4

# Prompt Studio templates and creative knowledge
callirra prompt templates
callirra prompt enhance cinematic-city "Rainy Tokyo street" --kind video
callirra creative

# Check balance / usage
callirra balance
callirra usage --limit 10

# Inspect or cancel a task
callirra task <job-id>
callirra cancel <job-id>
```

## Configuration

- API key: `CALLIRRA_API_KEY` or saved with `callirra setup-api-key <key>`
- API base: `CALLIRRA_API_BASE` (default `https://api.callirra.com`)

## Development

```bash
pnpm --filter @callirra/cli build
pnpm --filter @callirra/cli typecheck
```

---

→ Start free at [callirra.com](https://callirra.com?utm_source=github-cli)
