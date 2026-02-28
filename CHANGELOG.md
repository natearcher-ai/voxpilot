# Changelog

All notable changes to VoxPilot will be documented in this file.

## [0.3.2] - 2026-02-28

### Fixed
- Cleaned up Kiro chat delivery — use proven focus+paste+submit method directly
- Removed noisy error log from customQuickActionSendToChat

## [0.3.1] - 2026-02-28

### Added
- Kiro-native chat delivery using `kiroAgent.acpChatView.focus` + clipboard paste + `chat.submit`
- Separate Kiro and VS Code code paths for reliability

## [0.3.0] - 2026-02-28

### Added
- Smart chat command discovery — enumerates all available chat commands at runtime
- Detailed logging of app name and available commands for debugging

## [0.2.8] - 2026-02-27

### Fixed
- Full detailed changelog covering all releases

## [0.2.7] - 2026-02-27

### Added
- Clear Cache command to free disk space from downloaded models
- GitHub Pages landing page
- Three-tier chat delivery (Chat API → clipboard paste → direct input)
- Kiro compatibility for chat delivery

### Changed
- Upgraded README with badges, use cases, architecture diagram
- Improved chat delivery reliability with fallback chain

## [0.2.0] - 2026-02-26

### Changed
- **Major:** Replaced manual ONNX inference with `@huggingface/transformers` pipeline
- Eliminates MatMul/KV cache dimension errors
- Runtime installs both `onnxruntime-node` and `@huggingface/transformers`

## [0.1.8] - 2026-02-26

### Fixed
- Split incoming audio into proper 30ms frames for accurate VAD timing
- Cap speech buffer at 15 seconds (Moonshine's practical limit)

## [0.1.5] - 2026-02-26

### Added
- Adaptive VAD — calibrates to ambient noise floor instead of fixed threshold

## [0.1.3] - 2026-02-26

### Added
- Auto-install `onnxruntime-node` at runtime for cross-platform support

## [0.1.1] - 2026-02-26

### Fixed
- Handle HTTP 307 redirects for HuggingFace model downloads
- Clarify Mac keybinding: `Cmd+Option+V` (not `Cmd+Alt+V`)

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
