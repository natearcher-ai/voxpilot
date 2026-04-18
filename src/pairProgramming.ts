/**
 * Pair programming mode — distinguish two speakers by voice profile
 * and route transcriptions to different targets.
 *
 * When two developers are pair programming, this module can differentiate
 * between them based on simple voice characteristics (pitch range, energy)
 * and route each person's speech to a different target:
 *   - Speaker A → editor (typing code)
 *   - Speaker B → chat (giving instructions to AI)
 *
 * This is a lightweight approach — not full speaker diarization, but enough
 * to distinguish two co-located speakers in most cases.
 *
 * Setup:
 *   1. Enable pair programming mode
 *   2. Each speaker records a 5-second calibration sample
 *   3. The system learns basic voice profiles (pitch, energy, spectral centroid)
 *   4. During use, each utterance is classified and routed accordingly
 *
 * Enable via `voxpilot.pairProgramming` setting (default: false).
 */

/**
 * Simple voice profile based on audio characteristics.
 * Not a full voiceprint — just enough to distinguish two speakers.
 */
export interface VoiceProfile {
  /** Profile name (e.g. "Speaker A", "Alice") */
  name: string;
  /** Average RMS energy level */
  avgEnergy: number;
  /** Average pitch estimate (Hz) — derived from zero-crossing rate */
  avgPitch: number;
  /** Average spectral centroid (rough brightness measure) */
  avgBrightness: number;
  /** Output target for this speaker */
  target: 'editor' | 'chat' | 'terminal' | 'clipboard';
}

/**
 * Estimate pitch from zero-crossing rate (ZCR).
 * ZCR correlates roughly with fundamental frequency for voiced speech.
 * Returns estimated Hz.
 */
export function estimatePitchFromZCR(samples: Float32Array, sampleRate: number): number {
  if (samples.length < 2) { return 0; }

  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
      crossings++;
    }
  }

  const durationSec = samples.length / sampleRate;
  // ZCR = crossings per second, pitch ≈ ZCR / 2
  return crossings / (2 * durationSec);
}

/**
 * Compute RMS energy of audio samples.
 */
export function computeEnergy(samples: Float32Array): number {
  if (samples.length === 0) { return 0; }
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  return Math.sqrt(sumSq / samples.length);
}

/**
 * Compute spectral centroid (brightness) from audio samples.
 * Higher values = brighter/higher-frequency content.
 * Uses a simple DFT approximation for efficiency.
 */
export function computeBrightness(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0) { return 0; }

  // Simple energy-weighted frequency estimate using ZCR + energy distribution
  const zcr = estimatePitchFromZCR(samples, sampleRate) * 2; // Back to ZCR
  const energy = computeEnergy(samples);

  // Brightness correlates with ZCR and high-frequency energy
  return zcr * energy * 1000; // Normalized arbitrary scale
}

/**
 * Classify an audio segment as belonging to one of two speaker profiles.
 * Returns the profile name and confidence (0-1).
 */
export function classifySpeaker(
  samples: Float32Array,
  sampleRate: number,
  profiles: [VoiceProfile, VoiceProfile],
): { speaker: string; confidence: number } {
  const energy = computeEnergy(samples);
  const pitch = estimatePitchFromZCR(samples, sampleRate);
  const brightness = computeBrightness(samples, sampleRate);

  // Compute distance to each profile (weighted Euclidean)
  const distances = profiles.map(profile => {
    const dEnergy = (energy - profile.avgEnergy) / (profile.avgEnergy || 0.001);
    const dPitch = (pitch - profile.avgPitch) / (profile.avgPitch || 1);
    const dBright = (brightness - profile.avgBrightness) / (profile.avgBrightness || 1);

    // Pitch is the strongest discriminator between speakers
    return Math.sqrt(dEnergy * dEnergy + dPitch * dPitch * 4 + dBright * dBright);
  });

  const minDist = Math.min(...distances);
  const maxDist = Math.max(...distances);
  const winnerIdx = distances[0] <= distances[1] ? 0 : 1;

  // Confidence: how much closer to the winner vs the other
  const confidence = maxDist > 0 ? 1 - (minDist / maxDist) : 0.5;

  return {
    speaker: profiles[winnerIdx].name,
    confidence: Math.min(1, Math.max(0, confidence)),
  };
}

/**
 * Build a voice profile from calibration audio samples.
 */
export function buildProfile(
  name: string,
  samples: Float32Array,
  sampleRate: number,
  target: VoiceProfile['target'] = 'editor',
): VoiceProfile {
  return {
    name,
    avgEnergy: computeEnergy(samples),
    avgPitch: estimatePitchFromZCR(samples, sampleRate),
    avgBrightness: computeBrightness(samples, sampleRate),
    target,
  };
}
