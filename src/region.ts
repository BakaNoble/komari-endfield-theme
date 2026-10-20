// Komari versions return either ISO region codes or two regional-indicator emoji.
export function regionCode(region: string): string | null {
  const value = region.trim();
  let code = value;
  if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(value)) {
    code = Array.from(value, letter => String.fromCharCode(letter.codePointAt(0)! - 0x1F1E6 + 65)).join('');
  }
  if (!/^[a-z]{2}$/i.test(code)) return null;
  return code.toUpperCase() === 'UK' ? 'GB' : code.toUpperCase();
}
