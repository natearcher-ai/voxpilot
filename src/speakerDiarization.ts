/**
 * Multi-speaker diarization — identify and label different speakers
 * in pair programming sessions.
 *
 * Builds on the pair programming voice profiles but adds:
 *   - Automatic speaker segmentation within a recording session
 *   - Speaker labels on transcript segments (e.g. "[Alice] hello world")
 *   - Speaker change detection using energy + pitch + brightness transitions
 *   - Support for 2-4 speakers (typical pair/mob programming scenarios)
 *   - Speaker timeline for the history panel
 *   - Real-time speaker identification during streaming transcription
 *
 * Uses a sliding-window approach: each 500ms window is classified to a
 * speaker, and consecutive windows from the same speaker are merged into
 * segments. Speaker changes are detected when the classification flips
 * with sufficient confidence.
 *
 * Enable via `voxpilot.pairProgramming` setting (must be true) — diarization
 * activates automatically when pair programming mode is on and profiles exist.
 */

import {
  VoiceProfile,
  estimatePitchFromZCR,
  computeEnergy,
  computeBrightness,
  buildProfile,
} from './pairProgramming';

/** A labeled segment of speech attributed to a speaker */
export interface DiarizedSegment {
  /** Speaker profile name */
  speaker: string;
  /** Start time offset in milliseconds from recording start */
  startMs: number;
  /** End time offset in milliseconds from recording start */
  endMs: number;
  /** Confidence of speaker attribution (0-1) */
  confidence: number;
  /** Transcribed text for this segment (filled after ASR) */
  text?: string;
}

/** Timeline of speaker segments for a full recording session */
export interface DiarizationResult {
  /** Ordered list of speaker segments */
  segments: DiarizedSegment[];
  /** Speaker profiles used for classification */
  profiles: VoiceProfile[];
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Number of speaker changes detected */
  speakerChanges: number;
}

/** Configuration for the diarization engine */
export interface DiarizationConfig {
  /** Window size in milliseconds for speaker classification */
  windowMs: number;
  /** Minimum confidence to assign a speaker (below this = "Unknown") */
  minConfidence: number;
  /** Minimum segment duration in ms (shorter segments are merged with neighbors) */
  minSegmentMs: number;
  /** Maximum number of speakers to track */
  maxSpeakers: number;
  /** Whether to show speaker labels in transcript output */
  showLabels: boolean;
  /** Sample rate of input audio */
  sampleRate: number;
}

const DEFAULT_CONFIG: DiarizationConfig = {
  windowMs: 500,
  minConfidence: 0.35,
  minSegmentMs: 300,
  maxSpeakers: 4,
  showLabels: true,
  sampleRate: 16000,
};

/**
 * Classify a single audio window against all known profiles.
 * Returns the best matching speaker and confidence.
 */
export function classifyWindow(
  samples: Float32Array,
  sampleRate: number,
  profiles: VoiceProfile[],
): { speaker: string; confidence: number } {
  if (profiles.length === 0) {
    return { speaker: 'Unknown', confidence: 0 };
  }

  const energy = computeEnergy(samples);
  const pitch = estimatePitchFromZCR(samples, sampleRate);
  const brightness = computeBrightness(samples, sampleRate);

  // Skip silence (very low energy)
  if (energy < 0.005) {
    return { speaker: 'Silence', confidence: 1.0 };
  }

  // Compute distance to each profile
  const distances = profiles.map(profile => {
    const dEnergy = (energy - profile.avgEnergy) / Math.max(profile.avgEnergy, 0.001);
    const dPitch = (pitch - profile.avgPitch) / Math.max(profile.avgPitch, 1);
    const dBright = (brightness - profile.avgBrightness) / Math.max(profile.avgBrightness, 0.001);

    // Pitch is strongest discriminator, brightness second
    return Math.sqrt(
      dEnergy * dEnergy +
      dPitch * dPitch * 4 +
      dBright * dBright * 2,
    );
  });

  // Find the two closest profiles
  const sorted = distances
    .map((d, i) => ({ distance: d, index: i }))
    .sort((a, b) => a.distance - b.distance);

  const bestIdx = sorted[0].index;
  const bestDist = sorted[0].distance;
  const secondDist = sorted.length > 1 ? sorted[1].distance : bestDist * 2;

  // Confidence based on separation between best and second-best match
  const separation = secondDist - bestDist;
  const confidence = Math.min(1, Math.max(0, separation / (bestDist + 0.01)));

  return {
    speaker: profiles[bestIdx].name,
    confidence,
  };
}

/**
 * Perform speaker diarization on a complete audio buffer.
 * Segments the audio into speaker-attributed chunks.
 */
export function diarize(
  audioBuffer: Float32Array,
  profiles: VoiceProfile[],
  config: Partial<DiarizationConfig> = {},
): DiarizationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const windowSamples = Math.floor((cfg.windowMs / 1000) * cfg.sampleRate);
  const totalDurationMs = (audioBuffer.length / cfg.sampleRate) * 1000;

  if (profiles.length === 0 || audioBuffer.length < windowSamples) {
    return {
      segments: [{
        speaker: 'Unknown',
        startMs: 0,
        endMs: totalDurationMs,
        confidence: 0,
      }],
      profiles,
      totalDurationMs,
      speakerChanges: 0,
    };
  }

  // Classify each window
  const rawSegments: Array<{ speaker: string; confidence: number; startMs: number; endMs: number }> = [];

  for (let offset = 0; offset + windowSamples <= audioBuffer.length; offset += windowSamples) {
    const window = audioBuffer.subarray(offset, offset + windowSamples);
    const startMs = (offset / cfg.sampleRate) * 1000;
    const endMs = ((offset + windowSamples) / cfg.sampleRate) * 1000;

    const { speaker, confidence } = classifyWindow(window, cfg.sampleRate, profiles);

    // Apply minimum confidence threshold
    const assignedSpeaker = (speaker === 'Silence' || confidence >= cfg.minConfidence)
      ? speaker
      : 'Unknown';

    rawSegments.push({ speaker: assignedSpeaker, confidence, startMs, endMs });
  }

  // Merge consecutive windows from the same speaker
  const merged = mergeSegments(rawSegments, cfg.minSegmentMs);

  // Filter out silence segments and count speaker changes
  const speechSegments = merged.filter(s => s.speaker !== 'Silence');
  let speakerChanges = 0;
  for (let i = 1; i < speechSegments.length; i++) {
    if (speechSegments[i].speaker !== speechSegments[i - 1].speaker) {
      speakerChanges++;
    }
  }

  return {
    segments: speechSegments,
    profiles,
    totalDurationMs,
    speakerChanges,
  };
}

/**
 * Merge consecutive segments from the same speaker.
 * Also merges very short segments into their neighbors.
 */
function mergeSegments(
  segments: Array<{ speaker: string; confidence: number; startMs: number; endMs: number }>,
  minSegmentMs: number,
): DiarizedSegment[] {
  if (segments.length === 0) { return []; }

  const merged: DiarizedSegment[] = [];
  let current: DiarizedSegment = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.speaker === current.speaker) {
      // Extend current segment
      current.endMs = seg.endMs;
      current.confidence = (current.confidence + seg.confidence) / 2;
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  merged.push(current);

  // Merge segments shorter than minimum into neighbors
  const result: DiarizedSegment[] = [];
  for (const seg of merged) {
    const duration = seg.endMs - seg.startMs;
    if (duration < minSegmentMs && result.length > 0) {
      // Merge into previous segment
      result[result.length - 1].endMs = seg.endMs;
    } else {
      result.push(seg);
    }
  }

  return result;
}

/**
 * Format a diarized transcript with speaker labels.
 * Example output: "[Alice] Hello world. [Bob] How are you?"
 */
export function formatDiarizedTranscript(segments: DiarizedSegment[]): string {
  const parts: string[] = [];
  let lastSpeaker = '';

  for (const seg of segments) {
    if (!seg.text || seg.text.trim().length === 0) { continue; }
    if (seg.speaker !== lastSpeaker && seg.speaker !== 'Unknown') {
      parts.push(`[${seg.speaker}] ${seg.text.trim()}`);
      lastSpeaker = seg.speaker;
    } else {
      parts.push(seg.text.trim());
    }
  }

  return parts.join(' ');
}

/**
 * Real-time speaker tracker for streaming transcription.
 * Maintains a running classification over recent audio windows.
 */
export class RealtimeSpeakerTracker {
  private profiles: VoiceProfile[];
  private config: DiarizationConfig;
  private recentClassifications: Array<{ speaker: string; confidence: number }> = [];
  private readonly historySize = 5; // Keep last 5 windows for smoothing
  private _currentSpeaker = 'Unknown';
  private _currentConfidence = 0;

  constructor(profiles: VoiceProfile[], config: Partial<DiarizationConfig> = {}) {
    this.profiles = profiles;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Get the currently identified speaker */
  get currentSpeaker(): string { return this._currentSpeaker; }
  /** Get confidence of current speaker identification */
  get currentConfidence(): number { return this._currentConfidence; }

  /**
   * Process a new audio window and update the current speaker.
   * Returns true if the speaker changed.
   */
  processWindow(samples: Float32Array): boolean {
    const { speaker, confidence } = classifyWindow(samples, this.config.sampleRate, this.profiles);

    if (speaker === 'Silence') { return false; }

    this.recentClassifications.push({ speaker, confidence });
    if (this.recentClassifications.length > this.historySize) {
      this.recentClassifications.shift();
    }

    // Majority vote over recent classifications
    const votes = new Map<string, { count: number; totalConf: number }>();
    for (const cls of this.recentClassifications) {
      const existing = votes.get(cls.speaker) || { count: 0, totalConf: 0 };
      existing.count++;
      existing.totalConf += cls.confidence;
      votes.set(cls.speaker, existing);
    }

    let bestSpeaker = 'Unknown';
    let bestCount = 0;
    let bestConf = 0;
    for (const [spk, data] of votes) {
      if (data.count > bestCount || (data.count === bestCount && data.totalConf > bestConf)) {
        bestSpeaker = spk;
        bestCount = data.count;
        bestConf = data.totalConf;
      }
    }

    const prevSpeaker = this._currentSpeaker;
    const avgConf = bestConf / bestCount;

    if (avgConf >= this.config.minConfidence) {
      this._currentSpeaker = bestSpeaker;
      this._currentConfidence = avgConf;
    } else {
      this._currentSpeaker = 'Unknown';
      this._currentConfidence = avgConf;
    }

    return prevSpeaker !== this._currentSpeaker;
  }

  /** Update profiles (e.g. after re-calibration) */
  updateProfiles(profiles: VoiceProfile[]): void {
    this.profiles = profiles;
    this.recentClassifications = [];
    this._currentSpeaker = 'Unknown';
    this._currentConfidence = 0;
  }

  /** Reset tracking state */
  reset(): void {
    this.recentClassifications = [];
    this._currentSpeaker = 'Unknown';
    this._currentConfidence = 0;
  }
}

/**
 * Build a voice profile from multiple calibration chunks.
 * Averages characteristics across all chunks for a more robust profile.
 */
export function buildProfileFromChunks(
  name: string,
  chunks: Float32Array[],
  sampleRate: number,
  target: VoiceProfile['target'] = 'editor',
): VoiceProfile {
  if (chunks.length === 0) {
    return { name, avgEnergy: 0, avgPitch: 0, avgBrightness: 0, target };
  }

  let totalEnergy = 0;
  let totalPitch = 0;
  let totalBrightness = 0;
  let validChunks = 0;

  for (const chunk of chunks) {
    const energy = computeEnergy(chunk);
    if (energy < 0.005) { continue; } // Skip silence

    totalEnergy += energy;
    totalPitch += estimatePitchFromZCR(chunk, sampleRate);
    totalBrightness += computeBrightness(chunk, sampleRate);
    validChunks++;
  }

  if (validChunks === 0) {
    return { name, avgEnergy: 0, avgPitch: 0, avgBrightness: 0, target };
  }

  return {
    name,
    avgEnergy: totalEnergy / validChunks,
    avgPitch: totalPitch / validChunks,
    avgBrightness: totalBrightness / validChunks,
    target,
  };
}

/**
 * Generate a speaker timeline summary string.
 * Example: "Alice (0:00-0:15) → Bob (0:15-0:32) → Alice (0:32-0:45)"
 */
export function generateTimeline(segments: DiarizedSegment[]): string {
  if (segments.length === 0) { return ''; }

  return segments
    .filter(s => s.speaker !== 'Unknown' && s.speaker !== 'Silence')
    .map(s => {
      const start = formatTime(s.startMs);
      const end = formatTime(s.endMs);
      return `${s.speaker} (${start}-${end})`;
    })
    .join(' → ');
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
