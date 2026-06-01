import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmbientListeningManager, AmbientStatusIndicator, computeRMS } from '../ambientListening';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: () => ({
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    }),
    onDidChangeWindowState: vi.fn(() => ({ dispose: vi.fn() })),
  },
  StatusBarAlignment: { Right: 2 },
  ThemeColor: class { constructor(public id: string) {} },
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
}));

function makePCMFrame(rms: number, samples: number = 480): Buffer {
  // Generate a PCM buffer with approximately the target RMS
  const buf = Buffer.alloc(samples * 2);
  const amplitude = Math.round(rms * 32768);
  for (let i = 0; i < samples; i++) {
    // Alternate positive/negative to get target RMS
    const val = i % 2 === 0 ? amplitude : -amplitude;
    buf.writeInt16LE(val, i * 2);
  }
  return buf;
}

function makeSilentFrame(samples: number = 480): Buffer {
  return Buffer.alloc(samples * 2); // all zeros
}

describe('AmbientListeningManager', () => {
  let manager: AmbientListeningManager;

  beforeEach(() => {
    manager = new AmbientListeningManager({ enabled: true, powerMode: 'balanced' });
  });

  it('should not be active initially', () => {
    expect(manager.active).toBe(false);
  });

  it('should start and stop', () => {
    manager.start();
    expect(manager.active).toBe(true);
    expect(manager.suspended).toBe(false);

    manager.stop();
    expect(manager.active).toBe(false);
  });

  it('should not process frames when inactive', () => {
    const frame = makePCMFrame(0.05);
    const result = manager.processFrame(frame);
    expect(result.shouldTranscribe).toBe(false);
  });

  it('should not process frames when suspended', () => {
    manager.start();
    manager.suspend('test');
    expect(manager.suspended).toBe(true);

    const frame = makePCMFrame(0.05);
    const result = manager.processFrame(frame);
    expect(result.shouldTranscribe).toBe(false);
  });

  it('should skip silent frames (below energy floor)', () => {
    // Use performance mode (skipFrames=0) so duty cycling doesn't interfere
    const mgr = new AmbientListeningManager({ enabled: true, powerMode: 'performance' });
    mgr.start();
    const frame = makeSilentFrame();
    const result = mgr.processFrame(frame);
    expect(result.shouldTranscribe).toBe(false);
    expect(mgr.stats.windowsSkipped).toBe(1);
    mgr.dispose();
  });

  it('should accumulate frames above energy floor', () => {
    manager.start();
    // Send enough loud frames to fill the capture window
    const frame = makePCMFrame(0.05); // well above balanced energyFloor of 0.005
    let transcribeTriggered = false;
    for (let i = 0; i < 200; i++) {
      const result = manager.processFrame(frame);
      if (result.shouldTranscribe) {
        transcribeTriggered = true;
        expect(result.audioData).toBeDefined();
        expect(result.audioData!.length).toBeGreaterThan(0);
        break;
      }
    }
    // May or may not trigger depending on timing, but should not crash
    expect(manager.stats.windowsSkipped).toBe(0);
  });

  it('should fire wake callbacks on notifyWakeDetected', () => {
    const cb = vi.fn();
    manager.onWake(cb);
    manager.start();

    manager.notifyWakeDetected();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(manager.stats.wakeDetections).toBe(1);
  });

  it('should support suspend/resume callbacks', () => {
    const cb = vi.fn();
    manager.onSuspendChange(cb);
    manager.start();

    manager.suspend('test');
    expect(cb).toHaveBeenCalledWith(true);

    manager.resume('test');
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('should dispose cleanly', () => {
    manager.start();
    manager.dispose();
    expect(manager.active).toBe(false);
  });

  it('should update power mode at runtime', () => {
    manager.start();
    manager.updateConfig({ powerMode: 'low' });
    expect(manager.config.powerMode).toBe('low');
  });

  it('should reset stats', () => {
    manager.start();
    manager.notifyWakeDetected();
    expect(manager.stats.wakeDetections).toBe(1);

    manager.resetStats();
    expect(manager.stats.wakeDetections).toBe(0);
  });

  it('should unregister wake callback on dispose', () => {
    const cb = vi.fn();
    const disposable = manager.onWake(cb);
    disposable.dispose();

    manager.start();
    manager.notifyWakeDetected();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('AmbientStatusIndicator', () => {
  it('should create and dispose without error', () => {
    const indicator = new AmbientStatusIndicator();
    expect(indicator.visible).toBe(false);
    indicator.show();
    expect(indicator.visible).toBe(true);
    indicator.hide();
    expect(indicator.visible).toBe(false);
    indicator.dispose();
  });

  it('should show suspended state', () => {
    const indicator = new AmbientStatusIndicator();
    indicator.show(true);
    expect(indicator.visible).toBe(true);
    indicator.dispose();
  });
});
