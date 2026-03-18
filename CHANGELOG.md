# Changelog

All notable changes to VoxPilot will be documented in this file.

## [0.5.4] - 2026-03-18

### Added
- Parakeet TDT 0.6B ONNX integration — streaming low-latency transcription engine (~150MB, English-only)
- New model option in settings and model manager panel: `parakeet-tdt-0.6b`
- Streaming transcription: Parakeet processes audio in 5-second chunks, emitting partial transcripts as each chunk decodes
- Live partial transcript shown in status bar during streaming inference (pulse icon with rolling text)
- Seamless fallback: non-streaming models (Moonshine, Whisper) continue to work exactly as before
- `transcribeStreaming()` API on Transcriber with `onPartial` / `onFinal` callbacks
- Model registry marks Parakeet as `streaming: true`; `isStreamingModel()` helper on ModelManager

## [0.5.3] - 2026-03-17

### Added
- Model manager panel — sidebar UI in the activity bar to browse, download, switch, and delete ASR models
- TreeView shows all 7 models with download status, size info, and active indicator
- Inline actions: click to switch model, download button for undownloaded models
- Right-click context menu to delete downloaded (non-active) models and free disk space
- Refresh button in panel title bar; auto-refreshes when active model setting changes
- Download progress shown via VS Code notification with cancel support
- Guards against deleting the currently active model

## [0.5.2] - 2026-03-16

### Added
- Whisper model support — OpenAI Whisper ONNX models via `@huggingface/transformers` pipeline
- Five new model options: Whisper Tiny (~120MB), Base (~200MB), Small (~600MB), Medium (~1.5GB), Large v3 Turbo (~1.6GB)
- 90+ language support with Whisper models (Moonshine remains English-only)
- Model picker (`VoxPilot: Select ASR Model`) now shows all 7 models with download status
- Settings enum updated with descriptions showing size and language support for each model
- Seamless switching: select any model in settings or via command, it downloads on first use

## [0.5.1] - 2026-03-15

### Added
- CI/CD pipeline — GitHub Actions workflows for automated lint, test, build, and publish
- CI workflow: runs `tsc --noEmit` type checking, `npm test` unit tests, and `vsce package` on every push/PR to main
- Release workflow: triggered by version tags (`v*`), runs full checks then auto-publishes to Open VSX and creates a GitHub Release with the `.vsix` artifact
- Replaced the old single-job `build.yml` with separate `ci.yml` (3-stage pipeline) and `release.yml` (tag-triggered publish)
- To release: `git tag v0.5.1 && git push --tags` — the pipeline handles the rest

## [0.5.0] - 2026-03-14

### Added
- Automated test suite — 46 unit tests covering VAD, voice commands, noise gate, transcriber, and engine modules
- Uses Vitest as the test framework with VS Code API mocking
- VAD tests: calibration, speech detection, silence timeout, sensitivity levels, adaptive noise floor, reset, edge cases
- Voice commands tests: all punctuation commands, delete/undo that, multiple commands, case insensitivity, edge cases
- Noise gate tests: threshold gating, attack/release timing, reset, dynamic threshold, empty buffer handling
- Transcriber tests: initialization, error handling for unloaded model, safe dispose
- Engine/extension tests: module export verification (activate, deactivate, VoxPilotEngine)
- New `npm test` script for running the full suite

## [0.4.6] - 2026-03-13

### Fixed
- Windows audio capture — `audio=default` is not valid for ffmpeg's dshow input; now auto-detects the first available microphone device when no device is configured
- Added `-hide_banner -loglevel error` flags to ffmpeg for cleaner output on Windows
- Fixed `which` command on Windows — use `where` for binary detection so ffmpeg is found correctly
- Added PowerShell fallback for Windows device enumeration when ffmpeg device listing fails

## [0.4.5] - 2026-03-12

### Added
- Output action setting — choose default behavior for transcripts: `ask` (notification), `chat`, `cursor`, or `clipboard`
- Replaces the separate `autoSendToChat` and `inlineMode` toggles with a single unified setting
- Inline mode keybinding still works as a per-session override

## [0.4.4] - 2026-03-11

### Added
- Default keybinding for Quick Voice Capture: `Ctrl+Alt+Q` / `Cmd+Alt+Q` (Mac)
- Quick Capture now has the same first-class keybinding treatment as Toggle Voice Input and Inline Voice Input
- All three voice input modes now have dedicated shortcuts: Toggle (`Ctrl+Alt+V`), Quick Capture (`Ctrl+Alt+Q`), Inline (`Ctrl+Alt+I`)

## [0.4.3] - 2026-03-10

### Added
- Noise gate filter — silences audio frames below a configurable RMS threshold before they reach VAD, preventing background noise (fans, hum, hiss) from triggering false speech detection
- New `voxpilot.noiseGateThreshold` setting (0–0.1, default: 0 = disabled) — try 0.005–0.02 to filter persistent low-level noise
- Smooth attack/release timing to avoid clipping speech onsets
- Gate resets automatically when listening starts
- Setting updates live without restarting the extension

## [0.4.2] - 2026-03-09

### Added
- Multi-segment transcription — long dictation is automatically split into segments at the max speech duration boundary, transcribed individually, and stitched back together when speech ends
- Seamless experience: status bar shows "Speaking" during segments, delivers one combined transcript at the end
- Works with all output modes (chat, inline, clipboard) and voice commands
- No config needed — works automatically with existing `maxSpeechDuration` setting

## [0.4.1] - 2026-03-08

### Added
- Inline mode — insert transcripts directly at the cursor position without going through chat
- New `voxpilot.inlineMode` setting (default: off) to make inline the default transcript destination
- New `VoxPilot: Inline Voice Input` command for one-shot inline capture (auto-stops after speech)
- Keybinding: `Ctrl+Alt+I` / `Cmd+Alt+I` (when editor is focused)
- Guards against no active editor — shows warning if no file is open

## [0.4.0] - 2026-03-07

### Added
- Voice commands — say "new line", "period", "comma", "question mark", "exclamation mark", "colon", "semicolon", or "open/close paren" to insert punctuation hands-free
- "Delete that" / "undo that" voice command removes the last word before the command
- Also supports "full stop", "exclamation point", "semi colon" as natural aliases
- Commands are processed as a post-transcription step — works with any ASR model
- Voice command count logged in output channel for debugging

## [0.3.9] - 2026-03-06

### Added
- Sound feedback — subtle beep on start/stop listening for clear audio cues
- New `voxpilot.soundFeedback` setting (default: on) to toggle beeps
- Cross-platform playback: afplay (macOS), aplay/paplay (Linux), PowerShell (Windows)
- Sounds auto-generated as lightweight WAV files with fade in/out to avoid clicks

## [0.3.8] - 2026-03-05

### Added
- Configurable max speech duration setting (`voxpilot.maxSpeechDuration`)
- Range: 5–60 seconds (default: 15s) — increase for longer dictation, decrease for snappier responses
- Setting updates live without restarting the extension
- Previously hardcoded to 15 seconds

## [0.3.7] - 2026-03-04

### Added
- Transcript history — browse and re-send your last 10 transcripts via quick pick (`VoxPilot: Transcript History`)
- History persists across sessions using VS Code global state
- Each entry shows truncated text with date and time

## [0.3.6] - 2026-03-03

### Added
- Audio input device selector command (`VoxPilot: Select Audio Input Device`)
- New `voxpilot.audioDevice` setting to persist selected device
- Cross-platform device enumeration: ALSA + PulseAudio (Linux), CoreAudio (macOS), DirectShow (Windows)
- Quick pick shows all detected input devices plus system default option

## [0.3.5] - 2026-03-02

### Added
- Live status bar states: Calibrating → Listening → Speaking → Transcribing → Sent
- Status bar shows truncated transcript for 3 seconds after delivery
- Calibrating state shown during initial noise floor measurement

## [0.3.4] - 2026-03-02

### Changed
- Default ASR model changed from Moonshine Tiny (~27MB) to Moonshine Base (~65MB) for better transcription accuracy
- Existing users with `moonshine-tiny` explicitly set in settings are not affected

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
