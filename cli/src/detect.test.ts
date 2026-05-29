import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectLanguages, parseLanguages } from './detect.js';

describe('detectLanguages', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coderigup-detect-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty for an empty project', () => {
    expect(detectLanguages(dir)).toEqual([]);
  });

  it('detects node from package.json at root', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(detectLanguages(dir)).toEqual(['node']);
  });

  it('detects python from pyproject.toml at root', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    expect(detectLanguages(dir)).toEqual(['python']);
  });

  it('detects python from requirements.txt fallback', () => {
    writeFileSync(join(dir, 'requirements.txt'), '');
    expect(detectLanguages(dir)).toEqual(['python']);
  });

  it('detects go from go.mod at root', () => {
    writeFileSync(join(dir, 'go.mod'), 'module example');
    expect(detectLanguages(dir)).toEqual(['go']);
  });

  it('detects frontend from a .tsx file', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '');
    expect(detectLanguages(dir)).toEqual(['frontend']);
  });

  it('detects frontend from vite.config.ts', () => {
    writeFileSync(join(dir, 'vite.config.ts'), '');
    expect(detectLanguages(dir)).toEqual(['frontend']);
  });

  it('detects frontend from next.config.js', () => {
    writeFileSync(join(dir, 'next.config.js'), '');
    expect(detectLanguages(dir)).toEqual(['frontend']);
  });

  it('detects frontend when package.json contains "react"', () => {
    writeFileSync(join(dir, 'package.json'), '{"dependencies":{"react":"18"}}');
    expect(detectLanguages(dir)).toEqual(['node', 'frontend']);
  });

  it('returns languages in canonical order: node, python, go, frontend', () => {
    writeFileSync(join(dir, 'go.mod'), '');
    writeFileSync(join(dir, 'pyproject.toml'), '');
    writeFileSync(join(dir, 'package.json'), '{}');
    expect(detectLanguages(dir)).toEqual(['node', 'python', 'go']);
  });

  it('finds a marker one subdirectory deep (within maxdepth 2)', () => {
    mkdirSync(join(dir, 'apps'));
    writeFileSync(join(dir, 'apps', 'package.json'), '{}');
    expect(detectLanguages(dir)).toEqual(['node']);
  });

  it('does not find a marker two subdirectories deep (beyond maxdepth 2)', () => {
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    writeFileSync(join(dir, 'a', 'b', 'package.json'), '{}');
    expect(detectLanguages(dir)).toEqual([]);
  });

  it('finds .tsx three subdirectories deep (within maxdepth 4)', () => {
    mkdirSync(join(dir, 'apps', 'web', 'src'), { recursive: true });
    writeFileSync(join(dir, 'apps', 'web', 'src', 'App.tsx'), '');
    expect(detectLanguages(dir)).toEqual(['frontend']);
  });

  it('does not find .tsx four subdirectories deep (beyond maxdepth 4)', () => {
    mkdirSync(join(dir, 'a', 'b', 'c', 'd'), { recursive: true });
    writeFileSync(join(dir, 'a', 'b', 'c', 'd', 'App.tsx'), '');
    expect(detectLanguages(dir)).toEqual([]);
  });
});

describe('parseLanguages', () => {
  it('parses a comma-separated list', () => {
    expect(parseLanguages('node,python,go')).toEqual(['node', 'python', 'go']);
  });

  it('trims whitespace around each value', () => {
    expect(parseLanguages(' node , python ')).toEqual(['node', 'python']);
  });

  it('drops empty segments', () => {
    expect(parseLanguages('node,,python')).toEqual(['node', 'python']);
  });

  it('drops unknown languages', () => {
    expect(parseLanguages('node,rust,python')).toEqual(['node', 'python']);
  });

  it('returns empty array for an empty string', () => {
    expect(parseLanguages('')).toEqual([]);
  });
});
