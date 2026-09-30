import { describe, expect, it } from 'vitest';
import { formatBytes, plural, relativeTime } from './format';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('relativeTime (fr-FR)', () => {
  it('suit des seuils lisibles', () => {
    expect(relativeTime(ago(10), NOW)).toBe('maintenant');
    expect(relativeTime(ago(5 * 60), NOW)).toBe('il y a 5 minutes');
    expect(relativeTime(ago(3 * 3600), NOW)).toBe('il y a 3 heures');
    expect(relativeTime(ago(26 * 3600), NOW)).toBe('hier');
    expect(relativeTime(ago(3 * 86400), NOW)).toBe('il y a 3 jours');
    expect(relativeTime(ago(15 * 86400), NOW)).toBe('il y a 2 semaines');
    expect(relativeTime(ago(95 * 86400), NOW)).toBe('il y a 3 mois');
    expect(relativeTime(ago(800 * 86400), NOW)).toBe('il y a 2 ans');
  });

  it('résiste à une date invalide', () => {
    expect(relativeTime('pas une date', NOW)).toBe('');
  });
});

describe('formats', () => {
  it('formatBytes utilise les unités françaises', () => {
    // Intl sépare nombre et unité par une espace fine insécable.
    const bytes = (n: number) => formatBytes(n).replace(/\s/g, ' ');
    expect(bytes(512)).toBe('512 o');
    expect(bytes(5_234_000)).toBe('5,2 Mo');
    expect(bytes(1_500_000_000)).toBe('1,5 Go');
  });

  it('plural accorde à partir de 2', () => {
    expect(plural(0, 'version')).toBe('0 version');
    expect(plural(1, 'version')).toBe('1 version');
    expect(plural(12, 'version')).toBe('12 versions');
  });
});
