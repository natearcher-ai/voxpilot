# VoxPilot — Voice to Code

[![CI](https://github.com/natearcher-ai/voxpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/natearcher-ai/voxpilot/actions/workflows/ci.yml)
[![Open VSX](https://img.shields.io/open-vsx/v/natearcher-ai/voxpilot?label=Open%20VSX&color=purple)](https://open-vsx.org/extension/natearcher-ai/voxpilot)
[![Downloads](https://img.shields.io/open-vsx/dt/natearcher-ai/voxpilot?color=blue)](https://open-vsx.org/extension/natearcher-ai/voxpilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/natearcher-ai/voxpilot?style=social)](https://github.com/natearcher-ai/voxpilot)

Talk to your IDE coding assistant with your voice. On-device speech recognition with multiple model options. No API keys. No cloud. Just your voice.

> "Hey Copilot, refactor this function to use async/await" — spoken, not typed.

## Why VoxPilot?

Every coding assistant requires typing. But sometimes your hands are busy, you have RSI, or you just think faster than you type. VoxPilot bridges voice and code by transcribing your speech and delivering it wherever you need — chat, cursor, or clipboard.

- **100% on-device** — Your audio never leaves your machine. Zero network calls.
- **3 model families** — Moonshine (fast), Whisper (90+ languages), Parakeet (streaming).
- **Works with any chat participant** — GitHub Copilot, Continue, Kiro, Cody, or any VS Code chat extension.
- **Real-time feedback** — Live partial transcripts as you speak, status bar states, audio waveform.
- **Smart text processing** — Auto-capitalize, auto-punctuate, voice commands, noise gate.
- **Flexible output** — Send to chat, insert at cursor, copy to clipboard, or choose each time.
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
4. VoxPilot transcribes and delivers it

First run downloads the ASR model. Takes about 10 seconds depending on model size.

## Audio Requirements

| Platform | Tool | Install |
|----------|------|---------|
| Linux | `arecord` | `sudo apt install alsa-utils` |
| macOS | `sox` | `brew install sox` |
| Windows | `ffmpeg` | [ffmpeg.org](https://ffmpeg.org) |

VoxPilot checks on activation and tells you if something's missing.

## Models

VoxPilot supports three model families. Use the **Model Manager** in the activity bar to browse, download, switch, and delete models.

### Moonshine (Useful Sensors)
Fast, lightweight, English-focused. Great for quick commands.

| Model | Size | Speed | Use case |
|-------|------|-------|----------|
| Moonshine Tiny | ~27MB | Fastest | Quick commands, short prompts |
| Moonshine Base | ~65MB | Fast | Longer dictation, better accuracy |

### Whisper (OpenAI)
Multi-language support with 90+ languages. Best for non-English or mixed-language use.

| Model | Size | Languages | Use case |
|-------|------|-----------|----------|
| Whisper Tiny | ~75MB | 90+ | Fast multi-language |
| Whisper Base | ~150MB | 90+ | Balanced accuracy |
| Whisper Small | ~500MB | 90+ | High accuracy |
| Whisper Medium | ~1.5GB | 90+ | Near-best accuracy |
| Whisper Large v3 Turbo | ~3GB | 90+ | Best accuracy |

### Parakeet (NVIDIA)
Streaming transcription with real-time partial results. See text appear as you speak.

| Model | Size | Speed | Use case |
|-------|------|-------|----------|
| Parakeet TDT 0.6B | ~150MB | Real-time | Live captions, streaming dictation |

All models download on first use and cache locally. Manage them from the Model Manager panel.

## Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| Toggle Voice Input | `Ctrl+Alt+V` | Start/stop continuous listening |
| Quick Voice Capture | `Ctrl+Alt+Q` | Listen → transcribe → stop (one-shot) |
| Inline Voice Input | `Ctrl+Alt+I` | Speak and insert text at cursor |
| Select Audio Device | — | Choose your microphone |
| Transcript History | — | Browse and re-send last 10 transcripts |
| Select ASR Model | — | Quick-switch between models |
| Send Last Transcript | — | Re-send last transcript to chat |
| Clear Cache | — | Free disk space by removing downloaded models |

## Voice Commands

Speak these during dictation for hands-free formatting:

| Say | Result |
|-----|--------|
| "period" | Inserts `.` |
| "comma" | Inserts `,` |
| "new line" | Inserts line break |
| "delete that" | Removes last transcript |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `voxpilot.model` | `moonshine-base` | ASR model to use |
| `voxpilot.outputAction` | `ask` | What to do with transcripts: `ask`, `chat`, `cursor`, `clipboard` |
| `voxpilot.vadSensitivity` | `0.5` | Voice detection threshold (lower = more sensitive) |
| `voxpilot.autoCapitalize` | `true` | Auto-capitalize first word of transcripts |
| `voxpilot.soundFeedback` | `true` | Play beep on start/stop listening |
| `voxpilot.noiseGateThreshold` | `0` | RMS threshold to filter background noise (0 = off, try 0.005–0.02) |
| `voxpilot.maxSpeechDuration` | `15` | Max seconds before auto-transcribing (5–60) |
| `voxpilot.silenceTimeout` | `1500` | Silence before finalizing a segment (ms) |
| `voxpilot.autoSendToChat` | `false` | Legacy: auto-send to chat (use `outputAction` instead) |
| `voxpilot.targetChatParticipant` | `""` | Target participant (e.g. `github.copilot`) |
| `voxpilot.audioDevice` | `""` | Audio input device ID (empty = system default) |
| `voxpilot.inlineMode` | `false` | Insert at cursor by default (use `outputAction` instead) |

## Features

### Smart Text Processing
- **Auto-capitalize** — First word of every transcript is capitalized
- **Auto-punctuation** — Sentence-end periods added based on speech pause patterns
- **Multi-segment stitching** — Long dictation auto-splits and stitches seamlessly
- **Voice commands** — Hands-free punctuation and formatting

### Adaptive Voice Detection
- **Noise-floor calibration** — Automatically adapts to your environment
- **Noise gate** — Filters constant background noise (fans, hum)
- **Configurable sensitivity** — Tune for quiet rooms or noisy environments

### Real-Time Feedback
- **Live status bar** — Shows state: calibrating → listening → speaking → transcribing → sent
- **Partial transcript overlay** — See text appear in your editor as you speak (Parakeet)
- **Sound feedback** — Subtle beeps when listening starts/stops

### Flexible Output
- **Chat** — Send directly to any VS Code chat participant
- **Cursor** — Insert at current cursor position in the editor
- **Clipboard** — Copy to clipboard for pasting anywhere
- **Ask** — Choose each time via notification

### IDE Support
- **VS Code** — Full support
- **Kiro** — Full support (auto-detected, uses Kiro chat API)

## How It Works

```
Microphone → PCM Audio → Noise Gate → Voice Activity Detection → ASR Model (ONNX) → Post-Processing → Delivery
```

1. Native audio capture via CLI tools (arecord/sox/ffmpeg)
2. Noise gate filters constant background noise
3. Adaptive VAD with noise-floor calibration detects speech
4. On-device ASR model transcribes via ONNX Runtime
5. Post-processing: capitalize, punctuate, voice commands
6. Delivery to chat, cursor, or clipboard

## Privacy

All processing happens on your device. No telemetry. No analytics. No network calls (except one-time model download from HuggingFace). Your voice data is never stored or transmitted.

## Contributing

PRs welcome. 63 tests, CI/CD pipeline, clean architecture:

```
src/
├── extension.ts         — Entry point, command registration
├── engine.ts            — Core orchestration (listen → transcribe → deliver)
├── transcriber.ts       — Multi-model ASR inference (Moonshine, Whisper, Parakeet)
├── modelManager.ts      — Model download and caching
├── modelManagerPanel.ts — Sidebar UI for model management
├── audioCapture.ts      — Platform-specific mic capture
├── vad.ts               — Adaptive voice activity detection
├── voiceCommands.ts     — Voice command processing
├── noiseGate.ts         — Background noise filtering
├── autoPunctuation.ts   — Smart capitalization and punctuation
├── statusBar.ts         — Status bar UI
└── history.ts           — Transcript history
```

```bash
git clone https://github.com/natearcher-ai/voxpilot
cd voxpilot
npm install
npm test        # 63 tests via Vitest
npm run build   # esbuild bundle
```

## License

MIT — see [LICENSE](LICENSE).

## Credits

- [Moonshine AI](https://moonshine.ai) — Moonshine ASR models (MIT)
- [OpenAI](https://github.com/openai/whisper) — Whisper models
- [NVIDIA NeMo](https://github.com/NVIDIA/NeMo) — Parakeet models
- [ONNX Community](https://huggingface.co/onnx-community) — ONNX model conversions
- Built by [natearcher-ai](https://github.com/natearcher-ai)

---

🌐 [Landing Page](https://natearcher-ai.github.io/voxpilot/) · 📦 [Open VSX](https://open-vsx.org/extension/natearcher-ai/voxpilot) · 📋 [Changelog](CHANGELOG.md)

**Star the repo** if VoxPilot helps you code faster. It helps others find it. ⭐
