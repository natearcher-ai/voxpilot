# Changelog

All notable changes to VoxPilot will be documented in this file.

## [0.2.7] - 2026-02-27

### Added
- Clear Cache command to free disk space from downloaded models
- GitHub Pages landing page
- Three-tier chat delivery (Chat API → clipboard paste → direct input)
- Kiro compatibility for chat delivery

### Changed
- Upgraded README with badges, use cases, architecture diagram
- Improved chat delivery reliability with fallback chain

## [0.1.0] - 2026-02-26

### Added
- Initial release
- On-device speech recognition via Moonshine ASR (ONNX)
- Voice Activity Detection (energy-based)
- Toggle Voice Input and Quick Capture modes
- Model selection (Moonshine Tiny / Base)
- Auto-send to VS Code chat participants
- Cross-platform audio capture (arecord, sox, ffmpeg)
- Configurable VAD sensitivity and silence timeout
- Send Last Transcript command
