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
├── engine.ts                 — Core orchestration (listen -> transcribe -> deliver)
├── transcriber.ts            — ASR inference (Moonshine, Whisper, Parakeet TDT)
├── modelManager.ts           — Model download and caching
├── modelManagerPanel.ts      — Sidebar tree view for model management
├── audioCapture.ts           — Mic capture via native helper, sox, arecord, or ffmpeg
├── vad.ts                    — Adaptive energy-based voice activity detection
├── statusBar.ts              — Status bar UI with waveform integration
├── noiseGate.ts              — RMS-based noise gate filter for PCM audio
├── waveformVisualizer.ts     — Unicode block-character waveform for status bar
├── voiceCommands.ts          — Built-in spoken command to action mapping
├── customVoiceCommands.ts    — User-defined voice-to-action mappings via settings
├── postProcessingPipeline.ts — Pluggable pipeline for transcript transforms
├── autoPunctuation.ts        — Auto-period insertion based on speech pause patterns
├── smartSpacing.ts           — Whitespace normalization between transcript segments
├── codeVocabulary.ts         — Programming term correction dictionary
├── languageSelector.ts       — Whisper language selection (multilingual support)
├── transcriptHistory.ts      — Recent transcript storage and recall
├── partialOverlay.ts         — Floating live-caption overlay in the editor
├── pipelineSettingsUI.ts     — QuickPick UI to reorder and toggle post-processors
├── soundFeedback.ts          — Audio beep feedback for start/stop listening
├── autoSubmitRules.ts        — Auto-submit (Enter) rules per output target
└── test/
    ├── __mocks__/vscode.ts   — VS Code API mock for tests
    ├── engine.test.ts
    ├── transcriber.test.ts
    ├── vad.test.ts
    ├── noiseGate.test.ts
    ├── waveformVisualizer.test.ts
    ├── voiceCommands.test.ts
    ├── customVoiceCommands.test.ts
    ├── customVocabulary.test.ts
    ├── codeVocabulary.test.ts
    ├── postProcessingPipeline.test.ts
    ├── autoPunctuation.test.ts
    └── smartSpacing.test.ts
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
