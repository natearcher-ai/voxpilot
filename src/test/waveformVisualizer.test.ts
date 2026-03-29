import { describe, it, expect } from 'vitest';
import { WaveformVisualizer } from '../waveformVisualizer';

describe('WaveformVisualizer', () => {
  it('renders empty buffer as spaces', () => {
    const wv = new WaveformVisualizer(4);
    expect(wv.render().length).toBe(4);
    expect(wv.render().trim()).toBe('');
  });

  it('renders pushed samples as block characters', () => {
    const wv = new WaveformVisualizer(4);
    wv.push(0);
    wv.push(0.05);
    wv.push(0.1);
    wv.push(0.2);
    const rendered = wv.render();
    expect(rendered.length).toBe(4);
    // Higher RMS should produce taller blocks
    expect(rendered[3] >= rendered[2]).toBe(true);
  });

  it('rolls off old samples beyond buffer size', () => {
    const wv = new WaveformVisualizer(3);
    wv.push(0.2);
    wv.push(0.1);
    wv.push(0.05);
    wv.push(0); // pushes out the 0.2
    const rendered = wv.render();
    expect(rendered.length).toBe(3);
  });

  it('clamps values to 0–1 range', () => {
    const wv = new WaveformVisualizer(2);
    wv.push(-0.5);
    wv.push(5.0);
    const rendered = wv.render();
    expect(rendered.length).toBe(2);
    // -0.5 clamped to 0 → space, 5.0 clamped to 1 → full block
    expect(rendered[0]).toBe(' ');
    expect(rendered[1]).toBe('█');
  });

  it('resets the buffer', () => {
    const wv = new WaveformVisualizer(4);
    wv.push(0.1);
    wv.push(0.2);
    wv.reset();
    expect(wv.render().trim()).toBe('');
  });

  it('pads left when fewer samples than buffer size', () => {
    const wv = new WaveformVisualizer(6);
    wv.push(0.1);
    wv.push(0.2);
    const rendered = wv.render();
    expect(rendered.length).toBe(6);
    // First 4 chars should be spaces (padding)
    expect(rendered.slice(0, 4).trim()).toBe('');
  });
});
