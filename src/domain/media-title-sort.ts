const mediaTitleCollator = new Intl.Collator(["zh-Hant", "ja", "en"], {
  numeric: true,
  sensitivity: "base",
});

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  兩: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CHINESE_UNITS: Readonly<Record<string, number>> = {
  十: 10,
  百: 100,
  千: 1000,
};

const STRUCTURAL_ORDINAL = /第([零〇一二兩两三四五六七八九十百千]+)(?=(?:季|期|部|卷|冊|册|章|話|话|集))/gu;

function chineseOrdinalValue(value: string): number | null {
  if (![...value].some((character) => CHINESE_UNITS[character] !== undefined)) {
    const positionalDigits = [...value].map((character) => CHINESE_DIGITS[character]);
    return positionalDigits.every((digit) => digit !== undefined)
      ? Number(positionalDigits.join(""))
      : null;
  }

  let total = 0;
  let digit: number | null = null;
  for (const character of value) {
    const numeric = CHINESE_DIGITS[character];
    if (numeric !== undefined) {
      digit = numeric;
      continue;
    }
    const unit = CHINESE_UNITS[character];
    if (unit === undefined) return null;
    total += (digit ?? 1) * unit;
    digit = null;
  }
  return total + (digit ?? 0);
}

export function naturalMediaTitleKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(STRUCTURAL_ORDINAL, (match, numeral: string) => {
      const number = chineseOrdinalValue(numeral);
      return number === null ? match : `第${number}`;
    });
}

/**
 * Natural ascending title order shared by Library and Timeline. Structural
 * ordinals such as 第一季 / 第十卷 are compared numerically, while ordinary
 * title text keeps locale-aware Traditional Chinese/Japanese collation.
 */
export function compareMediaTitles(left: unknown, right: unknown): number {
  const normalizedOrder = mediaTitleCollator.compare(
    naturalMediaTitleKey(left),
    naturalMediaTitleKey(right),
  );
  if (normalizedOrder) return normalizedOrder;
  return mediaTitleCollator.compare(String(left ?? ""), String(right ?? ""));
}
