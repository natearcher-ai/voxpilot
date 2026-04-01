# Changelog

All notable changes to VoxPilot will be documented in this file.

## [0.6.8] - 2026-04-01

### Added
- Custom voice command schema — define your own voice-to-action mappings in `settings.json` under `voxpilot.customVoiceCommands`
- Two action types: `insert` (replace spoken phrase with custom text) and `command` (VS Code command ID, execution coming in v0.6.9)
- Phrases are matched case-insensitively at word boundaries; longer phrases match first to avoid conflicts
- Replacement text supports `\n` (newline) and `\t` (tab) escape sequences
- Full JSON schema validation with duplicate detection and clear error messages in the VoxPilot output channel
- New `customVoiceCommands` post-processor runs after built-in voice commands in the pipeline
- Example use cases: code snippets ("arrow function" → `() => `), filler word removal ("um" → ""), domain jargon shortcuts

## [0.6.7] - 2026-03-31

### Added
- Whisper auto-language detection — when using a Whisper model with language set to `auto`, the detected spoken language is shown in the status bar tooltip after transcription
- `Transcriber` now returns a `TranscriptionResult` with both `text` and optional `language` fields
- Detected language displayed as "English (en)" format in the status bar tooltip alongside the transcript
- `lastDetectedLanguage` getter on `Transcriber` for programmatic access to the last detected language code
- Works with all Whisper model sizes; ignored for English-only models (Moonshine, Parakeet)

## [0.6.6] - 2026-03-31

### Added
- Language selector UI — new `VoxPilot: Select Transcription Language` command opens a quick pick menu with all 90+ Whisper-supported languages
- New `voxpilot.language` setting (default: `auto`) — set a specific language code or leave as `auto` for auto-detection
- Current language shown with a checkmark in the picker; language code shown in description for easy search
- English-only models (Moonshine, Parakeet) show an informational message when language selector is invoked
- Selected language is passed to the Whisper transcription pipeline as a language hint for improved accuracy
- Language setting updates live without restarting the extension

## [0.6.5] - 2026-03-29

### Added
- Animated waveform visualization — replaces numeric dB display with a rolling mini waveform (▁▂▃▅▇) in the status bar during recording
- New `voxpilot.waveformVisualization` setting (default: enabled) to toggle the waveform display
- Waveform shows 8 bars of recent audio levels, updating in real-time as you speak
- When disabled, falls back to numeric dB display (if `voiceLevelIndicator` is on) or plain text

## [0.6.4] - 2026-03-28

### Added
- Voice activity level indicator — real-time numeric dB display in the status bar during recording
- Status bar shows current voice level in dBFS while listening (e.g. `$(mic-filled) -24 dB`) and while speaking (e.g. `$(record) -12 dB`)
- New `voxpilot.voiceLevelIndicator` setting (default: enabled) to toggle the dB display on/off
- Falls back to standard "Listening..." / "Speaking..." text when disabled
- Exposes VAD `speaking` state via public getter for level-aware status updates

## [0.6.3] - 2026-03-27

### Added
- New `VoxPilot: Post-Processing Pipeline Settings` command — interactive QuickPick UI to reorder and toggle post-processors without editing JSON
- Select any processor to move it up/down in the pipeline order or enable/disable it
- Changes persist to `voxpilot.postProcessors` settings immediately
- Pipeline list shows current order with numbered positions, enabled/disabled status, and descriptions
- Updated `voxpilot.postProcessors` setting description to reference all 7 built-in processors and the new command

## [0.6.2] - 2026-03-26

### Added
- Three new built-in post-processors: `trim`, `normalizeWhitespace`, and `fixTypos`
- `trim` — removes leading and trailing whitespace from transcripts
- `normalizeWhitespace` — collapses multiple spaces, tabs, and newlines into single spaces
- `fixTypos` — fixes common transcription errors: capitalizes standalone "i", removes repeated words ("the the" → "the"), and restores missing apostrophes in 20+ contractions (dont → don't, im → I'm, cant → can't, ive → I've, thats → that's, etc.)
- New processors run in the default pipeline order: stitch → trim → normalize → voice commands → fix typos → auto-punctuation → auto-capitalize
- All three processors can be disabled or reordered via `voxpilot.postProcessors` settings, same as existing processors
- 14 new unit tests covering trim, normalize whitespace, and typo correction scenarios (122 total)

## [0.6.1] - 2026-03-25

### Added
- Transcript post-processing framework — pluggable pipeline architecture for text transforms
- New `PostProcessingPipeline` class runs an ordered chain of `PostProcessor` steps on every transcript
- Four built-in processors: `voiceCommands` (spoken command expansion), `stitchSegments` (multi-segment smart spacing), `autoPunctuation` (auto-period), `autoCapitalize` (first-letter uppercase)
- New `voxpilot.postProcessors` setting with `order` (array of processor IDs) and `disabled` (array of IDs to skip) — reorder or disable any step without touching code
- Custom processors can be registered via the `pipeline.register()` API for extension-to-extension integration
- Pipeline context tracks metadata (`voiceCommandsApplied`, `punctuationAdded`, `capitalized`) for downstream logging
- Backward compatible: existing `autoPunctuation` and `autoCapitalize` boolean settings are respected as legacy toggles — disabling them also disables the corresponding pipeline processor
- `getProcessorInfo()` API returns the full ordered processor list with enabled/disabled status for future settings UI
- 24 new unit tests covering pipeline ordering, disabling, custom registration, fallback behavior, and all individual processors

## [0.6.0] - 2026-03-24

### Added
- Auto-submit target rules — per-target configuration for whether VoxPilot auto-presses Enter after delivering a transcript
- New `voxpilot.autoSubmitRules` setting: an object with `chat` (default: on), `cursor` (default: off), and `clipboard` (default: off) keys
- Chat targets auto-submit by default (same as before), editor/cursor inserts just insert text without pressing Enter, clipboard just copies
- When `cursor` auto-submit is enabled, a newline is inserted after the transcript at the cursor position
- Backward compatible: the legacy `autoSubmitChat` setting is still respected as a fallback for the `chat` target if `autoSubmitRules` is not explicitly configured
- `autoSubmitChat` is now marked as deprecated in favor of `autoSubmitRules`

## [0.5.9] - 2026-03-23

### Added
- Auto-submit in chat panels — transcripts sent to chat are now automatically submitted (Enter pressed) by default, so your voice goes straight to the AI without an extra step
- New `voxpilot.autoSubmitChat` setting (default: on) — disable to type the transcript into the chat input without submitting, giving you a chance to review or edit before sending
- Works with both VS Code native chat (`isPartialQuery` flag) and Kiro chat (skips `chat.submit` command when disabled)
- Applies to all chat delivery paths: output action set to `chat`, `autoSendToChat`, transcript history re-send, and `Send Last Transcript to Chat` command

## [0.5.8] - 2026-03-22

### Added
- Smart spacing between multi-segment transcripts — eliminates double spaces and missing gaps when long dictation is split into multiple segments
- New `stitchSegments()` utility replaces naive `.join(' ')` with intelligent spacing: trims segments, collapses internal whitespace runs, and attaches punctuation (`.` `,` `!` `?` `;` `:` `…` `)` `]` `}`) without a leading space
- `normalizeSpaces()` helper collapses any run of whitespace (spaces, tabs, etc.) into a single space within each segment before joining
- Handles edge cases: empty segments, whitespace-only segments, segments with leading/trailing spaces
- 20 new unit tests covering all spacing and stitching scenarios

## [0.5.7] - 2026-03-21

### Added
- Smart sentence-end punctuation — automatically adds a period at the end of transcripts when speech ends after a natural pause, using the silence timeout as a sentence boundary signal
- Detects existing punctuation (`.` `!` `?` `:` `;` `…`) and skips adding a period if already present
- Handles edge cases: open parens/brackets/commas are left alone, closing parens/brackets get a period after them
- New `voxpilot.autoPunctuation` setting (default: on) to toggle auto-punctuation
- Runs after voice commands and segment stitching, before auto-capitalization — works with all models and output modes
- 17 new unit tests covering all punctuation scenarios

## [0.5.6] - 2026-03-20

### Added
- Auto-capitalize first word of every transcript — the first letter is automatically uppercased after voice command processing and segment stitching
- New `voxpilot.autoCapitalize` setting (default: on) to toggle auto-capitalization
- Works with all output modes (chat, inline, clipboard) and all models

## [0.5.5] - 2026-03-19

### Added
- Real-time partial transcript overlay — floating live-caption text appears in the active editor as you speak, like live captions
- Overlay shows partial transcripts with a 🎙️ icon, styled with the editor's widget theme colors for a non-intrusive look
- Text auto-truncates to the last 120 characters for long utterances, keeping the display clean
- Overlay auto-hides when speech is finalized or listening stops
- New `voxpilot.partialOverlay` setting (default: on) to toggle the overlay — disable if you prefer status bar only
- Works with all models; streaming models (Parakeet) update in real time, batch models show the result briefly

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
