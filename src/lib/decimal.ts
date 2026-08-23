// ================================================================
//  src/lib/decimal.ts — числове ядро децимальника креслення.
//  Порт normalizeDecimal_ з хаба (_ImportList.js): «ЧЗК.001100.023»
//  і «001100.023_Кутик_зм1.pdf» мають те саме ядро «001100.023»,
//  тому нова версія файлу знаходить свою позицію сама, навіть якщо
//  клієнт перейменував префікси.
// ================================================================

export function extractDecimal(s: string): string {
  const str = String(s || '');
  const re = /((?:[A-Za-zА-ЯІЇЄҐа-яіїєґ]{1,12}\.){0,3}(?:\d{2,6}[.\-]){1,7}\d{2,6}(?:-\d{1,3})?)/g;
  let best = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (m[1].length > best.length) best = m[1];
  }
  return best.replace(/^[._\-\s]+|[._\s]+$/g, '');
}

export function normalizeDecimal(s: string): string {
  return extractDecimal(s)
    .replace(/^(?:[A-Za-zА-ЯІЇЄҐа-яіїєґ]{1,12}[.\-])+/, '')
    .replace(/\s+/g, '');
}
