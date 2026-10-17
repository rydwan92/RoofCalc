import { describe, expect, it } from 'vitest';
import {
  parseDocumentNumber,
  percentSlopeToDegrees,
  scanMeasurementTokens,
  toSuperscriptDigits,
  writtenDecimals,
} from './tokens';

const kinds = (line: string) =>
  scanMeasurementTokens(line).map((token) => {
    switch (token.kind) {
      case 'length':
        return `length:${token.value}${token.unit ?? ''}`;
      case 'pair':
        return `pair:${token.first}${token.separator}${token.second}${token.unit ?? ''}`;
      case 'angle':
        return `angle:${token.degrees}`;
      case 'percent':
        return `percent:${token.percent}`;
      case 'scale':
        return `scale:${token.denominator}`;
    }
  });

describe('document number parsing', () => {
  it.each([
    ['12,40', 12.4],
    ['12.40', 12.4],
    ['1240', 1240],
    ['1 240', 1240],
    ['0,9', 0.9],
    ['12\u00a0400', 12400],
  ])('%s → %s', (text, value) => {
    expect(parseDocumentNumber(text)).toBe(value);
  });

  it.each([
    ['38\u2075', 38.5],
    ['124\u2075', 124.5],
    ['1 24\u2075', 124.5],
  ])('reads a raised half centimetre: %s → %s', (text, value) => {
    expect(parseDocumentNumber(text)).toBe(value);
  });

  it('never stacks a superscript on a decimal fraction', () => {
    expect(parseDocumentNumber('12,4\u2075')).toBeUndefined();
  });

  it('counts the decimal places as written', () => {
    expect(writtenDecimals('12,40')).toBe(2);
    expect(writtenDecimals('38\u2075')).toBe(1);
    expect(writtenDecimals('1240')).toBe(0);
    expect(toSuperscriptDigits('5')).toBe('\u2075');
  });

  it('rejects non-numbers', () => {
    expect(parseDocumentNumber('12a')).toBeUndefined();
    expect(parseDocumentNumber('')).toBeUndefined();
  });
});

describe('measurement token scanning', () => {
  it.each([
    ['Długość budynku: 12,40 m', ['length:12.4m']],
    ['Okap 50cm', ['length:50cm']],
    ['rozstaw co 0,9 m', ['length:0.9m']],
    ['1240', ['length:1240']],
    ['12 400 mm', ['length:12400mm']],
    ['Kąt nachylenia 35°', ['angle:35']],
    ['kąt 35 st.', ['angle:35']],
    ['nachylenie 40 stopni', ['angle:40']],
    ['Spadek 70%', ['percent:70']],
    ['krokwie 8x18 cm', ['pair:8x18cm']],
    ['krokwie 8×18 co 90 cm', ['pair:8x18', 'length:90cm']],
    ['przekrój 80/180 mm', ['pair:80/180mm']],
    ['Wymiary 12,40 m × 9,60 m', ['pair:12.4x9.6m']],
    ['SKALA 1:100', ['scale:100']],
    ['M 1 : 50', ['scale:50']],
    ['38\u2075', ['length:38.5']],
    ['320 600 32\u2075', ['length:320', 'length:600', 'length:32.5']],
  ])('%s', (line, expected) => {
    expect(kinds(line)).toEqual(expected);
  });

  it('does not read areas, money, identifiers or dates as lengths', () => {
    expect(kinds('Powierzchnia 120 m²')).toEqual([]);
    expect(kinds('Powierzchnia 120 m2')).toEqual([]);
    expect(kinds('K1 H1 J1 A4')).toEqual([]);
    expect(kinds('Ø12')).toEqual([]);
    expect(kinds('cena 45 zł')).toEqual([]);
    expect(kinds('15.10.2026')).toEqual([]);
    expect(kinds('masa 12 kg')).toEqual([]);
  });

  it('keeps character offsets of every token', () => {
    const line = 'Okap: 50 cm';
    const [token] = scanMeasurementTokens(line);
    expect(line.slice(token!.start, token!.end)).toBe('50 cm');
  });
});

describe('percentage slope', () => {
  it('converts rise/run percent to degrees', () => {
    expect(percentSlopeToDegrees(100)).toBeCloseTo(45, 10);
    // tan(35°) = 0.70021 → 70.021 %
    expect(percentSlopeToDegrees(70.021)).toBeCloseTo(35, 3);
  });
});
