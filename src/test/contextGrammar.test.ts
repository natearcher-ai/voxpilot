import { describe, it, expect } from 'vitest';
import { applyCase, applyKeywordCasing, applyReplacements, getRulesForLanguage } from '../contextGrammar';

describe('applyCase', () => {
  it('converts to camelCase', () => {
    expect(applyCase('my variable name', 'camelCase')).toBe('myVariableName');
  });

  it('converts to PascalCase', () => {
    expect(applyCase('my class name', 'PascalCase')).toBe('MyClassName');
  });

  it('converts to snake_case', () => {
    expect(applyCase('my variable name', 'snake_case')).toBe('my_variable_name');
  });

  it('converts to UPPER_SNAKE', () => {
    expect(applyCase('max retry count', 'UPPER_SNAKE')).toBe('MAX_RETRY_COUNT');
  });

  it('converts to kebab-case', () => {
    expect(applyCase('my component name', 'kebab-case')).toBe('my-component-name');
  });

  it('returns unchanged for none style', () => {
    expect(applyCase('hello world', 'none')).toBe('hello world');
  });

  it('returns unchanged for single word', () => {
    expect(applyCase('hello', 'camelCase')).toBe('hello');
  });
});

describe('applyKeywordCasing', () => {
  it('uppercases SQL keywords', () => {
    const rules = getRulesForLanguage('sql')!;
    const result = applyKeywordCasing('select name from users where id = 1', rules);
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
    expect(result).toContain('WHERE');
  });

  it('lowercases Python keywords', () => {
    const rules = getRulesForLanguage('python')!;
    const result = applyKeywordCasing('DEF my_function RETURN value', rules);
    expect(result).toContain('def');
    expect(result).toContain('return');
  });

  it('handles TypeScript keywords', () => {
    const rules = getRulesForLanguage('typescript')!;
    const result = applyKeywordCasing('CONST x = ASYNC FUNCTION', rules);
    expect(result).toContain('const');
    expect(result).toContain('async');
    expect(result).toContain('function');
  });
});

describe('applyReplacements', () => {
  it('applies TypeScript replacements', () => {
    const rules = getRulesForLanguage('typescript')!;
    const result = applyReplacements('arrow function', rules);
    expect(result).toContain('=>');
  });

  it('applies Python replacements', () => {
    const rules = getRulesForLanguage('python')!;
    expect(applyReplacements('none', rules)).toBe('None');
    expect(applyReplacements('true', rules)).toBe('True');
    expect(applyReplacements('false', rules)).toBe('False');
  });

  it('applies Rust replacements', () => {
    const rules = getRulesForLanguage('rust')!;
    expect(applyReplacements('mutable', rules)).toBe('mut');
    expect(applyReplacements('reference', rules)).toBe('&');
  });

  it('applies Go replacements', () => {
    const rules = getRulesForLanguage('go')!;
    expect(applyReplacements('short assign', rules)).toBe(':=');
  });

  it('applies Markdown replacements', () => {
    const rules = getRulesForLanguage('markdown')!;
    expect(applyReplacements('heading one', rules)).toBe('# ');
    expect(applyReplacements('bullet', rules)).toBe('- ');
  });

  it('applies Shell replacements', () => {
    const rules = getRulesForLanguage('shellscript')!;
    expect(applyReplacements('pipe', rules)).toBe('|');
    expect(applyReplacements('and then', rules)).toBe('&&');
  });

  it('does not replace partial matches', () => {
    const rules = getRulesForLanguage('python')!;
    // "none" should match but "nonexistent" should not
    expect(applyReplacements('nonexistent', rules)).toBe('nonexistent');
  });
});

describe('getRulesForLanguage', () => {
  it('returns rules for known languages', () => {
    expect(getRulesForLanguage('typescript')).not.toBeNull();
    expect(getRulesForLanguage('python')).not.toBeNull();
    expect(getRulesForLanguage('rust')).not.toBeNull();
    expect(getRulesForLanguage('go')).not.toBeNull();
    expect(getRulesForLanguage('sql')).not.toBeNull();
    expect(getRulesForLanguage('markdown')).not.toBeNull();
    expect(getRulesForLanguage('shellscript')).not.toBeNull();
  });

  it('resolves aliases', () => {
    expect(getRulesForLanguage('typescriptreact')).not.toBeNull();
    expect(getRulesForLanguage('typescriptreact')!.languageId).toBe('typescript');
    expect(getRulesForLanguage('bash')!.languageId).toBe('shellscript');
    expect(getRulesForLanguage('jsx')!.languageId).toBe('javascript');
  });

  it('returns null for unknown languages', () => {
    expect(getRulesForLanguage('cobol')).toBeNull();
    expect(getRulesForLanguage('fortran')).toBeNull();
  });

  it('rules have correct structure', () => {
    const rules = getRulesForLanguage('typescript')!;
    expect(rules.identifierCase).toBe('camelCase');
    expect(rules.semicolons).toBe(true);
    expect(rules.quoteStyle).toBe('single');
    expect(rules.commentPrefix).toBe('//');
  });

  it('Python uses snake_case and no semicolons', () => {
    const rules = getRulesForLanguage('python')!;
    expect(rules.identifierCase).toBe('snake_case');
    expect(rules.semicolons).toBe(false);
    expect(rules.quoteStyle).toBe('double');
    expect(rules.commentPrefix).toBe('#');
  });

  it('SQL uppercases keywords', () => {
    const rules = getRulesForLanguage('sql')!;
    expect(rules.uppercaseKeywords.length).toBeGreaterThan(10);
    expect(rules.uppercaseKeywords).toContain('SELECT');
    expect(rules.uppercaseKeywords).toContain('FROM');
  });
});
