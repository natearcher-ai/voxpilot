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
├── extension.ts      — Entry point, command registration
├── engine.ts         — Core orchestration (listen → transcribe → deliver)
├── transcriber.ts    — Moonshine ONNX inference
├── modelManager.ts   — Model download and caching
├── audioCapture.ts   — Platform-specific mic capture
├── vad.ts            — Voice activity detection
└── statusBar.ts      — Status bar UI
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
