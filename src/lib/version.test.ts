import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  it('compare le numéro de build numériquement', () => {
    expect(isNewerVersion('v0.1.0-100', 'v0.1.0-32')).toBe(true);
    expect(isNewerVersion('v0.1.0-33', 'v0.1.0-32')).toBe(true);
    expect(isNewerVersion('v0.1.0-9', 'v0.1.0-32')).toBe(false);
  });

  it('ne propose jamais une version plus ancienne ni la même', () => {
    expect(isNewerVersion('v0.1.0-31', 'v0.1.0-32')).toBe(false);
    expect(isNewerVersion('v0.1.0-32', 'v0.1.0-32')).toBe(false);
    expect(isNewerVersion('v0.0.9-500', 'v0.1.0-1')).toBe(false);
  });

  it('la version de package.json passe avant le numéro de build', () => {
    expect(isNewerVersion('v0.2.0-1', 'v0.1.0-500')).toBe(true);
    expect(isNewerVersion('v1.0.0-1', 'v0.9.9-999')).toBe(true);
  });

  it('parties manquantes = 0', () => {
    expect(isNewerVersion('v0.1.0-1', 'v0.1.0')).toBe(true);
    expect(isNewerVersion('v0.1.0', 'v0.1.0-0')).toBe(false);
  });

  it('refuse un tag illisible', () => {
    expect(isNewerVersion('dernière', 'v0.1.0-32')).toBe(false);
    expect(isNewerVersion('v0.1.0-33', 'dev')).toBe(false);
  });
});
