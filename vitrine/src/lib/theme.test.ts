import { describe, expect, it } from 'vitest';
import { ICON_NAMES, materialSymbolsUrl } from './icons';
import { accentKey, languageColor } from './languages';
import { SHAPE_NAMES, SHAPE_POINTS, shapeClipPath, shapeFor, shapePath } from './shapes';
import { SYSTEM_ROLES, accentCss, isHexColor, kebab, systemColors, themeCss } from './theme';

describe('palette Material You', () => {
  it('génère tous les rôles, en hexadécimal, pour les deux modes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const colors = systemColors('#7C5CFF', mode, 'vibrant');
      expect(Object.keys(colors)).toEqual([...SYSTEM_ROLES]);
      for (const hex of Object.values(colors)) expect(isHexColor(hex)).toBe(true);
    }
  });

  it('respecte le contraste de base : surface sombre en mode sombre', () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(systemColors('#7C5CFF', 'dark', 'vibrant').surface)).toBeLessThan(150);
    expect(lum(systemColors('#7C5CFF', 'light', 'vibrant').surface)).toBeGreaterThan(600);
  });

  it('themeCss produit un bloc par mode avec les variables --md-*', () => {
    const css = themeCss('#0b57d0', 'tonalSpot');
    expect(css).toContain(':root[data-theme="dark"]{--md-primary:#');
    expect(css).toContain(':root[data-theme="light"]{');
    expect(css.match(/--md-surface-container-highest:/g)).toHaveLength(2);
    expect(kebab('onSurfaceVariant')).toBe('on-surface-variant');
  });

  it('accentCss ignore les entrées invalides', () => {
    const css = accentCss(
      [
        { key: 'lang-kotlin', color: '#a97bff' },
        { key: 'x"]{}', color: '#000000' },
        { key: 'lang-go', color: 'blue' },
      ],
      'vibrant',
    );
    expect(css.split('\n')).toHaveLength(2);
    expect(css).toContain('[data-accent="lang-kotlin"]{--accent:#');
  });
});

describe('langages', () => {
  it('couleurs Linguist, sinon teinte stable', () => {
    expect(languageColor('TypeScript')).toBe('#3178c6');
    expect(languageColor('Brainfuck')).toBe(languageColor('Brainfuck'));
    expect(isHexColor(languageColor('Brainfuck'))).toBe(true);
    expect(isHexColor(languageColor(null))).toBe(true);
  });

  it('clés CSS sûres', () => {
    expect(accentKey('C++')).toBe('lang-cpp');
    expect(accentKey('C#')).toBe('lang-csharp');
    expect(accentKey('Jupyter Notebook')).toBe('lang-jupyter-notebook');
    expect(accentKey(null)).toBe('none');
  });
});

describe('formes expressives', () => {
  it('ont toutes le même nombre de points (morphing possible)', () => {
    for (const name of SHAPE_NAMES) {
      expect(shapePath(name).split('L')).toHaveLength(SHAPE_POINTS);
      expect(shapeClipPath(name).split(',')).toHaveLength(SHAPE_POINTS);
    }
  });

  it('restent dans la viewBox 0–100', () => {
    for (const name of SHAPE_NAMES) {
      const numbers = shapePath(name).match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(100);
    }
  });

  it('attribue une forme stable et décorative', () => {
    expect(shapeFor('Mago')).toBe(shapeFor('Mago'));
    expect(shapeFor('Mago')).not.toBe('circle');
  });
});

describe('icônes', () => {
  it('liste triée et sans doublon (exigé par icon_names de Google Fonts)', () => {
    expect([...ICON_NAMES]).toEqual([...new Set(ICON_NAMES)].sort());
    expect(materialSymbolsUrl()).toContain(`icon_names=${ICON_NAMES.join(',')}`);
  });
});
