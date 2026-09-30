import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { CONFIG } from './src/config.ts';
import { materialSymbolsUrl } from './src/lib/icons.ts';
import { systemColors, themeCss } from './src/lib/theme.ts';

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:wdth,wght@100..125,400..800&display=swap';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Injecte dans index.html ce qui doit exister avant le premier rendu :
 * titre/description de config.json, polices, et la palette M3 générée depuis
 * `accentColor` (sinon le fond clignoterait le temps que le JS la calcule).
 */
function vitrineHtml(): Plugin {
  return {
    name: 'vitrine-html',
    transformIndexHtml(html) {
      const surface = systemColors(CONFIG.accentColor, CONFIG.defaultTheme, CONFIG.paletteStyle).surface;
      const head = [
        `<meta name="theme-color" content="${surface}" />`,
        `<link rel="stylesheet" href="${escapeHtml(FONTS_URL)}" />`,
        `<link rel="stylesheet" href="${escapeHtml(materialSymbolsUrl())}" />`,
        `<style id="vitrine-theme">${themeCss(CONFIG.accentColor, CONFIG.paletteStyle)}</style>`,
      ].join('\n    ');
      return html
        .replaceAll('%VITRINE_TITLE%', escapeHtml(CONFIG.title))
        .replaceAll('%VITRINE_DESCRIPTION%', escapeHtml(CONFIG.description))
        .replaceAll('%VITRINE_DEFAULT_THEME%', CONFIG.defaultTheme)
        .replace('<!-- vitrine:head -->', head);
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le site fonctionne aussi bien sur <user>.github.io/
  // que sur <user>.github.io/<dépôt>/, sans configuration.
  base: './',
  plugins: [react(), tailwindcss(), vitrineHtml()],
  build: {
    rolldownOptions: {
      output: {
        // Bibliothèques stables dans leurs propres fichiers (meilleur cache
        // entre deux déploiements, qui ne changent en général que data.json).
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            { name: 'material-color', test: /node_modules[\\/]@material[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
