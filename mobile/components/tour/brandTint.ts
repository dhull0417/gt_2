import type { SquircleTint } from '@/components/ui/SquircleTile';
import type { ThemeColors } from '@/constants/theme';

// Tour colours for targets that aren't coloured tiles (buttons, links, header icons): the brand
// blue, with the same pale chip as the blue Group Details tile.
export const brandTourTint = (colors: Pick<ThemeColors, 'brand'>, isDark: boolean): SquircleTint => ({
  bg: isDark ? '#1A2A42' : '#EEF6FF',
  border: isDark ? '#2C4870' : '#BFDBFE',
  fg: colors.brand,
});
