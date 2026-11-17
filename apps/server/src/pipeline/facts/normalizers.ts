const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '₹': 'INR',
};

const CURRENCY_WORDS: Record<string, string> = {
  usd: 'USD',
  dollars: 'USD',
  gbp: 'GBP',
  pounds: 'GBP',
  eur: 'EUR',
  euros: 'EUR',
  inr: 'INR',
  rs: 'INR',
  rupees: 'INR',
};

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lac: 100_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  crore: 10_000_000,
  cr: 10_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Dates are normalised to ISO so two documents written in different styles can
 * still be compared. Ambiguous numeric dates are read as day-first, which is
 * the convention of the sample set; the raw value is always kept alongside.
 */
export function normalizeDate(input: string): string | null {
  const text = input.trim();

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return buildIso(Number(year), Number(month), Number(day));
  }

  const named = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})\b/,
  );
  if (named) {
    const [, day, monthName, year] = named;
    const month = MONTHS[(monthName ?? '').toLowerCase()];
    if (month) return buildIso(Number(year), month, Number(day));
  }

  const namedFirst = text.match(/\b([A-Za-z]{3,9})[\s-]+(\d{1,2})(?:st|nd|rd|th)?[\s,-]+(\d{4})\b/);
  if (namedFirst) {
    const [, monthName, day, year] = namedFirst;
    const month = MONTHS[(monthName ?? '').toLowerCase()];
    if (month) return buildIso(Number(year), month, Number(day));
  }

  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (numeric) {
    const [, first, second, yearPart] = numeric;
    let day = Number(first);
    let month = Number(second);
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    const yearNumber = Number(yearPart);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    return buildIso(year, month, day);
  }

  return null;
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export interface MoneyValue {
  amount: number;
  currency: string | null;
}

/** Reads an amount with its currency, resolving suffixes like "2.4 million". */
export function parseMoney(input: string): MoneyValue | null {
  const text = input.trim();
  const symbolMatch = text.match(/[$£€₹]/);
  const wordMatch = text.toLowerCase().match(/\b(usd|gbp|eur|inr|rs|rupees|dollars|pounds|euros)\b/);

  const numberMatch = text.match(/-?\d[\d,\s]*(?:\.\d+)?/);
  if (!numberMatch) return null;

  const digits = numberMatch[0].replace(/[,\s]/g, '');
  let amount = Number(digits);
  if (!Number.isFinite(amount)) return null;

  const after = text.slice(numberMatch.index! + numberMatch[0].length).toLowerCase().trim();
  const multiplierKey = after.match(/^([a-z]+)/)?.[1];
  if (multiplierKey && MULTIPLIERS[multiplierKey]) {
    amount *= MULTIPLIERS[multiplierKey];
  }

  if (/\(\s*-?\d/.test(text) || /^\(.*\)$/.test(text)) {
    amount = -Math.abs(amount);
  }

  const currency = symbolMatch
    ? (CURRENCY_SYMBOLS[symbolMatch[0]] ?? null)
    : wordMatch
      ? (CURRENCY_WORDS[wordMatch[1] ?? ''] ?? null)
      : null;

  return { amount, currency };
}

/**
 * Comparison form for money is the amount alone. Currency is deliberately
 * excluded so "INR 402,000" and a bare "402000" in a CSV still match; a
 * currency mismatch is reported separately during comparison.
 */
export function normalizeMoney(input: string): string | null {
  const money = parseMoney(input);
  if (!money) return null;
  return Number.isInteger(money.amount) ? money.amount.toString() : money.amount.toFixed(2);
}

const NAME_NOISE = /\b(pvt|private|ltd|limited|llp|inc|incorporated|co|company|corp|corporation|plc|gmbh|mr|mrs|ms|dr)\b/g;

/** Strips titles and company suffixes so "Acme Ltd" and "ACME" line up. */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/[^a-z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ADDRESS_NOISE: Array<[RegExp, string]> = [
  [/\bstreet\b/g, 'st'],
  [/\broad\b/g, 'rd'],
  [/\bavenue\b/g, 'ave'],
  [/\bsuite\b/g, 'ste'],
  [/\bfloor\b/g, 'flr'],
  [/\bapartment\b/g, 'apt'],
  [/\bbuilding\b/g, 'bldg'],
];

export function normalizeAddress(input: string): string {
  let text = input.toLowerCase().replace(/[.,#]/g, ' ');
  for (const [pattern, replacement] of ADDRESS_NOISE) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeIdentifier(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeGeneric(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}
