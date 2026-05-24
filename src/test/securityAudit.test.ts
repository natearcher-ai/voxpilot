import { describe, it, expect } from 'vitest';
import { generateCsp, generateNonce, sanitizeHtml, validateMessage, isSecretKey, scanForSecrets, runSecurityAudit, formatSecurityReport, STRICT_CSP } from '../securityAudit';

describe('generateCsp', () => {
  it('generates CSP string from directives', () => {
    const csp = generateCsp(STRICT_CSP);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('script-src');
    expect(csp).toContain('style-src');
    expect(csp).toContain('img-src');
  });

  it('replaces nonce placeholder', () => {
    const csp = generateCsp(STRICT_CSP, 'abc123');
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).not.toContain('{nonce}');
  });
});

describe('generateNonce', () => {
  it('generates 32-character string', () => {
    const nonce = generateNonce();
    expect(nonce.length).toBe(32);
  });

  it('generates unique values', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });

  it('contains only alphanumeric characters', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe('sanitizeHtml', () => {
  it('escapes angle brackets', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(sanitizeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(sanitizeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(sanitizeHtml("'world'")).toBe('&#x27;world&#x27;');
  });

  it('leaves safe text unchanged', () => {
    expect(sanitizeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('validateMessage', () => {
  const commands = ['create', 'update', 'delete', 'refresh'];

  it('validates correct message', () => {
    const result = validateMessage({ command: 'create', data: {} }, commands);
    expect(result.valid).toBe(true);
    expect(result.command).toBe('create');
  });

  it('rejects null message', () => {
    expect(validateMessage(null, commands).valid).toBe(false);
  });

  it('rejects non-object message', () => {
    expect(validateMessage('string', commands).valid).toBe(false);
    expect(validateMessage(42, commands).valid).toBe(false);
  });

  it('rejects missing command field', () => {
    expect(validateMessage({ data: 'hello' }, commands).valid).toBe(false);
  });

  it('rejects unknown command', () => {
    const result = validateMessage({ command: 'hack' }, commands);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown command');
  });

  it('rejects non-string command', () => {
    expect(validateMessage({ command: 123 }, commands).valid).toBe(false);
  });
});

describe('isSecretKey', () => {
  it('detects API key patterns', () => {
    expect(isSecretKey('apiKey')).toBe(true);
    expect(isSecretKey('api_key')).toBe(true);
    expect(isSecretKey('API-KEY')).toBe(true);
  });

  it('detects token patterns', () => {
    expect(isSecretKey('authToken')).toBe(true);
    expect(isSecretKey('access_token')).toBe(true);
  });

  it('detects password patterns', () => {
    expect(isSecretKey('password')).toBe(true);
    expect(isSecretKey('dbPassword')).toBe(true);
  });

  it('detects secret patterns', () => {
    expect(isSecretKey('clientSecret')).toBe(true);
    expect(isSecretKey('jwt_secret')).toBe(true);
  });

  it('does not flag safe keys', () => {
    expect(isSecretKey('fontSize')).toBe(false);
    expect(isSecretKey('language')).toBe(false);
    expect(isSecretKey('enabled')).toBe(false);
    expect(isSecretKey('model')).toBe(false);
  });
});

describe('scanForSecrets', () => {
  it('finds secrets in settings', () => {
    const findings = scanForSecrets({
      apiKey: 'sk-1234567890',
      fontSize: 14,
      password: 'hunter2',
      language: 'en',
    });
    expect(findings).toHaveLength(2);
    expect(findings.some(f => f.key === 'apiKey')).toBe(true);
    expect(findings.some(f => f.key === 'password')).toBe(true);
  });

  it('ignores empty secret values', () => {
    const findings = scanForSecrets({ apiKey: '', token: '' });
    expect(findings).toHaveLength(0);
  });

  it('ignores non-string secret values', () => {
    const findings = scanForSecrets({ apiKey: 123, token: true });
    expect(findings).toHaveLength(0);
  });

  it('returns empty for clean settings', () => {
    const findings = scanForSecrets({ fontSize: 14, model: 'moonshine', enabled: true });
    expect(findings).toHaveLength(0);
  });
});

describe('runSecurityAudit', () => {
  it('returns a complete report', () => {
    const report = runSecurityAudit();
    expect(report.version).toBe('0.9.9');
    expect(report.timestamp).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThan(0);
    expect(report.checks.length).toBeGreaterThan(5);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('all checks pass in default config', () => {
    const report = runSecurityAudit();
    expect(report.summary.fail).toBe(0);
    expect(report.score).toBe(100);
  });

  it('checks cover all categories', () => {
    const report = runSecurityAudit();
    const categories = new Set(report.checks.map(c => c.category));
    expect(categories.has('csp')).toBe(true);
    expect(categories.has('secrets')).toBe(true);
    expect(categories.has('dependencies')).toBe(true);
    expect(categories.has('permissions')).toBe(true);
    expect(categories.has('input-validation')).toBe(true);
  });

  it('uses provided version', () => {
    const report = runSecurityAudit('1.0.0');
    expect(report.version).toBe('1.0.0');
  });
});

describe('formatSecurityReport', () => {
  it('produces markdown report', () => {
    const report = runSecurityAudit();
    const md = formatSecurityReport(report);
    expect(md).toContain('# VoxPilot Security Audit Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Checks');
    expect(md).toContain('## Recommendations');
    expect(md).toContain('✅');
  });

  it('includes score', () => {
    const report = runSecurityAudit();
    const md = formatSecurityReport(report);
    expect(md).toContain('/100');
  });
});
