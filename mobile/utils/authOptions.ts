export type AuthOption = 'apple' | 'google' | 'email' | 'phone';

/**
 * Which sign-in buttons the welcome screen shows up front, and which sit under "More options".
 * iPhone: Sign in with Apple leads (Apple expects it to be at least as prominent as other
 * sign-in options, and it's the quickest path there). Android has no Apple sign-in, so all three
 * remaining options fit without a toggle.
 */
export function authButtonOrder(platform: string): { primary: AuthOption[]; more: AuthOption[] } {
  if (platform === 'ios') return { primary: ['apple', 'google', 'email'], more: ['phone'] };
  return { primary: ['google', 'email', 'phone'], more: [] };
}
