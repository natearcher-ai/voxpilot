import { describe, it, expect, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { splitIdentifier, AutoVocabularyProcessor } from '../autoVocabulary';
import type { ProcessorContext } from '../postProcessingPipeline';

// This suite exercises the FULL AutoVocabularyProcessor path
// (scan documents -> build spoken-form rules -> rewrite transcript) to lock in
// the single-letter-word filtering that the pure splitIdentifier tests cannot
// observe. It relies on the harness aliasing 'vscode' to the shared mock and
// feeds real document text as input (it does not stub the logic under test).

function makeContext(): ProcessorContext {
  return {
    segments: [],
    voiceCommandsApplied: 0,
    punctuationAdded: false,
    capitalized: false,
    pendingCommands: [],
  };
}

function setDocs(...texts: string[]): void {
  (vscode.workspace as any).textDocuments = texts.map(t => ({
    uri: { scheme: 'file' },
    getText: () => t,
  }));
}

describe('splitIdentifier single-letter words', () => {
  it('yields a single-letter trailing word for ids like userX', () => {
    expect(splitIdentifier('userX')).toEqual(['user', 'x']);
  });
  it('yields a single-letter leading word for ids like aXyz', () => {
    expect(splitIdentifier('aXyz')).toEqual(['a', 'xyz']);
  });
});

describe('AutoVocabularyProcessor — single-letter word filtering', () => {
  let proc: AutoVocabularyProcessor | undefined;

  afterEach(() => {
    if (proc) { proc.dispose(); proc = undefined; }
    (vscode.workspace as any).textDocuments = [];
  });

  it('does not turn ordinary phrases into identifiers when the identifier contains a single-letter word', () => {
    // "userX" -> ["user","x"] and "aXyz" -> ["a","xyz"] each contain a
    // single-letter word, so they are not useful project vocabulary and must
    // be skipped (the toSpokenForm guard is supposed to drop them).
    setDocs('const userX = 1; function aXyz() {}');
    proc = new AutoVocabularyProcessor();
    proc.refresh();

    expect(proc.process('open the user x panel', makeContext())).toBe('open the user x panel');
    expect(proc.process('call a xyz now', makeContext())).toBe('call a xyz now');
  });

  it('still rewrites genuine multi-word identifiers (no single-letter words)', () => {
    setDocs('function handleClick() {} const getUserName = 2;');
    proc = new AutoVocabularyProcessor();
    proc.refresh();

    expect(proc.process('please handle click here', makeContext())).toBe('please handleClick here');
    expect(proc.process('call get user name', makeContext())).toBe('call getUserName');
  });
});
