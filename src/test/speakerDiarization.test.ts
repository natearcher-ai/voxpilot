import { describe, it, expect } from 'vitest';
import {
  classifyWindow,
  diarize,
  formatDiarizedTranscript,
  RealtimeSpeakerTracker,
  buildProfileFromChunks,
  generateTimeline,
  DiarizedSegment,
} from '../speakerDiarization';
import { VoiceProfile } from '../pairProgramming';

function makeSamples(length: number, frequency: number, amplitude: number, sampleRate = 16000): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return samples;
}

function makeSilence(length: number): Float32Array {
  return new Float32Array(length);
}

const profileAlice: VoiceProfile = {
  name: 'Alice',
  avgEnergy: 0.15,
  avgPitch: 220,
  avgBrightness: 0.3,
  target: 'editor',
};

const profileBob: VoiceProfile = {
  name: 'Bob',
  avgEnergy: 0.25,
  avgPitch: 130,
  avgBrightness: 0.2,
  target: 'chat',
};

describe('speakerDiarization', () => {
  describe('classifyWindow', () => {
    it('returns Unknown for empty profiles', () => {
      const samples = makeSamples(8000, 220, 0.15);
      const result = classifyWindow(samples, 16000, []);
      expect(result.speaker).toBe('Unknown');
      expect(result.confidence).toBe(0);
    });

    it('returns Silence for very quiet audio', () => {
      const samples = makeSamples(8000, 220, 0.001);
      const result = classifyWindow(samples, 16000, [profileAlice, profileBob]);
      expect(result.speaker).toBe('Silence');
      expect(result.confidence).toBe(1.0);
    });

    it('classifies audio closer to Alice profile', () => {
      // Generate audio with characteristics closer to Alice (higher pitch, lower energy)
      const samples = makeSamples(8000, 220, 0.15);
      const result = classifyWindow(samples, 16000, [profileAlice, profileBob]);
      expect(result.speaker).toBe('Alice');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('classifies audio closer to Bob profile', () => {
      // Generate audio with characteristics closer to Bob (lower pitch, higher energy)
      const samples = makeSamples(8000, 130, 0.25);
      const result = classifyWindow(samples, 16000, [profileAlice, profileBob]);
      expect(result.speaker).toBe('Bob');
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('diarize', () => {
    it('returns Unknown segment for empty profiles', () => {
      const audio = makeSamples(16000, 200, 0.2);
      const result = diarize(audio, []);
      expect(result.segments.length).toBe(1);
      expect(result.segments[0].speaker).toBe('Unknown');
      expect(result.speakerChanges).toBe(0);
    });

    it('returns Unknown segment for very short audio', () => {
      const audio = makeSamples(100, 200, 0.2);
      const result = diarize(audio, [profileAlice, profileBob]);
      expect(result.segments.length).toBe(1);
      expect(result.segments[0].speaker).toBe('Unknown');
    });

    it('segments audio into speaker chunks', () => {
      const sampleRate = 16000;
      const windowSamples = (500 / 1000) * sampleRate; // 500ms windows = 8000 samples

      // Create 2 seconds of "Alice-like" audio followed by 2 seconds of "Bob-like" audio
      const aliceAudio = makeSamples(sampleRate * 2, 220, 0.15, sampleRate);
      const bobAudio = makeSamples(sampleRate * 2, 130, 0.25, sampleRate);

      const combined = new Float32Array(aliceAudio.length + bobAudio.length);
      combined.set(aliceAudio, 0);
      combined.set(bobAudio, aliceAudio.length);

      const result = diarize(combined, [profileAlice, profileBob], { sampleRate });
      expect(result.totalDurationMs).toBe(4000);
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(result.speakerChanges).toBeGreaterThanOrEqual(0);
    });

    it('reports correct total duration', () => {
      const audio = makeSamples(32000, 200, 0.2); // 2 seconds at 16kHz
      const result = diarize(audio, [profileAlice], { sampleRate: 16000 });
      expect(result.totalDurationMs).toBe(2000);
    });
  });

  describe('formatDiarizedTranscript', () => {
    it('returns empty string for empty segments', () => {
      expect(formatDiarizedTranscript([])).toBe('');
    });

    it('adds speaker labels on speaker change', () => {
      const segments: DiarizedSegment[] = [
        { speaker: 'Alice', startMs: 0, endMs: 1000, confidence: 0.8, text: 'Hello world' },
        { speaker: 'Bob', startMs: 1000, endMs: 2000, confidence: 0.7, text: 'Hi there' },
      ];
      const result = formatDiarizedTranscript(segments);
      expect(result).toBe('[Alice] Hello world [Bob] Hi there');
    });

    it('omits label when speaker is the same', () => {
      const segments: DiarizedSegment[] = [
        { speaker: 'Alice', startMs: 0, endMs: 1000, confidence: 0.8, text: 'Hello' },
        { speaker: 'Alice', startMs: 1000, endMs: 2000, confidence: 0.8, text: 'world' },
      ];
      const result = formatDiarizedTranscript(segments);
      expect(result).toBe('[Alice] Hello world');
    });

    it('skips segments with no text', () => {
      const segments: DiarizedSegment[] = [
        { speaker: 'Alice', startMs: 0, endMs: 1000, confidence: 0.8, text: '' },
        { speaker: 'Bob', startMs: 1000, endMs: 2000, confidence: 0.7, text: 'Hi' },
      ];
      const result = formatDiarizedTranscript(segments);
      expect(result).toBe('[Bob] Hi');
    });

    it('does not label Unknown speaker', () => {
      const segments: DiarizedSegment[] = [
        { speaker: 'Unknown', startMs: 0, endMs: 1000, confidence: 0.3, text: 'Something' },
      ];
      const result = formatDiarizedTranscript(segments);
      expect(result).toBe('Something');
    });
  });

  describe('RealtimeSpeakerTracker', () => {
    it('starts with Unknown speaker', () => {
      const tracker = new RealtimeSpeakerTracker([profileAlice, profileBob]);
      expect(tracker.currentSpeaker).toBe('Unknown');
      expect(tracker.currentConfidence).toBe(0);
    });

    it('identifies speaker after processing windows', () => {
      const tracker = new RealtimeSpeakerTracker([profileAlice, profileBob]);
      const samples = makeSamples(8000, 220, 0.15);

      // Feed several windows to build up confidence
      for (let i = 0; i < 5; i++) {
        tracker.processWindow(samples);
      }

      // Should identify as Alice (closer to her profile)
      expect(tracker.currentSpeaker).not.toBe('Unknown');
    });

    it('ignores silence windows', () => {
      const tracker = new RealtimeSpeakerTracker([profileAlice, profileBob]);
      const silence = makeSilence(8000);

      const changed = tracker.processWindow(silence);
      expect(changed).toBe(false);
      expect(tracker.currentSpeaker).toBe('Unknown');
    });

    it('detects speaker change', () => {
      const tracker = new RealtimeSpeakerTracker([profileAlice, profileBob], { minConfidence: 0.05 });

      const aliceSamples = makeSamples(8000, 220, 0.15);
      const bobSamples = makeSamples(8000, 130, 0.25);

      // Feed Alice samples to establish her as speaker
      for (let i = 0; i < 6; i++) {
        tracker.processWindow(aliceSamples);
      }
      const speakerBefore = tracker.currentSpeaker;
      expect(speakerBefore).toBe('Alice');

      // Feed Bob samples — speaker should eventually change
      for (let i = 0; i < 6; i++) {
        tracker.processWindow(bobSamples);
      }

      expect(tracker.currentSpeaker).toBe('Bob');
    });

    it('resets state correctly', () => {
      const tracker = new RealtimeSpeakerTracker([profileAlice, profileBob]);
      const samples = makeSamples(8000, 220, 0.15);

      tracker.processWindow(samples);
      tracker.reset();

      expect(tracker.currentSpeaker).toBe('Unknown');
      expect(tracker.currentConfidence).toBe(0);
    });

    it('updates profiles', () => {
      const tracker = new RealtimeSpeakerTracker([profileAlice]);
      tracker.updateProfiles([profileAlice, profileBob]);
      expect(tracker.currentSpeaker).toBe('Unknown');
    });
  });

  describe('buildProfileFromChunks', () => {
    it('returns zero profile for empty chunks', () => {
      const profile = buildProfileFromChunks('Test', [], 16000);
      expect(profile.name).toBe('Test');
      expect(profile.avgEnergy).toBe(0);
      expect(profile.avgPitch).toBe(0);
    });

    it('skips silent chunks', () => {
      const silence = makeSilence(8000);
      const voiced = makeSamples(8000, 200, 0.2);
      const profile = buildProfileFromChunks('Test', [silence, voiced], 16000);
      expect(profile.avgEnergy).toBeGreaterThan(0);
      expect(profile.avgPitch).toBeGreaterThan(0);
    });

    it('averages multiple valid chunks', () => {
      const chunk1 = makeSamples(8000, 200, 0.2);
      const chunk2 = makeSamples(8000, 220, 0.18);
      const profile = buildProfileFromChunks('Test', [chunk1, chunk2], 16000, 'chat');
      expect(profile.name).toBe('Test');
      expect(profile.target).toBe('chat');
      expect(profile.avgEnergy).toBeGreaterThan(0);
    });
  });

  describe('generateTimeline', () => {
    it('returns empty string for no segments', () => {
      expect(generateTimeline([])).toBe('');
    });

    it('formats a simple timeline', () => {
      const segments: DiarizedSegment[] = [
        { speaker: 'Alice', startMs: 0, endMs: 15000, confidence: 0.8 },
        { speaker: 'Bob', startMs: 15000, endMs: 32000, confidence: 0.7 },
        { speaker: 'Alice', startMs: 32000, endMs: 45000, confidence: 0.9 },
      ];
      const result = generateTimeline(segments);
      expect(result).toBe('Alice (0:00-0:15) → Bob (0:15-0:32) → Alice (0:32-0:45)');
    });

    it('skips Unknown and Silence segments', () => {
      const segments: DiarizedSegment[] = [
        { speaker: 'Alice', startMs: 0, endMs: 5000, confidence: 0.8 },
        { speaker: 'Unknown', startMs: 5000, endMs: 7000, confidence: 0.2 },
        { speaker: 'Bob', startMs: 7000, endMs: 12000, confidence: 0.7 },
      ];
      const result = generateTimeline(segments);
      expect(result).toBe('Alice (0:00-0:05) → Bob (0:07-0:12)');
    });
  });
});
