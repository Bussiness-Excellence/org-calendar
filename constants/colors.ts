/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#0C1B2A',
    tint: '#0B4D89',
    background: '#EEF2F6',
    foreground: '#0C1B2A',
    card: '#FFFFFF',
    cardForeground: '#0C1B2A',
    primary: '#0B4D89',
    primaryForeground: '#FFFFFF',
    secondary: '#F6F9FC',
    secondaryForeground: '#41566B',
    muted: '#EDF2F7',
    mutedForeground: '#8298AE',
    accent: '#EAF2FA',
    accentForeground: '#0B4D89',
    destructive: '#B0304A',
    destructiveForeground: '#FFFFFF',
    border: '#DDE5ED',
    input: '#C4D2E0',
    success: '#0E7C5A',
    successSurface: '#E3F5EE',
    warning: '#9A6212',
    warningSurface: '#FDF3E0',
  },
  dark: {
    text: '#E9F1F9',
    tint: '#4E9BDC',
    background: '#080E16',
    foreground: '#E9F1F9',
    card: '#0E1722',
    cardForeground: '#E9F1F9',
    primary: '#4E9BDC',
    primaryForeground: '#06131F',
    secondary: '#131E2C',
    secondaryForeground: '#9BB0C6',
    muted: '#192636',
    mutedForeground: '#5E7690',
    accent: '#12283C',
    accentForeground: '#7FBAEC',
    destructive: '#F08098',
    destructiveForeground: '#220910',
    border: '#1E2D3F',
    input: '#2B3E55',
    success: '#4ECFA0',
    successSurface: '#0D2A21',
    warning: '#E8B863',
    warningSurface: '#2E2312',
  },
  radius: 15,
};

export default colors;

export const eventPalette = [
  '#0B4D89',
  '#0EA5A4',
  '#6366F1',
  '#C2417E',
  '#E8853A',
  '#3F8F4A',
  '#B0304A',
  '#7C3AED',
  '#0891B2',
  '#9A6212',
];
