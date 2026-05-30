# Changelog

All notable changes to VoxPilot will be documented in this file.

## [0.7.126] - 2026-05-30

### Added
- Transcription export — export session transcripts as markdown, JSON, SRT subtitles, or plain text
- Markdown format: timestamps, speaker labels, optional confidence scores, group by file
- JSON format: structured data with metadata for programmatic use
- SRT format: subtitle timecodes for syncing with screen recordings or videos
- Plain text format: simple one-entry-per-line dump
- Export options: date range filtering, language filtering, include/exclude timestamps and confidence
- Commands: "Export Transcript" (markdown), "Export Transcript As..." (pick format), "Export Transcript to Clipboard"
- Voice command: say "export transcript" or "export transcript as srt" to trigger export
- New setting: `voxpilot.transcriptionExport` (default: true)

## [0.7.122] - 2026-05-29

### Added
- Voice templates — say "react component", "express route", "test suite", or other trigger phrases to scaffold boilerplate code at the cursor
- 17 built-in templates: React component, React hook, Express route, Express middleware, test suite, test case, class, interface, enum, function, async function, arrow function, try-catch, Python class, Python function, Docker Compose, GitHub Action
- Templates are language-aware — only trigger when the current file matches the template's target languages
- Captures a name argument after the phrase (e.g., "react component UserProfile" → scaffolds a UserProfile component)
- Adapts to editor settings: indentation style, semicolons, quote style
- Custom templates via `voxpilot.voiceTemplates.custom` setting — define your own trigger phrases and template bodies
- Command: "VoxPilot: List Voice Templates" to browse all available templates
- New setting: `voxpilot.voiceTemplates.enabled` (default: true)

## [0.7.125] - 2026-05-28

### Added
- Remote pair voice — share voice commands and transcripts over VS Code Live Share sessions
- Broadcast transcripts to all Live Share participants in real-time as you speak
- Share voice command execution so your pair partner sees what you're doing
- Receive and display partner's voice transcripts via status bar notifications
- Sync custom vocabulary between participants for consistent recognition
- Speaker indicator shows who is currently speaking
- Privacy-first: opt-in per session, mute broadcast without stopping local transcription, no remote transcript persistence
- Commands: "Toggle Remote Pair Voice", "Mute Pair Voice Broadcast", "Unmute Pair Voice Broadcast"
- New setting: `voxpilot.remotePairVoice` (default: true)
- Requires VS Code Live Share extension to be installed and active

## [0.7.124] - 2026-05-27

### Added
- Voice shortcuts for AI assistants — say "ask copilot", "ask kiro", "inline fix", "explain this", "refactor this", "add tests", "document this", or "open chat" to trigger AI assistant commands by voice
- Auto-detects installed AI provider (Copilot, Kiro, Cody, Continue) and routes to the correct commands
- Supports passing questions/prompts directly: "ask copilot how do I parse JSON in Rust"
- New setting: `voxpilot.aiVoiceShortcuts` (default: true)

## [0.7.119] - 2026-05-26

### Added
- Privacy dashboard — see exactly what data is processed locally vs sent to the cloud
- Visual breakdown of all features by privacy classification (local/cloud/hybrid)
- Data retention controls: auto-delete transcripts and audit logs after configurable days
- Cloud interaction audit log: tracks what was sent, where, when, and how much
- One-click purge of all stored transcripts and audit data
- Export full privacy report as JSON for compliance or personal review
- Privacy ratio stats: see your local vs cloud processing percentage at a glance
- New settings: `voxpilot.privacyDashboard`, `voxpilot.privacy.transcriptRetentionDays`, `voxpilot.privacy.auditRetentionDays`, `voxpilot.privacy.maxStoredTranscripts`, `voxpilot.privacy.storeTranscripts`
- Command: "VoxPilot: Privacy Dashboard" to open the panel

## [0.7.84] - 2026-05-23

### Added
- AI code generation mode — say "create a function that..." to generate code via Copilot/LLM
- Voice-triggered code generation: say "create", "generate", "write", "implement", "scaffold", or "add" followed by a description
- Supports functions, classes, methods, interfaces, components, and types
- Uses VS Code's Language Model API (Copilot or compatible extension) for generation
- Editor context awareness: includes surrounding code and language for better results
- Automatic markdown fence stripping and code formatting after insertion
- Progress notification with cancellation support during generation
- Insert at cursor (default) or open in a new file via `aiCodeGenerationInsertMode`
- Manual trigger command: "VoxPilot: AI Code Generation" with input box for typed prompts
- Configurable context window size (`aiCodeGenerationContextLines`, default: 30)
- Model preference setting (`aiCodeGenerationModel`) for choosing specific LLM families
- New `voxpilot.aiCodeGeneration` setting (default: false — opt-in to avoid accidental triggers)

## [0.7.83] - 2026-05-22

### Added
- Team vocabulary sync — share custom vocab lists via workspace settings or git
- Place a `.voxpilot/vocabulary.json` file in your workspace root to define shared vocabulary
- Corrections: map spoken/misrecognized forms to correct terms (same as customVocabulary but shared)
- Boost entries: prioritize domain-specific terms with weights and phoneme hints (same as vocabularyBoost but shared)
- Multi-root workspace support — vocabulary files from all workspace folders are merged
- File watcher: vocabulary reloads automatically when the JSON file is edited
- "VoxPilot: Initialize Team Vocabulary" command to scaffold the file with a template
- "VoxPilot: Export to Team Vocabulary" command to export personal vocab entries to the shared file
- Validation with clear error messages for malformed vocabulary files
- User-level settings (customVocabulary, vocabularyBoost) take priority over team vocabulary
- New `voxpilot.teamVocabularySync` setting (default: true) to enable/disable
- Commit `.voxpilot/vocabulary.json` to git so the whole team benefits from shared terminology

## [0.7.82] - 2026-05-21

### Added
- Adaptive learning — improve transcription accuracy over time from user corrections
- Automatically tracks when you correct transcription errors (manual edits within 30s of insertion)
- Builds a local correction database that learns your voice, vocabulary, and speaking patterns
- Corrections accumulate strength over repeated occurrences — auto-applied once confident
- Explicit correction command: "VoxPilot: Record Correction" to teach specific patterns
- Management panel: "VoxPilot: Manage Adaptive Learning" to view, export, import, or clear learned patterns
- Strength-based system: corrections need 2+ occurrences and sufficient confidence before auto-applying
- Time-based decay prevents stale corrections from persisting indefinitely
- All data stays 100% local (VS Code globalState) — no cloud, no telemetry
- Export/import corrections as JSON for backup or sharing across machines
- New settings: `voxpilot.adaptiveLearning` (default: true), `voxpilot.adaptiveLearningAutoApply` (default: true)

## [0.7.80] - 2026-05-20

### Added
- Voice-driven test runner — control VS Code test execution entirely by voice
- Run tests: say "run tests", "run all tests", "run current test", "run test file"
- Re-run failures: say "run failing tests" or "run failed tests" to retry only broken tests
- Debug tests: say "debug test" (at cursor) or "debug all tests"
- Stop execution: say "stop tests" or "cancel tests" to abort a running test suite
- Coverage control: "show coverage", "hide coverage", "toggle coverage" for inline coverage overlays
- Panel navigation: "show test results", "show test explorer" to focus testing panels
- Test discovery: "refresh tests" to rescan and rediscover workspace tests
- Navigation: "go to test <name>" to jump to a test by name, "go to test failure" for next failure
- Uses VS Code's built-in Testing API commands for maximum compatibility across test frameworks
- New `voxpilot.voiceTestRunner` setting (default: true) to enable/disable

## [0.7.78] - 2026-05-19

### Added
- Confidence indicators — highlight uncertain words with dotted underline, click to see alternatives
- Words below a configurable confidence threshold (default 70%) get a visual dotted underline decoration
- Hover over uncertain words to see the confidence score and alternative suggestions
- Click the lightbulb (Quick Fix) on uncertain words to replace with phonetically similar alternatives
- Built-in confusion pairs for common homophones (their/there/they're, your/you're, etc.)
- Programming term confusion pairs (function/junction, class/glass, const/cost, etc.)
- Heuristic confidence estimation when ASR model doesn't provide word-level scores
- "Accept" quick fix action to dismiss individual indicators without replacing
- "VoxPilot: Clear All Confidence Indicators" command to dismiss all at once
- New settings: `voxpilot.confidenceIndicators` (default: true), `voxpilot.confidenceThreshold` (default: 0.7)

## [0.7.76] - 2026-05-18

### Added
- Voice-driven debugging — control the VS Code debugger entirely by voice
- Set, remove, toggle, and clear breakpoints by saying "set breakpoint", "remove breakpoint", etc.
- Conditional breakpoints: say "conditional breakpoint x > 5" to set conditions by voice
- Log breakpoints (logpoints): say "log breakpoint value is {x}" to add log messages
- Step through code: "step over", "step into", "step out" for line-by-line debugging
- Execution control: "continue", "pause", "stop debugging", "restart debugging", "start debugging"
- "Run to cursor" and "run without debugging" voice commands
- Variable inspection: say "inspect myVar" to show debug hover, or "add watch expression" for watch panel
- Panel navigation: "focus call stack", "focus variables", "focus watch", "focus breakpoints"
- Uses VS Code's built-in debug commands for maximum compatibility across debug adapters
- New `voxpilot.voiceDebugging` setting (default: true) to enable/disable

## [0.7.74] - 2026-05-17

### Added
- Dictation profiles — switch between prose/code/command modes with different processing pipelines
- Three built-in profiles: Prose (natural language), Code (programming), Command (voice control)
- Each profile enables/disables specific post-processors for optimal results in that context
- Quick switch via command palette ("VoxPilot: Switch Dictation Profile") or status bar
- Status bar indicator shows the active profile with icon
- Voice switching: say "switch to code mode" or "command mode" to change profiles
- Custom profiles via `voxpilot.dictationProfiles.custom` setting with full processor control
- Profiles persist across sessions via `voxpilot.dictationProfiles.active` setting

## [0.7.72] - 2026-05-16

### Added
- LLM post-correction — optional AI pass to fix transcription errors using surrounding file context
- Uses VS Code's Language Model API (Copilot or compatible) to correct misrecognized words
- Sends surrounding editor context (configurable lines) so the LLM can identify technical terms
- Sanity checks prevent wildly different corrections from being applied
- Optional diff notification mode: review corrections before they're applied
- Configurable minimum transcript length to skip correction on short phrases
- Model family preference setting (e.g. 'copilot', 'gpt-4o', or any available)
- Graceful fallback: if no LLM is available, transcription works normally
- New settings: `voxpilot.llmPostCorrection` (default: false), `llmPostCorrectionContextLines`, `llmPostCorrectionMinLength`, `llmPostCorrectionModel`, `llmPostCorrectionShowDiff`

## [0.7.71] - 2026-05-14

### Added
- Offline model manager — download, cache, and switch between ASR models with progress UI and disk usage tracking
- Webview panel showing all available models (Moonshine, Whisper, Parakeet) with accuracy/speed meters
- Download models from Hugging Face with progress indication and cancel support
- Track total disk usage across all cached models
- Switch active model directly from the panel
- Delete unused models to free disk space
- Visual indicators for active, downloaded, and recommended models
- Model comparison stats: size, accuracy score, speed score, language support
- New command: "VoxPilot: Manage Offline Models"
- New `voxpilot.offlineModelManager` setting (default: true) to enable/disable

## [0.7.69] - 2026-05-13

### Added
- Extension API — public API for other extensions to hook into VoxPilot transcription events and pipeline
- Other extensions can subscribe to transcription events (start, partial, complete, error)
- Programmatic control: start/stop recording from any extension
- Query VoxPilot state: recording status, current model, current language, last transcript
- Event emitter architecture with proper disposal and error isolation
- Usage: `const api = vscode.extensions.getExtension('natearcher-ai.voxpilot')?.exports`
- `api.onTranscript((text, metadata) => { ... })` for transcript callbacks
- `api.onEvent('recording-start', (event) => { ... })` for lifecycle events
- `api.startRecording()` / `api.stopRecording()` for programmatic control
- `api.isRecording`, `api.currentModel`, `api.currentLanguage` state getters
- Listener errors are swallowed to prevent third-party code from crashing VoxPilot
- New `voxpilot.extensionApi` setting (default: true) to enable/disable

## [0.7.67] - 2026-05-12

### Added
- Pair programming mode — distinguish two speakers by voice profile and route to different targets
- Each speaker records a 5-second calibration sample to build a voice profile
- Lightweight speaker classification using pitch (ZCR), energy, and spectral brightness
- Route Speaker A to editor and Speaker B to chat (or terminal/clipboard)
- Confidence scoring on each classification to handle ambiguous utterances
- Weighted Euclidean distance with pitch as primary discriminator
- Works with any ASR backend (Moonshine, Whisper, Parakeet)
- No cloud required — all voice profiling runs on-device
- New `voxpilot.pairProgramming` setting (default: false) to enable/disable

## [0.7.65] - 2026-05-11

### Added
- Snippet marketplace — browse and install community-shared voice macro packs from a curated registry
- Browse available packs sorted by popularity, rating, or name
- Filter packs by category: frameworks, languages, tools, testing, productivity, accessibility
- One-click install merges pack macros into your voiceMacroDefinitions
- Uninstall packs to cleanly remove their macros from your configuration
- View installed packs with version and install date
- 4 built-in starter packs: React Essentials (12 macros), Python Shortcuts (15 macros), Docker Commands (10 macros), Testing Toolkit (18 macros)
- Packs include snippets, terminal commands, and insert actions
- New `voxpilot.snippetMarketplace` setting (default: true) to enable/disable
- Command: "VoxPilot: Browse Snippet Marketplace"

## [0.7.63] - 2026-05-10

### Added
- Voice-driven git — execute git operations by voice without leaving the editor
- Say "commit <message>" to stage and commit with a message
- Say "push" or "pull" to sync with remote
- Say "stash" / "stash pop" to manage work-in-progress
- Say "checkout <branch>" or "switch to branch <name>" to change branches
- Say "create branch <name>" to create and switch to a new branch
- Say "merge <branch>" to merge a branch into current
- Say "status" to show git status in the output channel
- Say "diff" to open the diff view for all changes
- Say "log" to show recent commit history (last 10)
- Say "stage all" / "unstage all" to manage the staging area
- Say "discard changes" to reset working tree (requires confirmation)
- Dangerous operations (discard) show a modal confirmation dialog before executing
- Branch names are auto-sanitized from voice input (spaces → hyphens, invalid chars removed)
- Uses VS Code's built-in git commands when available, falls back to terminal execution
- Greedy longest-phrase-first matching prevents short triggers from shadowing longer ones
- Status bar shows 🔀 indicator when a git command is executed
- New `voxpilot.voiceGit` setting (default: true) to enable/disable

## [0.7.61] - 2026-05-09

### Added
- Multi-file voice navigation — navigate across workspace files by voice without touching the keyboard
- Say "go to file <name>" or "open file <name>" to open any file by name via quick-open
- Say "find function <name>" or "go to function <name>" to jump to a function definition via workspace symbols
- Say "find class <name>" to navigate to a class definition
- Say "find symbol <name>" for general workspace symbol search
- Say "open test" to open the corresponding test file (supports .test, .spec, __tests__, and Python test_ conventions)
- Say "switch to previous", "go back", or "last file" to return to the previously edited file
- Say "go to line <number>" to jump to a specific line (supports spoken numbers like "forty two")
- Say "open recent" to show the recent files picker
- Greedy longest-phrase-first matching prevents short triggers from shadowing longer ones
- Integrates into the voice command pipeline after refactoring commands
- Status bar shows 🧭 indicator when a navigation command is executed
- New `voxpilot.voiceNavigation` setting (default: true) to enable/disable

## [0.7.59] - 2026-05-08

### Added
- Voice annotations — add inline comments by voice without moving the cursor
- Say "annotate <text>" to append a comment at the end of the current line
- Say "annotate above <text>" or "annotate below <text>" to place comments on adjacent lines
- Say "note <text>" as a shorthand for annotate
- Say "bookmark <text>" to insert a BOOKMARK: prefixed comment for easy searching
- Comment style auto-adapts to file language: // for JS/TS/Go, # for Python/Ruby/Shell, <!-- --> for HTML, -- for SQL/Lua
- Cursor position is preserved — annotations are inserted without disrupting your editing flow
- Integrates into the voice command pipeline after macros and refactoring
- New `voxpilot.voiceAnnotations` setting (default: true) to enable/disable

## [0.7.57] - 2026-05-07

### Added
- Performance dashboard — webview panel showing transcription latency, accuracy stats, model benchmarks, and session history
- Tracks per-transcription metrics: processing time, audio duration, model used, language, success/failure
- Aggregate statistics: average latency, P50/P95/P99 percentiles, real-time factor, error rate
- Model comparison benchmarks — see which ASR model performs best in your environment
- Recent transcriptions table with status, timing, and character count
- Time range filter (last hour, 6h, 24h, 7 days, all time)
- Export metrics as JSON for external analysis
- Data collected passively during normal use, displayed on demand via "VoxPilot: Show Performance Dashboard" command
- New `voxpilot.performanceDashboard` setting (default: true) to toggle metrics collection

## [0.7.55] - 2026-05-06

### Added
- Neural noise reduction — RNNoise WASM denoiser for superior background noise filtering beyond the adaptive noise gate
- Uses a lightweight recurrent neural network (RNNoise) compiled to WebAssembly for real-time spectral-level noise suppression
- Separates speech from noise at the frequency domain level, preserving speech quality even in noisy environments (cafés, open offices, fans)
- ~200KB WASM module downloaded automatically on first use from CDN
- Processes audio at RNNoise native 48kHz with automatic resampling from/to 16kHz ASR pipeline
- Returns per-frame VAD probability as a bonus signal for improved speech detection
- Chains before the adaptive noise gate — neural denoising cleans the signal, then adaptive gate handles residual
- Falls back gracefully to adaptive noise gate if WASM fails to load or is unavailable
- New `voxpilot.neuralNoiseReduction` setting (default: false) — opt-in to avoid unexpected downloads
- Reset state automatically between recording sessions for clean denoising

## [0.7.53] - 2026-05-05

### Added
- Voice-driven refactoring — say "rename", "extract function", "extract variable" to trigger VS Code refactoring actions by voice
- Supported commands: rename (with argument), extract function, extract variable, extract constant, extract method, inline variable, move to file, organize imports, add import, quick fix, refactor, format document, format selection
- "Rename to <name>" triggers the rename widget and types the new name automatically
- Extract/inline commands pass the correct CodeAction kind for precise refactoring without menu navigation
- Greedy longest-phrase-first matching prevents short phrases from shadowing longer ones
- Integrates after voice macros in the transcript pipeline — refactoring commands are intercepted before normal text delivery
- Status bar shows 🔧 indicator when a refactoring command is executed
- New `voxpilot.voiceRefactoring` setting (default: true) to toggle the feature

## [0.7.51] - 2026-05-04

### Added
- Live rewriting zone — show partial transcript with dotted underline that updates in real-time as recognition improves
- When streaming transcription is active in inline mode, partial text is inserted at the cursor with a dotted underline and ◉ indicator
- Text updates in-place as the ASR model refines its output, replacing previous partial results smoothly
- On speech end, the live zone decoration is removed and final text replaces the partial — no jarring text jumps
- Cancel mid-speech (stop recording) cleanly removes partial text and decoration
- Diff-based update logic (`findTextDiff`) minimizes editor churn by only replacing changed portions
- New `voxpilot.liveRewriting` setting (default: true) to toggle the feature
- Works alongside the existing partial overlay — overlay shows floating caption, live zone writes directly into the editor

## [0.7.50] - 2026-05-03

### Added
- Custom vocabulary boost — weight domain-specific terms (1.0–10.0) for better recognition accuracy
- Define boosted terms with optional phoneme hints for unusual pronunciations (e.g. "kubectl" → phoneme "cube-control")
- Higher boost factors match first, giving priority to your most important terms
- Phoneme hints generate additional matching patterns — hyphenated and spaced variants are both recognized
- Up to 200 entries supported for fast, low-overhead matching
- Integrated into the post-processing pipeline after code vocabulary, before smart insert
- New `voxpilot.vocabularyBoostEnabled` setting (default: true) to toggle the feature
- New `voxpilot.vocabularyBoost` array setting to define boosted terms with term, boost, and phoneme fields

## [0.7.49] - 2026-05-02

### Added
- Text-to-speech readback — hear your transcription read back aloud for verification before inserting
- Four readback modes: `off` (default), `always`, `on-error` (low confidence only), `on-demand` (button in notification)
- Cross-platform TTS via Web Speech API in a lightweight hidden webview
- Configurable speech rate via `voxpilot.readbackRate` (0.5–2.0, default: 1.2)
- Voice selection via `voxpilot.readbackVoice` (platform-dependent, defaults to system voice)
- Smart text formatting for natural speech: expands code abbreviations (fn → function, ctx → context, etc.) and adds pauses at punctuation
- Confidence-based triggering in `on-error` mode — only reads back when transcription confidence drops below 70%
- Stop readback at any time by triggering a new transcription or toggling recording

## [0.7.48] - 2026-05-01

### Added
- Walky-talky mode — press and hold the push-to-talk keybinding to record, release to stop and transcribe (like VS Code Speech)
- Hold detection with configurable threshold (default 300ms) distinguishes tap (toggle) from hold (walky-talky)
- Quick tap on the keybinding still works as a toggle for quick capture mode
- Automatic cleanup on key release: finalizes speech and delivers transcript immediately
- Reset on focus loss prevents stuck recording state
- New `voxpilot.walkyTalky` setting to enable/disable (default: true)
- New `voxpilot.walkyTalkyThresholdMs` setting to tune hold detection (100–1000ms, default: 300)
- New `pushToTalkKeyDown` and `pushToTalkKeyUp` commands for programmatic walky-talky control

## [0.7.47] - 2026-04-29

### Added
- Voice macros — record and replay custom voice-triggered code snippets and multi-step editor actions
- Define macros that map a spoken phrase to a sequence of actions: insert text, insert snippet (with tab stops), execute VS Code command, send terminal command, or wrap selection
- Macro matching intercepts transcripts before normal delivery — say the trigger phrase and the macro runs instantly
- Greedy longest-phrase-first matching prevents short phrases from shadowing longer ones
- New `VoxPilot: Record Voice Macro` command — interactive wizard to define phrase, description, and action sequence
- New `VoxPilot: Manage Voice Macros` command — list, test, or delete existing macros
- Macros stored in `voxpilot.voiceMacroDefinitions` setting for easy export and sharing
- Enable/disable via `voxpilot.voiceMacros` setting (default: true)

## [0.7.45] - 2026-04-28

### Added
- History panel — searchable transcript history webview with timestamps, search/filter, and click-to-insert
- Rich metadata per entry: language, model, audio duration alongside transcript text
- Relative time display ("just now", "2 min ago", "yesterday") for each transcript
- Click to insert at cursor, copy to clipboard, or delete individual entries
- Export history as JSON or plain text
- Configurable max entries via `voxpilot.historyMaxEntries` (default 100, range 10–1000)
- New `VoxPilot: Open History Panel` command with `$(history)` icon
- Enable/disable via `voxpilot.historyPanel` setting (default: true)

## [0.7.43] - 2026-04-27

### Added
- Multi-language support — add Whisper backend option for 99-language transcription alongside Moonshine
- Language profiles — save preferred language+model combos (e.g. "Spanish dictation") for quick switching via `VoxPilot: Apply Language Profile` command
- Quick language toggle — switch between your two most recent languages with `VoxPilot: Quick Toggle Language` command
- Auto-model suggestion — when selecting a non-English language with an English-only model, VoxPilot offers to switch to the right Whisper model automatically
- Language detection history — detected languages from Whisper auto-detect are tracked for quick toggle
- Model compatibility checks — warns when language/model mismatch is detected and suggests the optimal Whisper model size (base for European, medium for CJK/complex scripts)
- Flag emoji display for detected languages in status bar
- New commands: `Quick Toggle Language`, `Apply Language Profile`, `Save Language Profile`
- Existing `voxpilot.multiLanguage` and `voxpilot.languageProfiles` settings are now fully wired into the engine

## [0.7.42] - 2026-04-26

### Added
- Streaming transcription — show partial results in real-time as you speak instead of waiting for silence
- Rolling audio buffer processes speech in configurable windows (default 2s) and displays intermediate transcriptions via the partial overlay and status bar
- Partial results update live as recognition improves, giving immediate visual feedback while speaking
- Final transcription on speech end replaces all partials for accuracy
- New `voxpilot.streamingTranscription` setting (default: `false`) to enable streaming mode
- New `voxpilot.streamingWindowMs` setting (default: `2000`, range 500–5000) to control how often partial results update — lower values give faster feedback at higher CPU cost

## [0.7.41] - 2026-04-25

### Added
- Wake word detection — say "hey vox" to start recording hands-free without clicking the button
- Always-on lightweight listening loop captures short audio windows, runs VAD, and only transcribes when speech is detected
- Fuzzy matching handles common ASR misrecognitions: "hey box", "hey fox", "hey vocs", etc.
- Custom wake phrase via `voxpilot.wakePhrase` setting (default: "hey vox")
- 3-second cooldown after trigger prevents double-activation
- Automatically pauses during active recording and resumes when recording stops
- New `voxpilot.wakeWord` setting (default: `false`) to enable/disable wake word detection

## [0.7.40] - 2026-04-24

### Added
- Idle auto-stop — automatically stops recording after a configurable period of silence (no speech detected)
- Default: disabled (0 seconds). Set `voxpilot.idleAutoStopSeconds` to enable (e.g. 30 for 30 seconds)
- Timer resets on each speech detection, so active conversations won't be cut off
- Shows an informational message when recording is auto-stopped due to idle timeout
- Useful for hands-free workflows where you might forget to stop recording
- Configurable range: 0–300 seconds (0 = disabled)

## [0.7.39] - 2026-04-23

### Added
- Smart insert mode — detects cursor context (string, comment, function signature, general code) and formats transcription accordingly
- Inside a string literal: inserts raw text with no extra formatting
- Inside a comment: capitalizes first letter and adds trailing period for natural language style
- Inside a function signature: converts spoken words to camelCase parameter names (e.g. "user name" → `userName`)
- At statement level or unknown context: passes text through unchanged for other processors to handle
- Lightweight character-scanning context detection — no AST dependency, handles single/double/backtick strings, line/block comments, and nested parentheses
- New `voxpilot.smartInsert` setting (default: `true`) to toggle smart insert mode on or off
- Integrated into the post-processing pipeline as `smartInsert`

## [0.7.38] - 2026-04-22

### Added
- Adaptive noise reduction — auto-calibrates a noise gate based on ambient noise levels before sending audio to VAD
- During the first 500ms of recording, measures the ambient noise floor and sets the gate threshold just above it
- Ongoing adaptation: tracks noise floor with exponential moving average and re-calibrates if the environment changes (e.g. moving from quiet room to noisy café)
- Sensitivity adjustable via `voxpilot.noiseReductionSensitivity` (1=aggressive, 5=gentle, default 3)
- New `voxpilot.noiseReduction` setting (default: `true`) to toggle adaptive noise reduction on or off
- Falls back to the static `noiseGateThreshold` when adaptive noise reduction is disabled
- Integrated into the audio pipeline in `engine.ts` — replaces the static noise gate when enabled

## [0.7.37] - 2026-04-21

### Added
- Auto-vocabulary post-processor — dynamically learns project-specific terms from open files and workspace symbols to improve transcription accuracy
- Scans camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE, and kebab-case identifiers from open documents and builds a correction dictionary mapping spoken forms to code identifiers
- Examples: "get user name" → `getUserName`, "my component" → `MyComponent`, "max retry count" → `MAX_RETRY_COUNT`
- Vocabulary refreshes automatically when files are opened or saved, with debounced refresh to avoid thrashing
- New `voxpilot.autoVocabulary` setting (default: `true`) to toggle auto-vocabulary on or off
- Integrated into the post-processing pipeline as `autoVocabulary` — runs before static code vocabulary so project-specific terms take priority
- Greedy longest-match-first replacement to avoid partial matches
- Skips very large files (>500KB) and common language keywords to keep vocabulary clean

## [0.7.36] - 2026-04-20

### Added
- Terminal target output — route transcription directly to the integrated terminal instead of the active editor
- Set `voxpilot.outputAction` to `"terminal"` to always send transcripts to the terminal, or choose "terminal" from the notification prompt when `outputAction` is `"ask"`
- New `voxpilot.terminalAutoExecute` setting (default: `false`) — when enabled, automatically presses Enter to execute the command; when disabled, text is typed into the terminal for review before submitting
- Creates a new terminal named "VoxPilot" if no active terminal exists
- Works with dictation mode for hands-free terminal command entry

## [0.7.35] - 2026-04-19

### Added
- Prefix commands post-processor — say a keyword before dictating to auto-wrap the output in code constructs
- Supported prefixes: `comment`, `block comment`, `todo`, `fixme`, `function`, `variable`/`const`, `let`, `log`/`print`, `return`, `import`, `class`, `if`
- Examples: "comment hello world" → `// hello world`, "function greet" → `function greet() {}`, "log hello" → `console.log("hello");`
- New `voxpilot.prefixCommands` setting (default: `true`) to toggle prefix commands on or off
- Greedy longest-prefix-first matching so "block comment" matches before "comment"
- Integrated into the post-processing pipeline as `prefixCommands` — can be reordered or disabled via `voxpilot.postProcessors` settings

## [0.7.33] - 2026-04-18

### Added
- Editor voice commands post-processor — say "undo", "redo", "save", "new line", "select all", "delete line", "copy", "cut", "paste", "format document", or "close tab" to execute the corresponding VS Code editor action instead of typing the words
- Phrases are stripped from the transcript and executed as deferred VS Code commands via the pipeline's `pendingCommands` mechanism
- New `voxpilot.editorVoiceCommands` setting (default: `true`) to toggle editor voice commands on or off
- Integrated into the post-processing pipeline as `editorVoiceCommands` between `voiceCommands` and `customVoiceCommands` — can be reordered or disabled via `voxpilot.postProcessors` settings
- Multi-word phrases ("save file", "close tab", "select all", "delete line", "format document", "copy that", "cut that", "paste that") matched before shorter variants to avoid false positives

## [0.7.32] - 2026-04-17

### Added
- Filler word removal post-processor — automatically strips common filler words and phrases (um, uh, uhh, umm, hmm, hm, mhm, uh huh, like, you know, I mean, sort of, kind of, basically, actually, literally) from transcriptions
- New `voxpilot.fillerWordRemoval` setting (default: `true`) to toggle filler word stripping on or off
- Integrated into the post-processing pipeline as `fillerWordRemoval` — can be reordered or disabled via `voxpilot.postProcessors` settings
- Smart cleanup: collapses double spaces left by removed fillers and trims the result

## [0.7.8] - 2026-04-11

### Added
- Zed IDE compatibility — automatic detection of Zed editor via `vscode.env.appName` with dedicated assistant chat delivery path
- Multi-strategy chat delivery for Zed: tries native assistant commands (`assistant.sendMessage`, `assistant.newContext`, `zed.assistant.send`, `assistant.open`), falls back to `workbench.action.chat.open`, then clipboard-paste into focused assistant panel
- Zed-specific submit command (`assistant.submit`) support for auto-submit after transcript delivery
- Updated IDE detection helper (`detectIDE()`) to route Kiro, Cursor, Windsurf, Zed, and standard VS Code through separate delivery paths

## [0.7.7] - 2026-04-10

### Added
- Windsurf IDE compatibility — automatic detection of Windsurf (Codeium) editor via `vscode.env.appName` with dedicated Cascade chat delivery path
- Multi-strategy chat delivery for Windsurf: tries native Cascade commands (`windsurf.newChat`, `cascade.sendMessage`, `windsurf.cascade.send`, `codeium.chatPanelSend`), falls back to `workbench.action.chat.open`, then clipboard-paste into focused Cascade panel
- Windsurf-specific submit command (`cascade.submit`) support for auto-submit after transcript delivery
- Updated IDE detection helper (`detectIDE()`) to route Kiro, Cursor, Windsurf, and standard VS Code through separate delivery paths

## [0.7.6] - 2026-04-09

### Added
- Cursor IDE compatibility — automatic detection of Cursor editor via `vscode.env.appName` with dedicated chat delivery path
- Multi-strategy chat delivery for Cursor: tries native Cursor commands (`aipanel.newchat.send`, `composerAction.startComposerPrompt`, `aichat.newchataction`), falls back to `workbench.action.chat.open`, then clipboard-paste into focused chat panel
- Cursor-specific submit command (`aichat.submit`) support for auto-submit after transcript delivery
- Unified IDE detection helper (`detectIDE()`) that cleanly routes Kiro, Cursor, and standard VS Code through separate delivery paths
- Platform-aware clipboard fallback hint (Cmd+V on macOS, Ctrl+V elsewhere) replacing hardcoded Ctrl/Cmd check

## [0.7.5] - 2026-04-08

### Added
- Performance benchmarks page on the landing site — latency, accuracy (WER), RAM usage, and download size comparison across all 7 ASR models
- Dedicated `docs/benchmarks.html` with sortable comparison table covering Moonshine Tiny/Base, Whisper Tiny/Base/Small/Medium/Large v3 Turbo, and Parakeet TDT 0.6B
- Highlight cards showing fastest transcription (85ms), lowest WER (4.2%), and smallest model (27MB)
- Recommended models by use case table — quick commands, daily coding, streaming, multilingual, long dictation, max accuracy, low-spec machines
- Methodology section documenting benchmark conditions (M2, 16GB RAM, ONNX Runtime CPU, LibriSpeech test-clean)
- Tips section with cold-start, GPU acceleration, and model selection guidance
- Benchmarks link added to landing page footer and README

## [0.7.4] - 2026-04-07

### Added
- Telemetry-free badge and No Cloud badge in README and landing page — linked to privacy policy for instant verification
- Trust signals section in README with six concrete privacy guarantees: zero telemetry, zero cloud, zero data collection, fully auditable, minimal permissions, and privacy policy link
- Privacy & Trust panel on landing page (`docs/index.html`) — styled green-tinted card with icon grid covering all trust signals
- Badges also added to the landing page header badge row for immediate visibility

## [0.7.3] - 2026-04-06

### Added
- Privacy policy page on the landing site — clear, human-readable disclosure of VoxPilot's data handling practices
- Dedicated `docs/privacy.html` page covering audio data, transcription output, data collection (none), third-party services, local storage, permissions, and open-source auditability
- TL;DR summary: all audio processed on-device, zero data collected, no telemetry, no analytics, no cloud calls
- Privacy policy link added to the landing page footer for easy access
- Covers model downloads (user-initiated only, from Hugging Face), local storage details, and microphone permissions

## [0.7.2] - 2026-04-05

### Added
- User-custom vocabulary — define your own word corrections and aliases in `settings.json` under `voxpilot.customVocabulary`
- Each entry maps a spoken/misrecognized `from` phrase to a corrected `to` replacement (e.g. `{ "from": "my lib", "to": "MyLib" }`)
- User entries take priority over the built-in code vocabulary — override any built-in correction or add domain-specific terms
- Phrases are matched case-insensitively at word boundaries; longer phrases match first to avoid conflicts
- Custom vocabulary reloads automatically when settings change (no restart needed)
- Full JSON schema validation in `settings.json` with IntelliSense for `from`/`to` fields
- Works seamlessly with the existing code vocabulary post-processor — user rules run first, then built-in rules

## [0.7.1] - 2026-04-04

### Added
- Code vocabulary — built-in dictionary of 120+ programming term corrections for common ASR misrecognitions
- Automatically corrects split words: "java script" → "JavaScript", "type script" → "TypeScript", "camel case" → "camelCase"
- Fixes spaced-out acronyms: "a p i" → "API", "a w s" → "AWS", "c i c d" → "CI/CD"
- Corrects common ASR confusions: "jason" → "JSON", "pie thon" → "Python", "get hub" → "GitHub"
- Covers languages, frameworks, tools, platforms, cloud services, data formats, casing conventions, and programming keywords
- New `codeVocabulary` post-processor runs after typo fixes and before auto-punctuation in the pipeline
- New `voxpilot.codeVocabulary` setting (default: `true`) — disable to get raw transcription output
- Can also be toggled via the post-processing pipeline settings UI or `voxpilot.postProcessors.disabled`
- 14 unit tests covering language corrections, casing conventions, acronyms, frameworks, cloud terms, word boundaries, and multi-correction transcripts

## [0.7.0] - 2026-04-03

### Added
- Dictation mode — continuous transcription with no VAD cutoff, manual stop only
- New command `VoxPilot: Toggle Dictation Mode (Continuous)` starts a long-form dictation session where speech segments are transcribed and stashed as you speak, but silence no longer ends the session
- Press the command again (or click the status bar) to stop and deliver the full stitched transcript
- Status bar shows `$(notebook) Dictation mode` while active so you always know you're in continuous mode
- Keybinding: `Ctrl+Alt+D` / `Cmd+Alt+D`
- Works with all output targets (chat, cursor, clipboard) and the full post-processing pipeline (voice commands, auto-punctuation, auto-capitalize, etc.)
- Multi-segment stitching handles pauses naturally — speak in bursts, get one clean transcript at the end

## [0.6.9] - 2026-04-02

### Added
- Custom voice command engine — user-defined `command`-type voice commands now execute at runtime
- Say a mapped phrase (e.g. "format file") and VoxPilot strips it from the transcript and runs the corresponding VS Code command (`editor.action.formatDocument`)
- Commands with optional `args` are supported — arguments are passed directly to `vscode.commands.executeCommand`
- Multiple command phrases in a single transcript are all detected, stripped, and executed in order
- Mixed transcripts work seamlessly: insert-type phrases get replaced with text, command-type phrases trigger VS Code commands, and the remaining transcript is delivered normally
- Failed commands show a non-blocking warning notification with the error message
- All command executions are logged in the VoxPilot output channel with phrase, command ID, and args
- New `pendingCommands` field on `ProcessorContext` enables pipeline-to-engine command handoff
- 5 new unit tests covering command queuing, args, mixed actions, multiple commands, and no-match scenarios

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
