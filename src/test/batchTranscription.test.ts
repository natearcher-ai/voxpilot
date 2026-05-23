import { describe, it, expect, beforeEach } from 'vitest';
import { BatchTranscriptionManager, isSupportedFormat, estimateDuration, generateOutputPath } from '../batchTranscription';

describe('isSupportedFormat', () => {
  it('accepts supported audio formats', () => {
    expect(isSupportedFormat('recording.wav')).toBe(true);
    expect(isSupportedFormat('meeting.mp3')).toBe(true);
    expect(isSupportedFormat('voice.m4a')).toBe(true);
    expect(isSupportedFormat('audio.ogg')).toBe(true);
    expect(isSupportedFormat('music.flac')).toBe(true);
    expect(isSupportedFormat('video.webm')).toBe(true);
    expect(isSupportedFormat('clip.mp4')).toBe(true);
  });

  it('rejects unsupported formats', () => {
    expect(isSupportedFormat('document.pdf')).toBe(false);
    expect(isSupportedFormat('code.ts')).toBe(false);
    expect(isSupportedFormat('image.png')).toBe(false);
    expect(isSupportedFormat('data.csv')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSupportedFormat('file.WAV')).toBe(true);
    expect(isSupportedFormat('file.Mp3')).toBe(true);
  });
});

describe('estimateDuration', () => {
  it('estimates duration for WAV files', () => {
    // 1MB WAV at 1411kbps ≈ 5.7 seconds
    const duration = estimateDuration(1000000, '.wav');
    expect(duration).toBeGreaterThan(4000);
    expect(duration).toBeLessThan(8000);
  });

  it('estimates duration for MP3 files', () => {
    // 1MB MP3 at 192kbps ≈ 41.7 seconds
    const duration = estimateDuration(1000000, '.mp3');
    expect(duration).toBeGreaterThan(30000);
    expect(duration).toBeLessThan(50000);
  });

  it('returns 0 for 0 bytes', () => {
    expect(estimateDuration(0, '.mp3')).toBe(0);
  });
});

describe('generateOutputPath', () => {
  it('generates markdown output path', () => {
    const path = generateOutputPath('/recordings/meeting.mp3', 'markdown', 'transcripts');
    expect(path).toBe('transcripts/meeting.md');
  });

  it('generates JSON output path', () => {
    const path = generateOutputPath('/recordings/interview.wav', 'json', 'output');
    expect(path).toBe('output/interview.json');
  });

  it('generates SRT output path', () => {
    const path = generateOutputPath('/video/demo.mp4', 'srt', 'subs');
    expect(path).toBe('subs/demo.srt');
  });

  it('generates text output path', () => {
    const path = generateOutputPath('/audio/memo.m4a', 'text', 'notes');
    expect(path).toBe('notes/memo.txt');
  });
});

describe('BatchTranscriptionManager', () => {
  let manager: BatchTranscriptionManager;

  beforeEach(() => {
    manager = new BatchTranscriptionManager();
  });

  it('starts with empty queue', () => {
    expect(manager.totalCount).toBe(0);
    expect(manager.activeCount).toBe(0);
    expect(manager.getJobs()).toHaveLength(0);
  });

  it('addToQueue creates a job', () => {
    const job = manager.addToQueue('/path/to/meeting.mp3');
    expect(job).not.toBeNull();
    expect(job!.status).toBe('queued');
    expect(job!.fileName).toBe('meeting.mp3');
    expect(job!.progress).toBe(0);
    expect(manager.totalCount).toBe(1);
  });

  it('addToQueue returns null for unsupported format', () => {
    const job = manager.addToQueue('/path/to/document.pdf');
    expect(job).toBeNull();
  });

  it('addToQueue uses custom options', () => {
    const job = manager.addToQueue('/path/to/file.wav', { format: 'srt', model: 'whisper-large', language: 'fr' });
    expect(job!.outputFormat).toBe('srt');
    expect(job!.model).toBe('whisper-large');
    expect(job!.language).toBe('fr');
  });

  it('addBatch adds multiple files', () => {
    const jobs = manager.addBatch(['/a.mp3', '/b.wav', '/c.pdf']);
    expect(jobs).toHaveLength(2); // pdf rejected
    expect(manager.totalCount).toBe(2);
  });

  it('getJob returns job by ID', () => {
    const job = manager.addToQueue('/test.mp3');
    const fetched = manager.getJob(job!.id);
    expect(fetched).toBeDefined();
    expect(fetched!.fileName).toBe('test.mp3');
  });

  it('getJobsByStatus filters correctly', () => {
    manager.addToQueue('/a.mp3');
    manager.addToQueue('/b.mp3');
    const job = manager.startNext();

    expect(manager.getJobsByStatus('queued')).toHaveLength(1);
    expect(manager.getJobsByStatus('processing')).toHaveLength(1);
  });

  it('startNext begins processing', () => {
    manager.addToQueue('/test.mp3');
    const job = manager.startNext();
    expect(job).not.toBeNull();
    expect(job!.status).toBe('processing');
    expect(job!.startedAt).toBeGreaterThan(0);
    expect(manager.activeCount).toBe(1);
  });

  it('startNext respects maxConcurrent', () => {
    manager.setConfig({ maxConcurrent: 1 });
    manager.addToQueue('/a.mp3');
    manager.addToQueue('/b.mp3');

    manager.startNext();
    const second = manager.startNext();
    expect(second).toBeNull(); // Can't start another
  });

  it('startNext returns null when queue is empty', () => {
    expect(manager.startNext()).toBeNull();
  });

  it('completeJob marks job as done', () => {
    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.completeJob(job!.id, 'Hello world transcription', 3);

    const completed = manager.getJob(job!.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.progress).toBe(100);
    expect(completed!.outputText).toBe('Hello world transcription');
    expect(completed!.wordCount).toBe(3);
    expect(completed!.completedAt).toBeGreaterThan(0);
    expect(manager.activeCount).toBe(0);
  });

  it('failJob marks job as failed', () => {
    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.failJob(job!.id, 'Model load failed');

    const failed = manager.getJob(job!.id);
    expect(failed!.status).toBe('failed');
    expect(failed!.error).toBe('Model load failed');
  });

  it('cancelJob stops a queued job', () => {
    const job = manager.addToQueue('/test.mp3');
    expect(manager.cancelJob(job!.id)).toBe(true);
    expect(manager.getJob(job!.id)!.status).toBe('cancelled');
  });

  it('cancelJob cannot cancel completed job', () => {
    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.completeJob(job!.id, 'done', 1);
    expect(manager.cancelJob(job!.id)).toBe(false);
  });

  it('removeJob deletes from queue', () => {
    const job = manager.addToQueue('/test.mp3');
    expect(manager.removeJob(job!.id)).toBe(true);
    expect(manager.totalCount).toBe(0);
  });

  it('removeJob returns false for unknown id', () => {
    expect(manager.removeJob('nonexistent')).toBe(false);
  });

  it('retryJob requeues a failed job', () => {
    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.failJob(job!.id, 'error');

    expect(manager.retryJob(job!.id)).toBe(true);
    expect(manager.getJob(job!.id)!.status).toBe('queued');
    expect(manager.getJob(job!.id)!.error).toBeUndefined();
  });

  it('retryJob returns false for non-failed job', () => {
    const job = manager.addToQueue('/test.mp3');
    expect(manager.retryJob(job!.id)).toBe(false);
  });

  it('clearFinished removes completed/failed/cancelled', () => {
    const j1 = manager.addToQueue('/a.mp3');
    const j2 = manager.addToQueue('/b.mp3');
    const j3 = manager.addToQueue('/c.mp3');

    manager.startNext();
    manager.completeJob(j1!.id, 'done', 1);
    manager.cancelJob(j2!.id);

    const cleared = manager.clearFinished();
    expect(cleared).toBe(2);
    expect(manager.totalCount).toBe(1); // Only j3 remains (queued)
  });

  it('updateProgress updates job progress', () => {
    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.updateProgress(job!.id, 50, 'partial text');

    expect(manager.getJob(job!.id)!.progress).toBe(50);
    expect(manager.getJob(job!.id)!.outputText).toBe('partial text');
  });

  it('updateProgress clamps to 0-100', () => {
    const job = manager.addToQueue('/test.mp3');
    manager.startNext();

    manager.updateProgress(job!.id, -10);
    expect(manager.getJob(job!.id)!.progress).toBe(0);

    manager.updateProgress(job!.id, 150);
    expect(manager.getJob(job!.id)!.progress).toBe(100);
  });

  it('onProgress fires callback', () => {
    let progressJob: any = null;
    manager.onProgress((job) => { progressJob = job; });

    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.updateProgress(job!.id, 75);

    expect(progressJob).not.toBeNull();
    expect(progressJob.progress).toBe(75);
  });

  it('onProgress dispose removes callback', () => {
    let count = 0;
    const disposable = manager.onProgress(() => { count++; });

    const job = manager.addToQueue('/test.mp3');
    manager.startNext();
    manager.updateProgress(job!.id, 25);
    expect(count).toBe(1);

    disposable.dispose();
    manager.updateProgress(job!.id, 50);
    expect(count).toBe(1);
  });

  it('getStats returns correct counts', () => {
    manager.addToQueue('/a.mp3');
    manager.addToQueue('/b.mp3');
    manager.addToQueue('/c.mp3');

    const j1 = manager.startNext();
    manager.completeJob(j1!.id, 'text', 5);

    const stats = manager.getStats();
    expect(stats.total).toBe(3);
    expect(stats.queued).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.totalWords).toBe(5);
  });

  it('getConfig returns current config', () => {
    const config = manager.getConfig();
    expect(config.maxConcurrent).toBe(2);
    expect(config.defaultFormat).toBe('markdown');
    expect(config.defaultModel).toBe('whisper-small');
  });

  it('setConfig updates config', () => {
    manager.setConfig({ maxConcurrent: 4, defaultFormat: 'srt' });
    const config = manager.getConfig();
    expect(config.maxConcurrent).toBe(4);
    expect(config.defaultFormat).toBe('srt');
  });
});
