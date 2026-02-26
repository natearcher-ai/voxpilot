# VoxPilot — Voice to Code

Talk to your IDE coding assistant with your voice. On-device speech recognition, no API keys, no cloud dependency.

## Features

- **On-device ASR** — Powered by Moonshine ONNX models. Your audio never leaves your machine.
- **Works with any chat participant** — Copilot, Continue, Kiro, or any VS Code chat extension.
- **Voice Activity Detection** — Automatically detects when you start and stop speaking.
- **Quick Capture mode** — Toggle on, speak, auto-sends on silence and stops.
- **Multiple actions** — Send to chat, insert at cursor, or copy to clipboard.
- **Tiny footprint** — The smallest model is just ~27MB.

## Quick Start

1. Install VoxPilot from the marketplace
2. Press `Ctrl+Alt+V` (`Cmd+Option+V` on Mac) to start listening
3. Speak your prompt
4. VoxPilot transcribes and sends it to your coding assistant

On first use, VoxPilot downloads the ASR model (~27MB for Tiny, ~65MB for Base).

## Requirements

One of these audio capture tools must be available on your system:

| Platform | Tool | Install |
|----------|------|---------|
| Linux | `arecord` | `sudo apt install alsa-utils` |
| macOS | `sox` | `brew install sox` |
| Windows | `ffmpeg` | [ffmpeg.org](https://ffmpeg.org) (add to PATH) |

VoxPilot checks for these on activation and warns you if none are found.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `VoxPilot: Toggle Voice Input` | `Ctrl+Alt+V` | Start/stop continuous listening |
| `VoxPilot: Quick Voice Capture` | — | Listen, transcribe on silence, then stop |
| `VoxPilot: Select ASR Model` | — | Switch between Tiny and Base models |
| `VoxPilot: Send Last Transcript to Chat` | — | Re-send the last transcript |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `voxpilot.model` | `moonshine-tiny` | ASR model (`moonshine-tiny` or `moonshine-base`) |
| `voxpilot.vadSensitivity` | `0.5` | VAD threshold (lower = more sensitive) |
| `voxpilot.autoSendToChat` | `false` | Auto-send transcripts to chat |
| `voxpilot.targetChatParticipant` | `""` | Chat participant to target (e.g. `github.copilot`) |
| `voxpilot.silenceTimeout` | `1500` | Silence duration (ms) before finalizing |

## How It Works

1. **Audio Capture** — Records from your microphone via native CLI tools
2. **Voice Activity Detection** — Energy-based VAD detects speech boundaries
3. **Transcription** — Moonshine ONNX models run locally via ONNX Runtime
4. **Delivery** — Transcript is sent to VS Code's chat input, inserted at cursor, or copied

## Models

VoxPilot uses [Moonshine](https://github.com/moonshine-ai/moonshine) ASR models (MIT licensed), served via [onnx-community](https://huggingface.co/onnx-community) ONNX conversions:

- **Moonshine Tiny** (~27MB) — Fast, good for quick commands
- **Moonshine Base** (~65MB) — More accurate, better for longer dictation

Models are downloaded on first use and cached in VS Code's global storage.

## Privacy

All processing happens on your device. No audio or transcripts are sent anywhere.

## License

MIT — see [LICENSE](LICENSE).

## Credits

- ASR models by [Moonshine AI](https://moonshine.ai) (MIT License)
- ONNX conversions by [onnx-community](https://huggingface.co/onnx-community)
- Built by [natearcher-ai](https://github.com/natearcher-ai)
