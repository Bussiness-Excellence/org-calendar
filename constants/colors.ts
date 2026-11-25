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
  // Light: calm white panels on a soft blue-grey page; navy for selection controls,
  // cyan for highlights, orange for "today" and the main action.
  light: {
    text: '#0F1B33',
    tint: '#1B2A4A',
    background: '#EEF2F7',
    foreground: '#0F1B33',
    card: '#FFFFFF',
    cardForeground: '#0F1B33',
    primary: '#1B2A4A',
    primaryForeground: '#FFFFFF',
    secondary: '#F5F8FB',
    secondaryForeground: '#3B4A63',
    muted: '#EEF2F7',
    mutedForeground: '#5D6C84',
    accent: '#E7F3FA',
    accentForeground: '#1F7FAE',
    destructive: '#B0304A',
    destructiveForeground: '#FFFFFF',
    border: '#E3E9F1',
    input: '#C9D4E1',
    success: '#157A3B',
    successSurface: '#E3F6EA',
    warning: '#9A5A0B',
    warningSurface: '#FFF4E5',
    // theme extras
    highlight: '#1F7FAE',
    highlightForeground: '#FFFFFF',
    cta: '#F0952A',
    ctaEnd: '#E8890F',
    ctaForeground: '#1B2A4A',
    today: '#E8890F',
    todayText: '#B8650A',
    todaySurface: '#FFF4E5',
    tile: '#FFFFFF',
    tileBorder: '#E6ECF3',
    tileMuted: '#F8FAFD',
    faint: '#A6B2C3',
    statSurface: '#F3F7FB',
    iconSurface: '#F1F5F9',
    segment: '#EEF2F7',
    segmentActive: '#1B2A4A',
    segmentActiveForeground: '#FFFFFF',
    shadow: 'rgba(15, 27, 51, 0.07)',
  },
  // Dark: deep navy with cyan selection and the same orange for "today".
  dark: {
    text: '#EEF3FB',
    tint: '#5CC3EC',
    background: '#0B1226',
    foreground: '#EEF3FB',
    card: '#162040',
    cardForeground: '#EEF3FB',
    primary: '#5CC3EC',
    primaryForeground: '#0B1630',
    secondary: '#121B36',
    secondaryForeground: '#BAC6DC',
    muted: '#1D2A50',
    mutedForeground: '#93A2C0',
    accent: '#17345A',
    accentForeground: '#93D6F3',
    destructive: '#F08098',
    destructiveForeground: '#220910',
    border: '#25345E',
    input: '#33447A',
    success: '#6EE7B7',
    successSurface: '#123A35',
    warning: '#F6B25A',
    warningSurface: '#3A2A16',
    highlight: '#5CC3EC',
    highlightForeground: '#0B1630',
    cta: '#F29A2E',
    ctaEnd: '#F6BD72',
    ctaForeground: '#1B2A4A',
    today: '#F29A2E',
    todayText: '#F6B25A',
    todaySurface: '#2E2A3A',
    tile: '#111A34',
    tileBorder: '#22305A',
    tileMuted: '#0E162D',
    faint: '#4F5D80',
    statSurface: '#1D2A50',
    iconSurface: '#1D2A50',
    segment: '#0F1730',
    segmentActive: '#5CC3EC',
    segmentActiveForeground: '#0B1630',
    shadow: 'rgba(0, 0, 0, 0.35)',
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

/** A tinted chip for a color: soft background, readable text (light or dark theme). */
export function chipColors(color: string, scheme: 'light' | 'dark' | string): { background: string; text: string; bar: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(color || '');
  if (!m) return { background: 'transparent', text: color, bar: color };
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (to: number, amount: number) => rgb.map((c) => Math.round(c + (to - c) * amount));
  const hex = (v: number[]) => `#${v.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  const dark = scheme === 'dark';
  return {
    background: `rgba(${rgb.join(', ')}, ${dark ? 0.2 : 0.12})`,
    text: hex(dark ? mix(255, 0.5) : mix(0, 0.45)),
    bar: color,
  };
}
