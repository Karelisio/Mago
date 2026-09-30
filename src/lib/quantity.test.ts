import { describe, expect, it } from 'vitest';
import { formatQuantityInput, parseQuantity } from './quantity';

describe('parseQuantity', () => {
  it('vide = pas de quantité', () => {
    expect(parseQuantity('')).toEqual({ ok: true, value: null });
    expect(parseQuantity('   ')).toEqual({ ok: true, value: null });
  });

  it('accepte la virgule comme le point', () => {
    expect(parseQuantity('1,5')).toEqual({ ok: true, value: 1.5 });
    expect(parseQuantity('1.5')).toEqual({ ok: true, value: 1.5 });
    expect(parseQuantity(' 0,25 ')).toEqual({ ok: true, value: 0.25 });
    expect(parseQuantity(',5')).toEqual({ ok: true, value: 0.5 });
    expect(parseQuantity('2,')).toEqual({ ok: true, value: 2 });
    expect(parseQuantity('12')).toEqual({ ok: true, value: 12 });
  });

  it('refuse ce qui n’est pas un nombre positif simple', () => {
    for (const input of ['abc', '1,5,2', '1.5.2', '1,5kg', '1e3', '-1', '+2', '0', '0,0', '1 5', 'Infinity', 'NaN', '.', ',']) {
      expect(parseQuantity(input)).toEqual({ ok: false });
    }
  });

  it('refuse les quantités démesurées', () => {
    expect(parseQuantity('100000')).toEqual({ ok: true, value: 100000 });
    expect(parseQuantity('100000,5')).toEqual({ ok: false });
  });
});

describe('formatQuantityInput', () => {
  it('affiche à la française et se relit tel quel', () => {
    expect(formatQuantityInput(null)).toBe('');
    expect(formatQuantityInput(1.5)).toBe('1,5');
    expect(formatQuantityInput(3)).toBe('3');
    expect(parseQuantity(formatQuantityInput(0.125))).toEqual({ ok: true, value: 0.125 });
  });
});
