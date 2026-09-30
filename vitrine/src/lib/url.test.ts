import { describe, expect, it } from 'vitest';
import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState } from './url';

describe('état dans l’URL', () => {
  it('omet les valeurs par défaut', () => {
    expect(serializeUrlState(DEFAULT_URL_STATE)).toBe('');
  });

  it('fait l’aller-retour', () => {
    const state = {
      query: 'widget android',
      languages: ['Kotlin', 'C#'],
      release: 'with' as const,
      sort: 'stars' as const,
      repo: 'Mago',
      tag: 'v0.1.0-12',
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('ignore les valeurs inconnues et un tag sans dépôt', () => {
    expect(parseUrlState('?sort=pif&release=peut-etre&tag=v1&lang=Go,,Go')).toEqual({
      ...DEFAULT_URL_STATE,
      languages: ['Go'],
    });
  });

  it('préserve les paramètres étrangers', () => {
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, query: 'x' }, '?utm_source=mail&q=ancien')).toBe('?utm_source=mail&q=x');
  });
});
