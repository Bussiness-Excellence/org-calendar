import colors from '@/constants/colors';
import { useScheme } from '@/lib/preferences';

/** Design tokens for the active theme (the person's choice, or the device setting). */
export function useColors() {
  const scheme = useScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius, scheme };
}
