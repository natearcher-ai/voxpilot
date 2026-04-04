import { describe, it, expect } from 'vitest';
import { applyCodeVocabulary } from '../codeVocabulary';

describe('applyCodeVocabulary', () => {
  it('corrects split language names', () => {
    const { text, corrections } = applyCodeVocabulary('I wrote it in java script and type script');
    expect(text).toBe('I wrote it in JavaScript and TypeScript');
    expect(corrections).toBeGreaterThanOrEqual(2);
  });

  it('corrects casing conventions', () => {
    expect(applyCodeVocabulary('use camel case for variables').text).toBe('use camelCase for variables');
    expect(applyCodeVocabulary('use snake case for python').text).toBe('use snake_case for Python');
    expect(applyCodeVocabulary('use pascal case for classes').text).toBe('use PascalCase for classes');
    expect(applyCodeVocabulary('use kebab case for css').text).toBe('use kebab-case for CSS');
  });

  it('corrects common ASR confusions like jason → JSON', () => {
    const { text } = applyCodeVocabulary('parse the jason file');
    expect(text).toBe('parse the JSON file');
  });

  it('corrects spaced-out acronyms', () => {
    expect(applyCodeVocabulary('use the a p i').text).toBe('use the API');
    expect(applyCodeVocabulary('deploy to a w s').text).toBe('deploy to AWS');
    expect(applyCodeVocabulary('set up c i c d').text).toBe('set up CI/CD');
  });

  it('corrects tool and platform names', () => {
    expect(applyCodeVocabulary('push to git hub').text).toBe('push to GitHub');
    expect(applyCodeVocabulary('open vs code').text).toBe('open VS Code');
    expect(applyCodeVocabulary('use mongo db').text).toBe('use MongoDB');
    expect(applyCodeVocabulary('configure web pack').text).toBe('configure webpack');
  });

  it('corrects framework names', () => {
    expect(applyCodeVocabulary('build with react js').text).toBe('build with React.js');
    expect(applyCodeVocabulary('use next js for ssr').text).toBe('use Next.js for ssr');
    expect(applyCodeVocabulary('try fast api').text).toBe('try FastAPI');
    expect(applyCodeVocabulary('use tensor flow').text).toBe('use TensorFlow');
  });

  it('corrects split async/await', () => {
    expect(applyCodeVocabulary('use a sync a wait').text).toBe('use async await');
  });

  it('corrects cloud terms', () => {
    expect(applyCodeVocabulary('use terra form for infra').text).toBe('use Terraform for infra');
    expect(applyCodeVocabulary('deploy cloud formation').text).toBe('deploy CloudFormation');
  });

  it('handles case-insensitive matching', () => {
    expect(applyCodeVocabulary('JAVA SCRIPT is great').text).toBe('JavaScript is great');
    expect(applyCodeVocabulary('Java Script rocks').text).toBe('JavaScript rocks');
  });

  it('does not modify text without matches', () => {
    const input = 'this is a normal sentence with no code terms';
    const { text, corrections } = applyCodeVocabulary(input);
    expect(text).toBe(input);
    expect(corrections).toBe(0);
  });

  it('handles multiple corrections in one transcript', () => {
    const { text, corrections } = applyCodeVocabulary(
      'use type script with react js and deploy to a w s with terra form'
    );
    expect(text).toBe('use TypeScript with React.js and deploy to AWS with Terraform');
    expect(corrections).toBeGreaterThanOrEqual(4);
  });

  it('respects word boundaries — no partial matches', () => {
    // "int" should not match inside "interesting" or "print"
    const { text } = applyCodeVocabulary('interesting print');
    expect(text).toBe('interesting print');
  });

  it('corrects data structure names', () => {
    expect(applyCodeVocabulary('use a hash map').text).toBe('use a HashMap');
    expect(applyCodeVocabulary('create an array list').text).toBe('create an ArrayList');
  });

  it('corrects localhost', () => {
    expect(applyCodeVocabulary('run on local host').text).toBe('run on localhost');
  });
});
