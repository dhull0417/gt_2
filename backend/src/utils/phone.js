// Digits-only phone numbers become E.164 (+1 assumed for 10-digit US numbers), matching how Clerk stores them.
export const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits.length >= 8 ? digits : null;
  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.length === 10) return `+1${onlyDigits}`;
  if (onlyDigits.length === 11 && onlyDigits.startsWith('1')) return `+${onlyDigits}`;
  return null;
};
