import * as vscode from 'vscode';

export interface LanguageOption {
  code: string;
  name: string;
}

/**
 * Whisper-supported languages (ISO 639-1 codes).
 * Moonshine and Parakeet are English-only — language selection is ignored for those models.
 */
const WHISPER_LANGUAGES: LanguageOption[] = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'ca', name: 'Catalan' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ar', name: 'Arabic' },
  { code: 'sv', name: 'Swedish' },
  { code: 'it', name: 'Italian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fi', name: 'Finnish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'he', name: 'Hebrew' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'el', name: 'Greek' },
  { code: 'ms', name: 'Malay' },
  { code: 'cs', name: 'Czech' },
  { code: 'ro', name: 'Romanian' },
  { code: 'da', name: 'Danish' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ta', name: 'Tamil' },
  { code: 'no', name: 'Norwegian' },
  { code: 'th', name: 'Thai' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hr', name: 'Croatian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'la', name: 'Latin' },
  { code: 'mi', name: 'Maori' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'cy', name: 'Welsh' },
  { code: 'sk', name: 'Slovak' },
  { code: 'te', name: 'Telugu' },
  { code: 'fa', name: 'Persian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'sr', name: 'Serbian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'kn', name: 'Kannada' },
  { code: 'et', name: 'Estonian' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'br', name: 'Breton' },
  { code: 'eu', name: 'Basque' },
  { code: 'is', name: 'Icelandic' },
  { code: 'hy', name: 'Armenian' },
  { code: 'ne', name: 'Nepali' },
  { code: 'ka', name: 'Georgian' },
  { code: 'gl', name: 'Galician' },
  { code: 'mr', name: 'Marathi' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'si', name: 'Sinhala' },
  { code: 'km', name: 'Khmer' },
  { code: 'sn', name: 'Shona' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'so', name: 'Somali' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'oc', name: 'Occitan' },
  { code: 'jw', name: 'Javanese' },
  { code: 'su', name: 'Sundanese' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'ha', name: 'Hausa' },
  { code: 'sw', name: 'Swahili' },
  { code: 'ln', name: 'Lingala' },
  { code: 'ba', name: 'Bashkir' },
  { code: 'bo', name: 'Tibetan' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'my', name: 'Myanmar' },
  { code: 'lo', name: 'Lao' },
  { code: 'mt', name: 'Maltese' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'as', name: 'Assamese' },
  { code: 'tt', name: 'Tatar' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'am', name: 'Amharic' },
  { code: 'be', name: 'Belarusian' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'sq', name: 'Albanian' },
  { code: 'fo', name: 'Faroese' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'ps', name: 'Pashto' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'nn', name: 'Nynorsk' },
  { code: 'sd', name: 'Sindhi' },
];

/** Models that only support English — language selection is ignored. */
const ENGLISH_ONLY_MODELS = ['moonshine-tiny', 'moonshine-base', 'parakeet-tdt-0.6b'];

export function isMultilingualModel(modelId: string): boolean {
  return !ENGLISH_ONLY_MODELS.includes(modelId);
}

export function getLanguageName(code: string): string {
  if (code === 'auto') { return 'Auto-detect'; }
  const lang = WHISPER_LANGUAGES.find(l => l.code === code);
  return lang?.name ?? code;
}

export async function showLanguageSelector(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('voxpilot');
  const modelId = config.get<string>('model', 'moonshine-base');
  const currentLang = config.get<string>('language', 'auto');

  if (!isMultilingualModel(modelId)) {
    vscode.window.showInformationMessage(
      `VoxPilot: ${modelId} is English-only. Switch to a Whisper model to use other languages.`,
    );
    return undefined;
  }

  const items = WHISPER_LANGUAGES.map(lang => ({
    label: lang.code === currentLang ? `$(check) ${lang.name}` : lang.name,
    description: lang.code,
    code: lang.code,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Select transcription language (current: ${getLanguageName(currentLang)})`,
    matchOnDescription: true,
  });

  if (pick) {
    await config.update('language', pick.code, true);
    return pick.code;
  }
  return undefined;
}
