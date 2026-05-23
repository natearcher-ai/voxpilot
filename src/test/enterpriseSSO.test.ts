import { describe, it, expect, beforeEach } from 'vitest';
import { EnterpriseSSOManager } from '../enterpriseSSO';

describe('EnterpriseSSOManager', () => {
  let manager: EnterpriseSSOManager;

  beforeEach(() => {
    manager = new EnterpriseSSOManager();
  });

  it('starts unconfigured and unauthenticated', () => {
    const state = manager.getState();
    expect(state.configured).toBe(false);
    expect(state.authenticated).toBe(false);
    expect(state.user).toBeUndefined();
    expect(state.policy).toBeUndefined();
  });

  it('isConfigured returns false by default', () => {
    expect(manager.isConfigured()).toBe(false);
  });

  it('isAuthenticated returns false by default', () => {
    expect(manager.isAuthenticated()).toBe(false);
  });

  it('getUser returns undefined when not authenticated', () => {
    expect(manager.getUser()).toBeUndefined();
  });

  it('getPolicy returns undefined when no policy loaded', () => {
    expect(manager.getPolicy()).toBeUndefined();
  });

  it('isFeatureAllowed returns true when no policy', () => {
    expect(manager.isFeatureAllowed('llmPostCorrection')).toBe(true);
    expect(manager.isFeatureAllowed('anyFeature')).toBe(true);
  });

  it('isFeatureRequired returns false when no policy', () => {
    expect(manager.isFeatureRequired('adaptiveLearning')).toBe(false);
  });

  it('isExpired returns true when no user', () => {
    expect(manager.isExpired()).toBe(true);
  });

  it('getStatusSummary returns not configured', () => {
    expect(manager.getStatusSummary()).toBe('SSO not configured');
  });

  it('logout clears state', async () => {
    await manager.logout();
    expect(manager.isAuthenticated()).toBe(false);
    expect(manager.getUser()).toBeUndefined();
    expect(manager.getPolicy()).toBeUndefined();
  });

  it('onAuthChange registers callback and returns disposable', () => {
    let called = false;
    const disposable = manager.onAuthChange(() => { called = true; });
    expect(called).toBe(false);
    disposable.dispose();
  });

  it('login returns false when not configured', async () => {
    const result = await manager.login();
    expect(result).toBe(false);
    expect(manager.getState().error).toBe('SSO not configured');
  });

  it('getState returns a copy', () => {
    const state1 = manager.getState();
    const state2 = manager.getState();
    expect(state1).toEqual(state2);
    expect(state1).not.toBe(state2); // Different object references
  });
});
