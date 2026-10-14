// Design tokens for light/dark mode. These are the JS-side counterparts to
// the raw hex values that are otherwise hardcoded throughout the app's
// StyleSheet/inline styles — screens that use NativeWind classNames instead
// should prefer Tailwind's `dark:` variant directly and only reach for these
// tokens where a color has to be a plain JS value (icon `color` props,
// `backgroundColor` computed conditionally, etc).
//
// Semantic/status colors (brand blue, RSVP teal/coral, success green, etc.)
// are intentionally the same (or nearly so) in both themes — they carry
// meaning independent of light/dark, so shifting them would just make the
// app harder to recognize rather than more readable.

export type ThemeColors = {
  // Page-level backgrounds
  background: string;      // full-screen background (was bg-gray-50 / bg-gray-100)
  backgroundAlt: string;   // secondary background (was bg-gray-100 / bg-gray-200)
  // Cards / sheets / modals
  surface: string;         // "white" card background
  surfaceAlt: string;      // subtly recessed surface (e.g. input fields, disabled rows)
  // Borders
  border: string;          // default hairline border (was #E5E7EB)
  borderStrong: string;    // more visible border (was #D1D5DB)
  // Text
  textPrimary: string;     // headings / primary content (was #111827)
  textSecondary: string;   // body text (was #374151 / #1F2937)
  textMuted: string;       // secondary/meta text (was #6B7280)
  textFaint: string;       // least prominent text/icons (was #9CA3AF)
  placeholder: string;     // TextInput placeholder color
  // Overlays
  overlay: string;         // modal/sheet backdrop
  // Brand + semantic (stable across themes)
  brand: string;
  brandSoft: string;       // brand tint background (e.g. selected pill fill alt)
  accentTeal: string;
  accentCoral: string;
  success: string;
  danger: string;
  warning: string;
};

export const lightColors: ThemeColors = {
  background: '#F9FAFB',
  backgroundAlt: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  placeholder: '#9CA3AF',
  overlay: 'rgba(0,0,0,0.4)',
  brand: '#4A90E2',
  brandSoft: '#EEF6FF',
  accentTeal: '#4FD1C5',
  accentCoral: '#FF7A6E',
  success: '#16A34A',
  danger: '#EF4444',
  warning: '#D97706',
};

export const darkColors: ThemeColors = {
  background: '#0A0C10',
  backgroundAlt: '#14171C',
  surface: '#1C1F26',
  surfaceAlt: '#232730',
  border: '#2C313A',
  borderStrong: '#3A4048',
  textPrimary: '#F3F4F6',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
  textFaint: '#7B8290',
  placeholder: '#6B7280',
  overlay: 'rgba(0,0,0,0.6)',
  brand: '#5B9EE8',
  brandSoft: '#1B2A3C',
  accentTeal: '#4FD1C5',
  accentCoral: '#FF8A7E',
  success: '#22C55E',
  danger: '#F87171',
  warning: '#F0A93A',
};
