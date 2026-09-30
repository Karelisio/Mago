// Icônes Material Symbols Rounded réellement utilisées : seules celles-ci sont
// téléchargées (paramètre icon_names de Google Fonts, qui exige un ordre
// alphabétique — vérifié par icons.test.ts).
export const ICON_NAMES = [
  'adjust',
  'android',
  'arrow_forward',
  'arrow_outward',
  'auto_awesome',
  'balance',
  'business',
  'call_split',
  'check',
  'chevron_left',
  'chevron_right',
  'close',
  'code',
  'dark_mode',
  'deployed_code',
  'description',
  'desktop_windows',
  'download',
  'error',
  'expand_more',
  'folder_zip',
  'group',
  'history',
  'inventory_2',
  'language',
  'laptop_mac',
  'light_mode',
  'link',
  'location_on',
  'new_releases',
  'palette',
  'picture_as_pdf',
  'refresh',
  'rocket_launch',
  'schedule',
  'search',
  'search_off',
  'sell',
  'star',
  'terminal',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function materialSymbolsUrl(names: readonly string[] = ICON_NAMES): string {
  const sorted = [...new Set(names)].sort();
  return (
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200' +
    `&icon_names=${sorted.join(',')}&display=block`
  );
}
