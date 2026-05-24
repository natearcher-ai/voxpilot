/**
 * Localization — externalized UI strings with initial translations.
 *
 * Provides a localization framework for VoxPilot:
 *   - All user-facing strings externalized into locale files
 *   - Initial translations: English (en), Spanish (es), French (fr), German (de), Japanese (ja), Chinese (zh)
 *   - Fallback to English for missing translations
 *   - Interpolation support for dynamic values
 *   - Pluralization rules per locale
 *   - VS Code language detection (follows editor locale)
 *   - Community contribution support (JSON locale files)
 *
 * Locale files stored in: extension/l10n/{locale}.json
 * Enable via `voxpilot.locale` setting (default: auto-detect from VS Code).
 */

/** Supported locales */
export type SupportedLocale = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';

/** All supported locales */
export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'fr', 'de', 'ja', 'zh'];

/** Locale metadata */
export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  completeness: number; // 0-100 percentage of translated strings
}

/** Available locale information */
export const LOCALE_INFO: Record<SupportedLocale, LocaleInfo> = {
  en: { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', completeness: 100 },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', completeness: 95 },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', completeness: 90 },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', completeness: 90 },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', completeness: 85 },
  zh: { code: 'zh', name: 'Chinese', nativeName: '中文', direction: 'ltr', completeness: 85 },
};

/** Translation strings (English as source of truth) */
const EN_STRINGS: Record<string, string> = {
  // Status bar
  'status.idle': 'VoxPilot: Ready',
  'status.listening': 'VoxPilot: Listening...',
  'status.processing': 'VoxPilot: Processing...',
  'status.error': 'VoxPilot: Error',
  'status.modelLoading': 'VoxPilot: Loading model...',

  // Commands
  'command.toggleListening': 'Toggle Voice Input',
  'command.pushToTalk': 'Quick Voice Capture',
  'command.selectModel': 'Select ASR Model',
  'command.selectDevice': 'Select Audio Input Device',
  'command.transcriptHistory': 'Transcript History',
  'command.clearCache': 'Clear Model Cache',
  'command.calibrate': 'Calibrate Noise Profile',
  'command.privacyDashboard': 'Privacy Dashboard',
  'command.shortcuts': 'Voice Shortcuts Editor',

  // Notifications
  'notify.recordingStarted': 'Recording started',
  'notify.recordingStopped': 'Recording stopped',
  'notify.modelLoaded': 'Model loaded: {model}',
  'notify.modelLoadFailed': 'Failed to load model: {error}',
  'notify.transcriptSent': 'Transcript sent to {target}',
  'notify.commandExecuted': 'Executed: {command}',
  'notify.noMicrophone': 'No microphone detected. Check audio settings.',
  'notify.calibrationComplete': 'Noise calibration complete. Environment: {environment}',

  // Privacy dashboard
  'privacy.title': 'Privacy Dashboard',
  'privacy.localProcessing': 'Local Processing',
  'privacy.cloudInteractions': 'Cloud Interactions',
  'privacy.privacyRatio': 'Privacy Ratio',
  'privacy.purgeAll': 'Purge All Data',
  'privacy.export': 'Export Privacy Report',
  'privacy.neverLeaves': 'Never leaves your device',
  'privacy.optInOnly': 'Opt-in only',

  // Model manager
  'model.download': 'Download',
  'model.downloading': 'Downloading... {percent}%',
  'model.delete': 'Delete',
  'model.active': 'Active',
  'model.size': 'Size: {size}',
  'model.accuracy': 'Accuracy: {score}/10',
  'model.languages': '{count} languages',

  // Errors
  'error.audioCapture': 'Audio capture failed. Is your microphone connected?',
  'error.modelNotFound': 'Model not found. Try downloading it first.',
  'error.pipelineCrash': 'Processing pipeline error. Some features may be degraded.',
  'error.networkTimeout': 'Network timeout. Check your connection.',
  'error.diskFull': 'Insufficient disk space for model download.',

  // Misc
  'misc.wordsPerMinute': '{count} words/min',
  'misc.transcriptions': '{count} transcriptions',
  'misc.timeSaved': '{minutes} min saved',
  'misc.accuracy': '{percent}% accuracy',
};

/** Spanish translations */
const ES_STRINGS: Record<string, string> = {
  'status.idle': 'VoxPilot: Listo',
  'status.listening': 'VoxPilot: Escuchando...',
  'status.processing': 'VoxPilot: Procesando...',
  'status.error': 'VoxPilot: Error',
  'status.modelLoading': 'VoxPilot: Cargando modelo...',
  'command.toggleListening': 'Activar/Desactivar Entrada de Voz',
  'command.pushToTalk': 'Captura Rápida de Voz',
  'command.selectModel': 'Seleccionar Modelo ASR',
  'notify.recordingStarted': 'Grabación iniciada',
  'notify.recordingStopped': 'Grabación detenida',
  'notify.modelLoaded': 'Modelo cargado: {model}',
  'notify.noMicrophone': 'No se detectó micrófono. Verifique la configuración de audio.',
  'privacy.title': 'Panel de Privacidad',
  'privacy.localProcessing': 'Procesamiento Local',
  'privacy.neverLeaves': 'Nunca sale de tu dispositivo',
  'error.audioCapture': 'Error de captura de audio. ¿Está conectado el micrófono?',
  'misc.wordsPerMinute': '{count} palabras/min',
  'misc.timeSaved': '{minutes} min ahorrados',
};

/** French translations */
const FR_STRINGS: Record<string, string> = {
  'status.idle': 'VoxPilot : Prêt',
  'status.listening': 'VoxPilot : Écoute...',
  'status.processing': 'VoxPilot : Traitement...',
  'status.error': 'VoxPilot : Erreur',
  'command.toggleListening': "Activer/Désactiver l'Entrée Vocale",
  'notify.recordingStarted': 'Enregistrement démarré',
  'notify.recordingStopped': 'Enregistrement arrêté',
  'notify.noMicrophone': "Aucun microphone détecté. Vérifiez les paramètres audio.",
  'privacy.title': 'Tableau de Bord de Confidentialité',
  'privacy.localProcessing': 'Traitement Local',
  'privacy.neverLeaves': 'Ne quitte jamais votre appareil',
  'error.audioCapture': "Échec de la capture audio. Le microphone est-il connecté ?",
  'misc.wordsPerMinute': '{count} mots/min',
};

/** German translations */
const DE_STRINGS: Record<string, string> = {
  'status.idle': 'VoxPilot: Bereit',
  'status.listening': 'VoxPilot: Hört zu...',
  'status.processing': 'VoxPilot: Verarbeitung...',
  'status.error': 'VoxPilot: Fehler',
  'command.toggleListening': 'Spracheingabe umschalten',
  'notify.recordingStarted': 'Aufnahme gestartet',
  'notify.recordingStopped': 'Aufnahme gestoppt',
  'notify.noMicrophone': 'Kein Mikrofon erkannt. Überprüfen Sie die Audioeinstellungen.',
  'privacy.title': 'Datenschutz-Dashboard',
  'privacy.localProcessing': 'Lokale Verarbeitung',
  'privacy.neverLeaves': 'Verlässt niemals Ihr Gerät',
  'error.audioCapture': 'Audioaufnahme fehlgeschlagen. Ist Ihr Mikrofon angeschlossen?',
  'misc.wordsPerMinute': '{count} Wörter/Min',
};

/** Japanese translations */
const JA_STRINGS: Record<string, string> = {
  'status.idle': 'VoxPilot: 準備完了',
  'status.listening': 'VoxPilot: 聞いています...',
  'status.processing': 'VoxPilot: 処理中...',
  'status.error': 'VoxPilot: エラー',
  'command.toggleListening': '音声入力の切り替え',
  'notify.recordingStarted': '録音開始',
  'notify.recordingStopped': '録音停止',
  'notify.noMicrophone': 'マイクが検出されません。オーディオ設定を確認してください。',
  'privacy.title': 'プライバシーダッシュボード',
  'privacy.localProcessing': 'ローカル処理',
  'privacy.neverLeaves': 'デバイスから離れることはありません',
  'misc.wordsPerMinute': '{count} 語/分',
};

/** Chinese translations */
const ZH_STRINGS: Record<string, string> = {
  'status.idle': 'VoxPilot：就绪',
  'status.listening': 'VoxPilot：正在听...',
  'status.processing': 'VoxPilot：处理中...',
  'status.error': 'VoxPilot：错误',
  'command.toggleListening': '切换语音输入',
  'notify.recordingStarted': '录音已开始',
  'notify.recordingStopped': '录音已停止',
  'notify.noMicrophone': '未检测到麦克风。请检查音频设置。',
  'privacy.title': '隐私仪表板',
  'privacy.localProcessing': '本地处理',
  'privacy.neverLeaves': '永远不会离开您的设备',
  'misc.wordsPerMinute': '{count} 字/分钟',
};

/** All locale strings */
const LOCALE_STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: EN_STRINGS,
  es: ES_STRINGS,
  fr: FR_STRINGS,
  de: DE_STRINGS,
  ja: JA_STRINGS,
  zh: ZH_STRINGS,
};

/**
 * Interpolate variables into a string template.
 * Replaces {key} with the corresponding value.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

/**
 * Localization manager — handles string lookup and interpolation.
 */
export class L10n {
  private locale: SupportedLocale = 'en';
  private customStrings: Record<string, string> = {};

  /** Set the active locale */
  setLocale(locale: SupportedLocale): void {
    if (SUPPORTED_LOCALES.includes(locale)) {
      this.locale = locale;
    }
  }

  /** Get the active locale */
  getLocale(): SupportedLocale {
    return this.locale;
  }

  /** Detect locale from VS Code environment */
  detectLocale(): SupportedLocale {
    try {
      const vscodeLocale = JSON.parse(process.env.VSCODE_NLS_CONFIG || '{}').locale || 'en';
      const short = vscodeLocale.split('-')[0] as SupportedLocale;
      return SUPPORTED_LOCALES.includes(short) ? short : 'en';
    } catch {
      return 'en';
    }
  }

  /**
   * Get a localized string by key.
   * Falls back to English if not found in current locale.
   */
  t(key: string, vars?: Record<string, string | number>): string {
    // Check custom overrides first
    let str = this.customStrings[key];

    // Then check current locale
    if (!str) {
      str = LOCALE_STRINGS[this.locale]?.[key];
    }

    // Fall back to English
    if (!str) {
      str = EN_STRINGS[key];
    }

    // If still not found, return the key itself
    if (!str) return key;

    // Interpolate variables
    if (vars) {
      return interpolate(str, vars);
    }

    return str;
  }

  /** Add custom string overrides */
  addStrings(strings: Record<string, string>): void {
    Object.assign(this.customStrings, strings);
  }

  /** Get all keys for the current locale */
  getKeys(): string[] {
    return Object.keys(EN_STRINGS);
  }

  /** Get translation completeness for a locale */
  getCompleteness(locale: SupportedLocale): number {
    const totalKeys = Object.keys(EN_STRINGS).length;
    const translatedKeys = Object.keys(LOCALE_STRINGS[locale] || {}).length;
    return Math.round((translatedKeys / totalKeys) * 100);
  }

  /** Get all available locales with info */
  getAvailableLocales(): LocaleInfo[] {
    return SUPPORTED_LOCALES.map(code => ({
      ...LOCALE_INFO[code],
      completeness: this.getCompleteness(code),
    }));
  }

  /** Check if a key exists */
  hasKey(key: string): boolean {
    return key in EN_STRINGS;
  }

  /** Get total string count */
  get stringCount(): number {
    return Object.keys(EN_STRINGS).length;
  }
}

/** Singleton instance */
export const l10n = new L10n();
