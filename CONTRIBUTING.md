# Contributing to VoxPilot

Thanks for your interest in contributing! VoxPilot is a small, focused project and PRs are welcome.

## Getting Started

```bash
git clone https://github.com/natearcher-ai/voxpilot
cd voxpilot
npm install
npm run build
```

## Development

- `npm run build` — Build with esbuild
- `npm run watch` — Watch mode for development
- Press F5 in VS Code to launch the Extension Development Host

## Project Structure

```
src/
├── extension.ts              — Entry point, command registration
├── engine.ts                 — Core orchestration (listen → transcribe → deliver)
├── transcriber.ts            — Moonshine/Whisper/Parakeet inference
├── modelManager.ts           — Model download, caching, and selection
├── modelManagerPanel.ts      — Sidebar tree view for model management
├── audioCapture.ts           — Platform-specific mic capture (sox/arecord/ffmpeg)
├── vad.ts                    — Voice activity detection
├── noiseGate.ts              — Ambient noise calibration and gating
├── statusBar.ts              — Status bar UI with waveform display
├── waveformVisualizer.ts     — Real-time audio level visualization
├── voiceCommands.ts          — Built-in voice command recognition
├── customVoiceCommands.ts    — User-defined voice commands
├── postProcessingPipeline.ts — Text processing pipeline orchestration
├── autoPunctuation.ts        — Automatic punctuation insertion
├── smartSpacing.ts           — Context-aware spacing rules
├── codeVocabulary.ts         — Programming term normalization
├── languageSelector.ts       — Whisper language selection UI
├── transcriptHistory.ts      — Session transcript log
├── partialOverlay.ts         — Live partial transcript overlay
├── pipelineSettingsUI.ts     — Pipeline configuration webview
├── soundFeedback.ts          — Audio feedback for state changes
├── autoSubmitRules.ts        — Auto-submit trigger configuration
└── test/                     — Vitest unit tests
```

## Guidelines

- Keep it simple. VoxPilot is intentionally small.
- No cloud dependencies. Everything must run on-device.
- No telemetry or analytics. Privacy is non-negotiable.
- Test on at least one platform before submitting.
- Follow existing code style (TypeScript, no semicolons optional).

## Reporting Issues

Open an issue on GitHub with:
- Your OS and VS Code version
- Steps to reproduce
- Expected vs actual behavior
- Any error messages from the Output panel (VoxPilot channel)

## Ideas Welcome

If you're not sure whether something fits, open an issue first to discuss. Good areas for contribution:

- Additional ASR model support
- Better VAD algorithms
- Platform-specific audio improvements
- Localization
- Documentation and examples
