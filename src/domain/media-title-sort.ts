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
const CJK_TRAILING_INSTALLMENT = /(?:[\s\u3000]*[-–—·:：]?\s*)第?(\d+(?:\.5)?)(季|期|部|卷|巻|冊|册|章|話|话|集|クール)$/u;
const EN_TRAILING_INSTALLMENT = /(?:[\s_-]+)(season|part|vol(?:ume)?)[\s._-]*(\d+(?:\.5)?)$/iu;
const KO_TRAILING_INSTALLMENT = /(?:[\s_-]+)(\d+(?:\.5)?)(기|권)$/u;

const INSTALLMENT_KIND_ORDER = {
  season: 0,
  part: 1,
  volume: 2,
  chapter: 3,
  episode: 4,
} as const;

type InstallmentKind = keyof typeof INSTALLMENT_KIND_ORDER;

export interface StructuralMediaTitleKey {
  base: string;
  kind: InstallmentKind | null;
  number: number | null;
  full: string;
}

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

export function naturalMediaTitleKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(STRUCTURAL_ORDINAL, (match, numeral: string) => {
      const number = chineseOrdinalValue(numeral);
      return number === null ? match : `第${number}`;
    });
}

function cjkInstallmentKind(unit: string): InstallmentKind {
  if (unit === "季" || unit === "期" || unit === "クール") return "season";
  if (unit === "部") return "part";
  if (unit === "卷" || unit === "巻" || unit === "冊" || unit === "册") return "volume";
  if (unit === "章") return "chapter";
  return "episode";
}

/**
 * Split an explicit trailing season/part/volume marker from a title. Only
 * structural suffixes are recognized; ordinary digits inside a work title are
 * left untouched. This lets chronological installments stay adjacent without
 * guessing franchise identity from arbitrary shared prefixes.
 */
export function structuralMediaTitleKey(value: string | null | undefined): StructuralMediaTitleKey {
  const full = naturalMediaTitleKey(value).trim();
  const cjk = CJK_TRAILING_INSTALLMENT.exec(full);
  if (cjk) {
    return {
      base: full.slice(0, cjk.index).trimEnd(),
      kind: cjkInstallmentKind(cjk[2]),
      number: Number(cjk[1]),
      full,
    };
  }

  const english = EN_TRAILING_INSTALLMENT.exec(full);
  if (english) {
    const token = english[1].toLocaleLowerCase();
    return {
      base: full.slice(0, english.index).trimEnd(),
      kind: token === "season" ? "season" : token === "part" ? "part" : "volume",
      number: Number(english[2]),
      full,
    };
  }

  const korean = KO_TRAILING_INSTALLMENT.exec(full);
  if (korean) {
    return {
      base: full.slice(0, korean.index).trimEnd(),
      kind: korean[2] === "기" ? "season" : "volume",
      number: Number(korean[1]),
      full,
    };
  }

  return { base: full, kind: null, number: null, full };
}

/**
 * Natural ascending title order shared by Library and Timeline. Explicit
 * structural installments are grouped by their base work first, then ordered
 * numerically (for example Season 1, Season 2, Season 10 or 卷 1, 卷 2, 卷 10).
 * Ordinary title text keeps locale-aware Traditional Chinese/Japanese
 * collation and is never reduced to a guessed franchise prefix.
 */
export type MediaInstallmentSortDirection = "asc" | "desc";

export function compareMediaTitlesByInstallment(
  left: string | null | undefined,
  right: string | null | undefined,
  installmentDirection: MediaInstallmentSortDirection = "asc",
): number {
  const leftText = left ?? "";
  const rightText = right ?? "";
  const leftKey = structuralMediaTitleKey(leftText);
  const rightKey = structuralMediaTitleKey(rightText);

  const baseOrder = mediaTitleCollator.compare(leftKey.base, rightKey.base);
  if (baseOrder) return baseOrder;

  if (leftKey.kind !== null || rightKey.kind !== null) {
    if (leftKey.kind === null) return -1;
    if (rightKey.kind === null) return 1;
    const kindOrder = INSTALLMENT_KIND_ORDER[leftKey.kind] - INSTALLMENT_KIND_ORDER[rightKey.kind];
    if (kindOrder) return kindOrder;
    const numberOrder = (leftKey.number ?? Number.POSITIVE_INFINITY) - (rightKey.number ?? Number.POSITIVE_INFINITY);
    if (Number.isFinite(numberOrder) && numberOrder !== 0) {
      return installmentDirection === "desc" ? -numberOrder : numberOrder;
    }
  }

  const normalizedOrder = mediaTitleCollator.compare(leftKey.full, rightKey.full);
  if (normalizedOrder) return normalizedOrder;
  return mediaTitleCollator.compare(leftText, rightText);
}

export function compareMediaTitles(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return compareMediaTitlesByInstallment(left, right, "asc");
}
