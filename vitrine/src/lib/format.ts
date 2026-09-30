import { CONFIG } from '../config';

const locale = CONFIG.locale;

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
const longDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });
const shortDate = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' });
const integer = new Intl.NumberFormat(locale);
const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** « il y a 3 heures », « hier », « il y a 2 semaines »… (seuils façon GitHub). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  if (!Number.isFinite(diff)) return '';
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  const fmt = (value: number, unit: Intl.RelativeTimeFormatUnit) => rtf.format(sign * Math.max(1, Math.round(value)), unit);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * MINUTE) return fmt(abs / MINUTE, 'minute');
  if (abs < 22 * HOUR) return fmt(abs / HOUR, 'hour');
  if (abs < 7 * DAY) return fmt(abs / DAY, 'day');
  if (abs < 28 * DAY) return fmt(abs / (7 * DAY), 'week');
  if (abs < 335 * DAY) return fmt(abs / (30.44 * DAY), 'month');
  return fmt(abs / (365.25 * DAY), 'year');
}

export const formatDate = (iso: string) => longDate.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatInteger = (n: number) => integer.format(n);
export const formatCompact = (n: number) => compact.format(n);

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;

/** Taille lisible, unités localisées (« 5,2 Mo » en français). */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: BYTE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** Accord simple : `plural(3, 'version')` → « 3 versions ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatInteger(count)} ${Math.abs(count) >= 2 ? pluralForm : singular}`;
}
