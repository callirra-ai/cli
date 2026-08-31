# @callirra/cli

Official Callirra CLI — generate images and videos, use Prompt Studio templates, check balance and manage tasks from your terminal.

## Requirements

- Node.js 22+
- A Callirra API key (`sk-cal-...`)

## Install

```bash
npm install -g @callirra/cli
# or
pnpm add -g @callirra/cli
```

Get an API key at [callirra.com](https://callirra.com?utm_source=github-cli), then save it once:

```bash
callirra setup-api-key sk-cal-xxxxxxxxxxxxxxxx
```

## Quick start

```bash
callirra models
callirra gen image "A cinematic product hero shot" --model nano-banana --out hero.png
callirra gen video "A drone shot over mountains" --model seedance-2.5 --duration 10 --wait --out clip.mp4
```

## Commands

```bash
# Account
callirra setup-api-key <key>       # Save API key locally
callirra whoami                    # Show key status + balance
callirra balance                   # Show balance and available credits
callirra usage --limit 10          # Show recent usage

# Models / media
callirra models                    # List available models
callirra gen image <prompt>        # Generate an image
callirra gen video <prompt>        # Create a video task
callirra task <id>                 # Show task status
callirra cancel <id>               # Cancel a task

# Prompt Studio / knowledge
callirra prompt templates          # List built-in templates
callirra prompt enhance <id> <text> [--kind video|image] [--language zh|en]
callirra creative [--full]         # Show creative knowledge summary or full JSON
callirra upload ./frame.png --content-type image/png  # Upload reference image
```

### `gen image`

```bash
callirra gen image "A cinematic product hero shot" \
  --model nano-banana \
  --size 1024x1024 \
  --out hero.png
```

Options: `--model`, `--size`, `--n`, `--out`, `--reference <url1,url2>`, `--image-input <url>`.

### `gen video`

```bash
callirra gen video "A drone shot over mountains" \
  --model seedance-2.5 \
  --duration 10 \
  --resolution 720p \
  --mode text_to_video \
  --generate-audio \
  --wait \
  --out clip.mp4
```

Options: `--model`, `--duration`, `--resolution`, `--mode`, `--aspect-ratio`, `--generate-audio`, `--frame-image <url1,url2>`, `--input-reference <url1,url2>`, `--wait`, `--out`.

## Configuration

| Variable | Default |
|---|---|
| `CALLIRRA_API_KEY` | Required unless key is saved |
| `CALLIRRA_API_BASE` | `https://api.callirra.com` |

Saved key location: `~/.config/callirra/api_key`.

## License

MIT. Source: [github.com/callirra-ai/cli](https://github.com/callirra-ai/cli?utm_source=github-cli)

---

→ Start free at [callirra.com](https://callirra.com?utm_source=github-cli)
