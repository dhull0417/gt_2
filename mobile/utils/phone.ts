/**
 * Turns what someone typed into the E.164 form Clerk expects.
 * US numbers can be typed any way ("(801) 555-1234", "1 801 555 1234"); numbers that start with
 * "+" are treated as international and only have their punctuation removed.
 */
export function toE164US(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Anything else: hand Clerk the digits with a "+" and let it explain what's wrong.
  return `+${digits}`;
}
