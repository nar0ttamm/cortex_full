/**
 * Best-effort E.164 for outbound SIP. Assumes India (+91) for 10-digit local numbers.
 */
export function normalizeToE164(raw: string, defaultCountryCode = '91'): string {
  const s = (raw || '').trim();
  if (!s) return '';

  if (s.startsWith('+')) {
    const digits = '+' + s.slice(1).replace(/\D/g, '');
    return digits.length > 1 ? digits : '';
  }

  const digitsOnly = s.replace(/\D/g, '');
  if (!digitsOnly) return '';

  if (digitsOnly.startsWith(defaultCountryCode) && digitsOnly.length >= 11) {
    return `+${digitsOnly}`;
  }

  if (defaultCountryCode === '91' && digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}
