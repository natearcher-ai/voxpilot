import { describe, it, expect, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
}));

import { SoundFeedback } from '../soundFeedback';

describe('SoundFeedback', () => {
  it('should use provided storagePath for tempDir', () => {
    const feedback = new SoundFeedback('/test/storage');
    expect((feedback as any).tempDir).toBe(path.join('/test/storage', 'voxpilot-sounds'));
    feedback.dispose();
  });

  it('should fall back to os.tmpdir() when no storagePath provided', () => {
    const feedback = new SoundFeedback();
    expect((feedback as any).tempDir).toBe(path.join(os.tmpdir(), 'voxpilot-sounds'));
    feedback.dispose();
  });

  it('should generate a valid WAV buffer', () => {
    const feedback = new SoundFeedback('/test/storage');
    const wav: Buffer = (feedback as any).generateWav(440, 0.06, 0.25);

    // WAV header starts with 'RIFF'
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    // 'WAVE' at offset 8
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    // Total size = 44 (header) + expected data size
    const sampleRate = 16000;
    const numSamples = Math.floor(sampleRate * 0.06);
    const dataSize = numSamples * 2;
    expect(wav.length).toBe(44 + dataSize);

    feedback.dispose();
  });
});
