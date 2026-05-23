import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceClient } from '../marketplaceV2';

describe('MarketplaceClient', () => {
  let client: MarketplaceClient;

  beforeEach(() => {
    client = new MarketplaceClient('https://test.registry.dev/api/v1');
  });

  it('starts with no installed packs', () => {
    expect(client.installedCount).toBe(0);
    expect(client.getInstalled()).toHaveLength(0);
  });

  it('isInstalled returns false for unknown pack', () => {
    expect(client.isInstalled('nonexistent')).toBe(false);
  });

  it('uninstall returns false for unknown pack', () => {
    expect(client.uninstall('nonexistent')).toBe(false);
  });

  it('setEnabled returns false for unknown pack', () => {
    expect(client.setEnabled('nonexistent', true)).toBe(false);
  });

  it('setAutoUpdate returns false for unknown pack', () => {
    expect(client.setAutoUpdate('nonexistent', false)).toBe(false);
  });

  it('search returns empty results on network error', async () => {
    const result = await client.search({ query: 'react' });
    expect(result.packs).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it('getPackDetails returns null on network error', async () => {
    const result = await client.getPackDetails('some-pack');
    expect(result).toBeNull();
  });

  it('install returns false on network error', async () => {
    const result = await client.install('some-pack');
    expect(result).toBe(false);
  });

  it('submitReview returns false on network error', async () => {
    const result = await client.submitReview('some-pack', 5, 'Great pack!');
    expect(result).toBe(false);
  });

  it('reportPack returns false on network error', async () => {
    const result = await client.reportPack('some-pack', 'spam');
    expect(result).toBe(false);
  });

  it('checkUpdates returns empty on network error', async () => {
    const updates = await client.checkUpdates();
    expect(updates).toHaveLength(0);
  });

  it('getFeatured returns empty on network error', async () => {
    const featured = await client.getFeatured();
    expect(featured).toHaveLength(0);
  });
});
