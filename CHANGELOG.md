# Changelog

All notable changes to VoxPilot will be documented in this file.

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
