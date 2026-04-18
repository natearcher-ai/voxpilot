/**
 * Offline model manager — download, cache, and switch between ASR models
 * with progress UI and disk usage tracking.
 *
 * Provides a comprehensive model management experience:
 *   - Browse available models with size, accuracy, and speed info
 *   - Download models with progress bar and cancel support
 *   - Track disk usage per model
 *   - Delete unused models to free space
 *   - Verify model integrity (checksum)
 *   - Auto-download recommended model on first use
 *
 * All models are stored in the extension's global storage directory.
 *
 * Enable via `voxpilot.offlineModelManager` setting (default: true).
 */

export interface ModelInfo {
  /** Unique model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model family (moonshine, whisper, parakeet) */
  family: 'moonshine' | 'whisper' | 'parakeet';
  /** Model size in bytes */
  sizeBytes: number;
  /** Supported languages (empty = English only) */
  languages: string[];
  /** Relative accuracy score (1-10) */
  accuracy: number;
  /** Relative speed score (1-10, higher = faster) */
  speed: number;
  /** ONNX repo for download */
  repo: string;
  /** Whether this model is recommended for most users */
  recommended: boolean;
  /** Description of model characteristics */
  description: string;
}

export interface DownloadedModel {
  /** Model ID */
  id: string;
  /** Path to model files on disk */
  path: string;
  /** Size on disk in bytes */
  diskSizeBytes: number;
  /** When it was downloaded */
  downloadedAt: string;
  /** SHA256 checksum of the model file */
  checksum?: string;
  /** Last used timestamp */
  lastUsedAt?: string;
}

export interface DownloadProgress {
  /** Model being downloaded */
  modelId: string;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Estimated time remaining in seconds */
  etaSeconds?: number;
  /** Download speed in bytes/sec */
  speedBps?: number;
}

/** Available models catalog */
export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: 'moonshine-tiny',
    name: 'Moonshine Tiny',
    family: 'moonshine',
    sizeBytes: 27_000_000,
    languages: [],
    accuracy: 6,
    speed: 10,
    repo: 'onnx-community/moonshine-tiny-ONNX',
    recommended: false,
    description: 'Fastest model, good for quick commands. English only. 27MB.',
  },
  {
    id: 'moonshine-base',
    name: 'Moonshine Base',
    family: 'moonshine',
    sizeBytes: 65_000_000,
    languages: [],
    accuracy: 8,
    speed: 9,
    repo: 'onnx-community/moonshine-base-ONNX',
    recommended: true,
    description: 'Best balance of speed and accuracy. English only. 65MB. Recommended.',
  },
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    family: 'whisper',
    sizeBytes: 75_000_000,
    languages: ['99 languages'],
    accuracy: 5,
    speed: 8,
    repo: 'onnx-community/whisper-tiny',
    recommended: false,
    description: 'Smallest multilingual model. 99 languages. 75MB.',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    family: 'whisper',
    sizeBytes: 142_000_000,
    languages: ['99 languages'],
    accuracy: 7,
    speed: 7,
    repo: 'onnx-community/whisper-base',
    recommended: false,
    description: 'Good multilingual accuracy. 99 languages. 142MB.',
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    family: 'whisper',
    sizeBytes: 466_000_000,
    languages: ['99 languages'],
    accuracy: 8,
    speed: 5,
    repo: 'onnx-community/whisper-small',
    recommended: false,
    description: 'High accuracy multilingual. 99 languages. 466MB.',
  },
  {
    id: 'whisper-medium',
    name: 'Whisper Medium',
    family: 'whisper',
    sizeBytes: 1_500_000_000,
    languages: ['99 languages'],
    accuracy: 9,
    speed: 3,
    repo: 'onnx-community/whisper-medium',
    recommended: false,
    description: 'Very high accuracy. Best for CJK and complex scripts. 1.5GB.',
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    family: 'whisper',
    sizeBytes: 1_600_000_000,
    languages: ['99 languages'],
    accuracy: 10,
    speed: 2,
    repo: 'onnx-community/whisper-large-v3-turbo',
    recommended: false,
    description: 'Maximum accuracy. 99 languages. 1.6GB. Requires significant RAM.',
  },
  {
    id: 'parakeet-tdt-0.6b',
    name: 'Parakeet TDT 0.6B',
    family: 'parakeet',
    sizeBytes: 600_000_000,
    languages: [],
    accuracy: 9,
    speed: 6,
    repo: 'onnx-community/parakeet-tdt-0.6b',
    recommended: false,
    description: 'NVIDIA Parakeet. High accuracy English. Streaming support. 600MB.',
  },
];

/**
 * Format bytes as human-readable size.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  if (bytes < 1024 * 1024 * 1024) { return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format download speed.
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) { return `${Math.round(bytesPerSec)} B/s`; }
  if (bytesPerSec < 1024 * 1024) { return `${(bytesPerSec / 1024).toFixed(1)} KB/s`; }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`; 
}

/**
 * Calculate total disk usage of downloaded models.
 */
export function totalDiskUsage(models: DownloadedModel[]): number {
  return models.reduce((sum, m) => sum + m.diskSizeBytes, 0);
}

/**
 * Find models that haven't been used in N days.
 */
export function findUnusedModels(models: DownloadedModel[], daysThreshold: number = 30): DownloadedModel[] {
  const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000;
  return models.filter(m => {
    if (!m.lastUsedAt) { return true; }
    return new Date(m.lastUsedAt).getTime() < cutoff;
  });
}

/**
 * Get the recommended model for a given use case.
 */
export function getRecommendedModel(multilingual: boolean): ModelInfo {
  if (multilingual) {
    return MODEL_CATALOG.find(m => m.id === 'whisper-base')!;
  }
  return MODEL_CATALOG.find(m => m.recommended)!;
}

/**
 * Compare two models for the model picker UI.
 */
export function compareModels(a: ModelInfo, b: ModelInfo): {
  sizeRatio: string;
  accuracyDiff: number;
  speedDiff: number;
  recommendation: string;
} {
  const sizeRatio = a.sizeBytes > b.sizeBytes
    ? `${(a.sizeBytes / b.sizeBytes).toFixed(1)}x larger`
    : `${(b.sizeBytes / a.sizeBytes).toFixed(1)}x smaller`;

  const accuracyDiff = a.accuracy - b.accuracy;
  const speedDiff = a.speed - b.speed;

  let recommendation = '';
  if (accuracyDiff > 0 && speedDiff >= 0) {
    recommendation = `${a.name} is better in every way`;
  } else if (accuracyDiff > 0 && speedDiff < 0) {
    recommendation = `${a.name} is more accurate but slower`;
  } else if (accuracyDiff < 0 && speedDiff > 0) {
    recommendation = `${a.name} is faster but less accurate`;
  } else {
    recommendation = `${b.name} is better in every way`;
  }

  return { sizeRatio, accuracyDiff, speedDiff, recommendation };
}
