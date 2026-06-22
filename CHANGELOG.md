# Changelog

All notable changes to VoxPilot will be documented in this file.

## [0.7.154] - 2026-06-22

### Added
- Voice shortcuts editor — visual UI to create, edit, and test custom voice commands
- Webview panel for browsing all registered voice commands (built-in + custom)
- Create new custom commands with a form: trigger phrase, action type, replacement text
- Edit existing commands (phrase, action, text, category, enabled state)
- Test commands by typing the trigger phrase — see which shortcut matches in real-time
- Enable/disable individual commands without deleting them
- Import/export command sets as JSON for sharing and backup
- Search and filter commands by category, action type, or enabled status
- Usage statistics per command (usage count, last used timestamp)
- Default categories: punctuation, editing, navigation, formatting, git, terminal, AI, documentation, testing, custom
- New setting: `voxpilot.shortcutsEditor` (default: true)

## [0.7.153] - 2026-06-21

### Added
- OpenAI Whisper API backend — use OpenAI's cloud Whisper model as an alternative ASR engine for higher accuracy multilingual transcription
- New settings: `voxpilot.whisperBackend.enabled`, `apiKey`, `baseUrl`, `temperature`, `prompt`, `fallbackToLocal`
- Compatible with any OpenAI-compatible API endpoint (Azure OpenAI, Groq, local whisper-server, etc.)
- Automatic fallback to local ASR model on API failure (network error, timeout, rate limit) when `fallbackToLocal` is true
- Sends verbose JSON response format for language detection alongside transcription
- Vocabulary hints via the `prompt` setting guide transcription style and proper noun spelling
- Audio converted to WAV on-the-fly before sending — no temporary files written to disk
- Privacy-aware: only activates when explicitly enabled and configured with an API key
- Works alongside existing local models — switch between cloud and local per your needs

## [0.7.152] - 2026-06-20

### Added
- IDE telemetry bridge — feed voice usage data into VS Code telemetry for enterprise dashboards
- Bridges VoxPilot local analytics to VS Code's telemetry system for enterprise adoption tracking
- Reports aggregate metrics only: transcriptions/day, commands/day, model distribution, feature adoption, error rates
- Never reports transcript content, audio data, file paths, or personal identifiers
- Respects VS Code's `telemetry.telemetryLevel` setting and VoxPilot's own `analytics.enabled`
- Supports enterprise SSO policy `allowTelemetry` flag
- Configurable flush interval and batch size for telemetry events
- New setting: `voxpilot.telemetryBridge.enabled` (default: false — opt-in only)

## [0.7.150] - 2026-06-18

### Added
- Noise profile calibration — one-time environment scan to optimize noise gate and VAD thresholds
- Say "calibrate" or use command palette to start a 5-second ambient noise recording
- Analyzes frequency spectrum, energy distribution, and periodicity of background noise
- Auto-sets optimal noise gate threshold just above ambient floor
- Configures VAD sensitivity based on detected noise level
- Detects periodic noise patterns (fans, HVAC, keyboard clicks) via autocorrelation
- Classifies environment as quiet, moderate, noisy, or very-noisy
- Recommends ASR model based on noise conditions (Whisper for noisy environments)
- Suggests neural denoiser when ambient level exceeds threshold
- Store multiple named profiles (e.g., "Home Office", "Coffee Shop") and switch between them
- Activate, rename, delete, import/export noise profiles
- New setting: `voxpilot.noiseCalibration.enabled` (default: true)

## [0.7.149] - 2026-06-17

### Added
- Voice macros recorder — record a sequence of actions and replay them with a single phrase
- Say "start recording macro <name>" to begin capturing actions as you perform them
- All voice commands, text insertions, and editor actions are recorded as macro steps
- Say "stop recording" to save the macro — then say the name anytime to replay
- Supports step types: text insertion, VS Code commands, voice commands, pauses, conditional steps
- Edit macros: reorder steps, delete steps, add pauses, set language filters
- Export/import macros as JSON for sharing with teammates
- Macro execution tracking: see most-used macros, execution counts, last used timestamps
- Enable/disable individual macros without deleting them
- New setting: `voxpilot.macroRecorder.enabled` (default: true)

## [0.7.148] - 2026-06-16

### Added
- Context-aware grammar — adapt punctuation and formatting rules per language and framework
- Language-specific identifier casing: camelCase for JS/TS/Go, snake_case for Python/Rust/Shell, UPPERCASE for SQL keywords
- Auto-expand language idioms: "arrow" → `=>` in JS/TS, "self dot" → `self.` in Python, "mutable reference" → `&mut` in Rust
- Keyword normalization: ensures language keywords use correct casing (lowercase `const`/`let` in JS, uppercase `SELECT`/`FROM` in SQL)
- Markdown shortcuts: "heading one" → `# `, "bullet" → `- `, "code block" → `` ``` ``
- Shell expansions: "pipe" → `|`, "redirect" → `>`, "and then" → `&&`
- Framework-aware conventions for React, Express, Django, and Spring
- Language aliases: TSX/JSX map to TypeScript/JavaScript rules, bash/zsh map to Shell rules
- New setting: `voxpilot.contextGrammar.enabled` (default: true)

## [0.7.147] - 2026-06-15

### Added
- Streaming collaboration — real-time transcript overlay for screen recordings and streams
- Floating caption overlay panel with configurable position, size, opacity, and animation
- Auto-fade after configurable timeout to keep screen clean
- Speaker name prefix for multi-user streaming sessions
- SRT and WebVTT export for post-production subtitles
- Partial (in-progress) caption display with italic styling
- Session statistics: caption count, word count, duration, words per minute
- Customizable font size, colors, background opacity, and max width
- Animation styles: none, fade, slide, typewriter
- Commands: "VoxPilot: Start Stream Captions", "VoxPilot: Stop Stream Captions", "VoxPilot: Export Stream Captions"
- New setting: `voxpilot.streamOverlay` (default: disabled)

## [0.7.146] - 2026-06-14

### Added
- Voice-driven code review — navigate PR diffs, approve, request changes by voice
- Voice commands: "next change", "previous change", "next file", "previous file" for diff navigation
- "approve", "request changes", "submit review" with confirmation prompts for destructive actions
- "comment <text>" and "suggest <text>" for inline review comments and code suggestions
- "resolve thread", "mark as viewed", "show diff", "show files changed" for review management
- "summarize changes" for AI-generated PR summaries
- "what changed in <file>" to focus on specific file diffs
- "start review" and "submit review" for full review workflow control
- Integrates with VS Code's built-in Git and GitHub PR extension
- New setting: `voxpilot.voiceCodeReview` (default: true)

## [0.7.145] - 2026-06-13

### Added
- Speaker profiles — different voice models and settings per user for shared workstations
- Per-user ASR model selection optimized for individual voices
- Per-user vocabulary, custom commands, and noise profile settings
- Per-user dictation mode defaults (prose/code/command)
- Quick profile switching via QuickPick UI or voice command ("switch to Alice's profile")
- Optional voice fingerprint for automatic speaker detection
- Profile import/export as JSON for backup and sharing across machines
- Usage statistics tracking per profile (session count, last used)
- New commands: "VoxPilot: Manage Speaker Profiles", "VoxPilot: Switch Speaker Profile", "VoxPilot: Create Speaker Profile", "VoxPilot: Export Speaker Profile", "VoxPilot: Import Speaker Profile"
- New settings: `voxpilot.speakerProfiles.enabled`, `voxpilot.speakerProfiles.autoDetect`, `voxpilot.speakerProfiles.showInStatusBar`

## [0.7.144] - 2026-06-12

### Added
- Multi-model ensemble — run multiple ASR models in parallel and pick the best result per segment
- Four selection strategies: confidence (highest score), consensus (majority vote), perplexity (most natural language), hybrid (weighted combination of all three)
- Configurable model list — mix Moonshine, Whisper, and other backends for optimal accuracy
- Minimum confidence threshold — flag low-confidence results for manual review
- Ensemble statistics tracking — see which models win most often and overall agreement ratios
- Parallel execution — models run simultaneously, total latency equals the slowest model (50-200ms overhead)
- New command: "VoxPilot: Configure Multi-Model Ensemble" for quick setup
- New settings: `voxpilot.ensemble.enabled`, `voxpilot.ensemble.models`, `voxpilot.ensemble.strategy`, `voxpilot.ensemble.minConfidence`

## [0.7.143] - 2026-06-11

### Added
- Voice command marketplace v2 — ratings, reviews, verified publishers, and revenue sharing
- User ratings and written reviews for marketplace packs (1-5 stars)
- Verified publisher badges — trust indicators for quality packs
- Revenue sharing model (70/30 split) for premium voice command packs
- Pack versioning with automatic update checks and one-click updates
- Dependency resolution between packs — install prerequisites automatically
- Usage statistics per pack (download count, active installs)
- Report/flag system for quality control and community moderation
- Featured packs and editor's picks for discovery
- Advanced search with filters: category, language, rating, free/premium
- Browse, install, enable/disable, and uninstall packs from a unified QuickPick UI
- New commands: "VoxPilot: Voice Command Marketplace", "VoxPilot: Check Marketplace Updates"
- New settings: `voxpilot.marketplace.enabled` (default: true), `voxpilot.marketplace.autoUpdate` (default: true)
- All pack data cached locally — marketplace browsing works offline after first load

## [0.7.142] - 2026-06-10

### Added
- Usage analytics dashboard — opt-in local metrics for voice coding productivity insights
- Track words per minute, transcription accuracy trends, and most-used voice commands over time
- Daily/weekly/monthly activity breakdown with visual bar chart
- Time saved estimates (voice vs typing) calculated automatically
- Productivity insights: speed improvements, accuracy milestones, usage streaks
- Model usage breakdown showing which ASR models you use most
- Export analytics as JSON for external analysis or backup
- Clear data or disable analytics at any time — your data, your choice
- New command: "VoxPilot: Usage Analytics Dashboard" opens the interactive webview
- New settings: `voxpilot.analytics.enabled` (default: false — opt-in), `voxpilot.analytics.retentionDays` (default: 90)
- All data stays 100% local. No cloud. No telemetry. Just your personal productivity metrics.

## [0.7.141] - 2026-06-09

### Added — VoxPilot 0.8 LTS Release
- **Stable API (v0.8):** Extension API is now frozen and follows semantic versioning — breaking changes only in major versions
- **Enterprise SSO:** SAML 2.0 and OIDC authentication via Okta, Azure AD, Google, Auth0, or custom providers
- **Organization policies:** Centrally enforce feature flags, vocabulary packs, and cloud/local processing rules per user or group
- **Telemetry opt-in:** Aggregate usage metrics (words/min, command counts, error rates) with explicit opt-in — never transcript content or audio
- **Telemetry levels:** Configurable detail from crash-only to full usage metrics, always respecting VS Code telemetry settings
- **LTS designation:** This release receives security and bug fixes for 12 months (until June 2027)
- New commands: "VoxPilot: Enterprise SSO Login", "VoxPilot: Enterprise SSO Logout", "VoxPilot: Enterprise SSO Status", "VoxPilot: Telemetry Status"
- New settings: `voxpilot.enterprise.enabled`, `voxpilot.enterprise.ssoProvider`, `voxpilot.enterprise.orgId`, `voxpilot.enterprise.discoveryUrl`, `voxpilot.enterprise.clientId`, `voxpilot.enterprise.enforced`, `voxpilot.enterprise.configUrl`, `voxpilot.telemetry.optIn`, `voxpilot.telemetry.level`
- SSO tokens stored in VS Code SecretStorage (OS keychain) — no voice data sent to identity providers
- Privacy-first telemetry: no transcript content, audio data, file contents, paths, or personal identifiers ever reported

## [0.7.140] - 2026-06-08

### Added
- Performance profiler integration — voice-trigger profiling and read results aloud
- Say "start profiling" to begin a CPU profiling session with automatic performance audit collection
- Say "stop profiling" to end the session and hear a spoken summary of results
- Say "profile for N seconds" to run a timed profiling session that auto-reports
- Say "start memory profile" / "stop memory profile" for memory-focused profiling
- Say "profile results" to re-hear the last session's results via TTS readback
- Say "profile status" to check if profiling is active and see measurement count
- Say "export profile" to save profiling data as JSON for external analysis
- Performance score (0-100) calculated from pipeline latency, startup time, and slow operation ratio
- Integrates with VoxPilot's performance audit system for real operation measurement
- Results logged to dedicated "VoxPilot Profiler" output channel with detailed breakdown
- New commands: "VoxPilot: Start Profiling", "VoxPilot: Stop Profiling", "VoxPilot: Show Profiling Results", "VoxPilot: Export Profile Data"
- New setting: `voxpilot.performanceProfiler` (default: true) to enable/disable voice profiler commands

## [0.7.139] - 2026-06-07

### Added
- Offline model hub — download and manage ASR models for air-gapped environments without internet
- Export downloaded models to portable bundles with manifest and checksums for sneakernet transfer
- Import models from bundle directories with automatic SHA-256 integrity verification
- Import models directly from local directories (manually downloaded ONNX models)
- Verify installed model integrity at any time to detect corruption
- Bulk export/import support for setting up multiple air-gapped workstations
- New commands: "VoxPilot: Export Models for Offline Use", "VoxPilot: Import Models from Bundle", "VoxPilot: Import Model from Directory", "VoxPilot: Verify Model Integrity"
- New setting: `voxpilot.offlineModelHub` (default: true) to enable/disable
- Bundle manifest includes model metadata, checksums, and creation info for inventory tracking

## [0.7.138] - 2026-06-06

### Added
- Voice journaling — dictate dev notes that auto-link to current file, git branch, and commit
- Say "note", "journal", or "dev note" followed by text to capture a quick note
- Shortcut tags: "todo", "bug", "idea", "question", "decision", "review" for categorized entries
- Each entry captures rich context: active file path, cursor line, git branch, latest commit, workspace name
- "show notes" opens a searchable journal panel with click-to-navigate back to source location
- "export notes" generates a markdown report grouped by date with full context
- New commands: "VoxPilot: Open Voice Journal", "VoxPilot: Export Voice Journal", "VoxPilot: Clear Voice Journal"
- New setting: `voxpilot.voiceJournal` (default: true) to enable/disable
- Journal entries persist across sessions via workspace state
- Tag statistics and filtering by file, branch, or date

## [0.7.137] - 2026-06-05

### Added
- Custom wake words — train personalized wake word detection locally on-device
- Record 3-5 voice samples to train any custom phrase (e.g., "hey assistant", "start coding")
- Local MFCC feature extraction + Dynamic Time Warping matching — no cloud processing
- Multiple wake words supported simultaneously with individual sensitivity controls
- Built-in wake words: "hey voxpilot", "hey vox", "computer", "start listening"
- Adjustable sensitivity per wake word (strict to loose, balancing false positives vs false negatives)
- New commands: "VoxPilot: Train Custom Wake Word", "VoxPilot: Manage Wake Words", "VoxPilot: Delete Custom Wake Word"
- New settings: `voxpilot.customWakeWords` (enable/disable), `voxpilot.customWakeWords.sensitivity`, `voxpilot.customWakeWords.trainingSamples`
- Training progress UI with cancellation support
- Wake words persist across sessions via workspace state

## [0.7.136] - 2026-06-04

### Added
- Accessibility audit mode — WCAG compliance checker triggered by voice commands
- Say "check accessibility", "wcag check", or "a11y audit" to scan the current file for WCAG 2.1 issues
- Category-specific audits: "check contrast", "check alt text", "check aria", "check headings", "check labels"
- Checks 12 WCAG criteria: alt text (1.1.1), heading hierarchy (1.3.1), form labels (3.3.2), ARIA roles (4.1.2), color contrast hints (1.4.3), lang attribute (3.1.1), duplicate IDs (4.1.1), skip navigation (2.4.1), keyboard accessibility (2.1.1), page title (2.4.2), auto-play media (1.4.2), empty interactive elements (2.4.4)
- Results appear as VS Code diagnostics in the Problems panel with WCAG criterion codes
- "accessibility report" generates a summary report in a side panel
- "clear accessibility" removes all audit diagnostics
- "fix accessibility" triggers Quick Fix on the current issue
- Supports HTML, JSX, TSX, Vue, Svelte, PHP templates, ERB, EJS, Handlebars, Razor
- New commands: "VoxPilot: Run Accessibility Audit", "VoxPilot: Clear Accessibility Audit"
- New setting: `voxpilot.accessibilityAudit` (default: true) to enable/disable

## [0.7.134] - 2026-06-03

### Added
- Voice-driven terminal — run shell commands, navigate output, and manage terminals entirely by voice
- Execute arbitrary commands: say "run <command>" or "terminal <command>" to run anything in the integrated terminal
- npm shortcuts: "npm install <package>", "npm run <script>" for quick package management
- Directory navigation: "change directory <path>" or "cd <path>"
- Terminal management: "new terminal", "close terminal", "next terminal", "previous terminal"
- Output navigation: "scroll up", "scroll down" to browse command output
- Process control: "kill process" sends SIGINT (Ctrl+C) to stop running processes
- Utility commands: "list files" (ls/dir), "clear terminal"
- Safety checks: destructive commands (rm -rf, format, drop) require voice confirmation before execution
- New setting: `voxpilot.voiceTerminal` (default: true) to enable/disable

## [0.7.132] - 2026-06-02

### Added
- Multi-speaker diarization — identify and label different speakers in pair programming sessions
- Automatic speaker segmentation using sliding-window classification (500ms windows)
- Speaker labels on transcript segments (e.g. "[Alice] hello world [Bob] hi there")
- Speaker change detection using energy + pitch + brightness transitions
- Support for 2-4 speakers (pair and mob programming scenarios)
- Real-time speaker tracking via `RealtimeSpeakerTracker` with majority-vote smoothing
- Speaker timeline generation for the history panel (e.g. "Alice (0:00-0:15) → Bob (0:15-0:32)")
- Multi-chunk calibration for more robust voice profiles (`buildProfileFromChunks`)
- Minimum segment duration merging to eliminate noisy short classifications
- Confidence-based speaker attribution (below threshold → "Unknown")
- Builds on existing pair programming voice profiles — enable via `voxpilot.pairProgramming`

## [0.7.130] - 2026-06-01

### Added
- Ambient listening mode — always-on low-power background listener that activates full recording on wake word detection
- Adaptive duty cycling: skips silent frames entirely, only processes audio above energy floor
- Three power modes (low/balanced/performance) controlling CPU usage vs responsiveness
- Auto-suspend when VS Code window loses focus (optional, saves battery)
- Auto-resume after recording sessions end
- Status bar indicator showing ambient state (active/paused)
- Stats tracking: wake detections, windows processed/skipped, duty cycle percentage
- New command: "VoxPilot: Toggle Ambient Listening Mode"
- New settings: `voxpilot.ambientListening`, `ambientListening.powerMode`, `ambientListening.showIndicator`, `ambientListening.autoResume`, `ambientListening.suspendOnBlur`
- Supersedes basic wake word detection with smarter power management

## [0.7.128] - 2026-05-31

### Added
- Enhanced voice-driven git with 10 new commands for complete repository control by voice
- `amend` / `amend <message>` — amend the last commit (with or without new message)
- `force push` — git push --force-with-lease (with safety confirmation)
- `fetch` — git fetch from remote
- `cherry pick <ref>` — cherry-pick a specific commit
- `rebase <branch>` — rebase onto a branch (with safety confirmation)
- `blame` — git blame on the current file
- `branches` / `list branches` — show all branches (local + remote)
- `stage file <path>` — stage a specific file instead of all
- `tag <name>` — create a lightweight tag
- Dangerous operations (force push, rebase, discard) now all require explicit confirmation
- Branch name sanitization for cherry-pick refs and tag names

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
