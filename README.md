# VoxPilot — Voice to Code

[![Open VSX](https://img.shields.io/open-vsx/v/natearcher-ai/voxpilot?label=Open%20VSX&color=purple)](https://open-vsx.org/extension/natearcher-ai/voxpilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/natearcher-ai/voxpilot?style=social)](https://github.com/natearcher-ai/voxpilot)

Talk to your IDE coding assistant with your voice. On-device speech recognition. No API keys. No cloud. Just your voice.

> "Hey Copilot, refactor this function to use async/await" — spoken, not typed.

## Why VoxPilot?

Every coding assistant requires typing. But sometimes your hands are busy, you have RSI, or you just think faster than you type. VoxPilot bridges voice and code by transcribing your speech and sending it directly to your IDE's chat assistant.

- **100% on-device** — Your audio never leaves your machine. Zero network calls.
- **Works with any chat participant** — GitHub Copilot, Continue, Kiro, Cody, or any VS Code chat extension.
- **Tiny models** — 27MB (Tiny) or 65MB (Base). Downloads once, runs forever.
- **Cross-platform** — Linux, macOS, Windows.
- **Open source** — MIT licensed. Fork it, extend it, ship it.

## Demo

```
[Ctrl+Alt+V] → 🎙️ "Create a REST API endpoint for user authentication using JWT"
              → 📝 Transcribed and sent to Copilot Chat
              → 💻 Copilot generates the code
```

## Quick Start

1. Install from [Open VSX](https://open-vsx.org/extension/natearcher-ai/voxpilot)
2. Press `Ctrl+Alt+V` (`Cmd+Alt+V` on Mac)
3. Speak your prompt
4. VoxPilot transcribes and sends it to your coding assistant

First run downloads the ASR model (~27MB). Takes about 10 seconds.

## Audio Requirements

| Platform | Tool | Install |
|----------|------|---------|
| Linux | `arecord` | `sudo apt install alsa-utils` |
| macOS | `sox` | `brew install sox` |
| Windows | `ffmpeg` | [ffmpeg.org](https://ffmpeg.org) |

VoxPilot checks on activation and tells you if something's missing.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| Toggle Voice Input | `Ctrl+Alt+V` | Start/stop continuous listening |
| Quick Voice Capture | — | Listen → transcribe → stop |
| Select ASR Model | — | Switch Tiny ↔ Base |
| Send Last Transcript | — | Re-send last transcript to chat |
| Clear Cache | — | Free disk space by removing downloaded models |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `voxpilot.model` | `moonshine-tiny` | `moonshine-tiny` (fast) or `moonshine-base` (accurate) |
| `voxpilot.vadSensitivity` | `0.5` | Voice detection threshold (lower = more sensitive) |
| `voxpilot.autoSendToChat` | `false` | Auto-send transcripts to chat |
| `voxpilot.targetChatParticipant` | `""` | Target participant (e.g. `github.copilot`) |
| `voxpilot.silenceTimeout` | `1500` | Silence before finalizing (ms) |

## How It Works

```
Microphone → PCM Audio → Voice Activity Detection → Moonshine ASR (ONNX) → Text → VS Code Chat
```

1. Native audio capture via CLI tools (arecord/sox/ffmpeg)
2. Energy-based VAD detects speech start/stop
3. Moonshine ONNX models transcribe locally via ONNX Runtime
4. Three-tier delivery: VS Code Chat API → clipboard paste → direct input

## Models

[Moonshine](https://github.com/moonshine-ai/moonshine) by Useful Sensors (MIT licensed), served as ONNX via [onnx-community](https://huggingface.co/onnx-community):

| Model | Size | Speed | Use case |
|-------|------|-------|----------|
| Moonshine Tiny | ~27MB | Fast | Quick commands, short prompts |
| Moonshine Base | ~65MB | Moderate | Longer dictation, complex prompts |

Models download on first use and cache in VS Code's global storage.

## Use Cases

- **Hands-free coding** — RSI, carpal tunnel, or just prefer talking
- **Pair programming** — Speak to your AI assistant while reading code
- **Quick prompts** — Faster than typing "refactor this to use dependency injection"
- **Accessibility** — Voice input for developers with mobility limitations
- **Mobile workflows** — When you're on a laptop without a great keyboard

## Privacy

All processing happens on your device. No telemetry. No analytics. No network calls. Your voice data is never stored or transmitted.

## Contributing

PRs welcome. The codebase is small and straightforward:

```
src/
├── extension.ts      — Entry point, command registration
├── engine.ts         — Core orchestration (listen → transcribe → deliver)
├── transcriber.ts    — Moonshine ONNX inference
├── modelManager.ts   — Model download and caching
├── audioCapture.ts   — Platform-specific mic capture
├── vad.ts            — Voice activity detection
└── statusBar.ts      — Status bar UI
```

```bash
git clone https://github.com/natearcher-ai/voxpilot
cd voxpilot
npm install
npm run build
```

## License

MIT — see [LICENSE](LICENSE).

## Credits

- ASR models by [Moonshine AI](https://moonshine.ai) (MIT License)
- ONNX conversions by [onnx-community](https://huggingface.co/onnx-community)
- Built by [natearcher-ai](https://github.com/natearcher-ai)

---

**Star the repo** if VoxPilot helps you code faster. It helps others find it. ⭐
