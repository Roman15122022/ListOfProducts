import { shoppingUnits, type ParsedShoppingItem, type ShoppingUnit } from "../domain/types";

const unitAliases: Record<string, ShoppingUnit> = {
  pc: "pcs",
  pcs: "pcs",
  "pcs.": "pcs",
  piece: "pcs",
  pieces: "pcs",
  шт: "pcs",
  "шт.": "pcs",
  штука: "pcs",
  штуки: "pcs",
  штук: "pcs",
  штучка: "pcs",
  kg: "kg",
  "kg.": "kg",
  kilogram: "kg",
  kilograms: "kg",
  кг: "kg",
  "кг.": "kg",
  килограмм: "kg",
  килограмма: "kg",
  килограммов: "kg",
  кілограм: "kg",
  кілограми: "kg",
  кілограмів: "kg",
  g: "g",
  "g.": "g",
  gram: "g",
  grams: "g",
  г: "g",
  "г.": "g",
  гр: "g",
  "гр.": "g",
  грамм: "g",
  грамма: "g",
  граммов: "g",
  грам: "g",
  грами: "g",
  грамів: "g",
  l: "l",
  "l.": "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  л: "l",
  "л.": "l",
  литр: "l",
  литра: "l",
  литров: "l",
  літр: "l",
  літри: "l",
  літрів: "l",
  ml: "ml",
  "ml.": "ml",
  мл: "ml",
  "мл.": "ml",
  milliliter: "ml",
  milliliters: "ml",
  миллилитр: "ml",
  миллилитра: "ml",
  мілілітр: "ml",
  мілілітри: "ml",
  мілілітрів: "ml",
  pack: "pack",
  packs: "pack",
  pkg: "pack",
  "pkg.": "pack",
  package: "pack",
  packages: "pack",
  уп: "pack",
  "уп.": "pack",
  упак: "pack",
  "упак.": "pack",
  упаковка: "pack",
  упаковки: "pack",
  пачка: "pack",
  пачки: "pack",
  пакет: "pack",
  пакета: "pack",
  бутылка: "pack",
  бутылки: "pack",
  банка: "pack",
  банки: "pack",
};

const unitExpression = Object.keys(unitAliases)
  .sort((firstValue, secondValue) => secondValue.length - firstValue.length)
  .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const leadingQuantityPattern = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(?:(${unitExpression})\\s*)?(.+)$`,
  "iu",
);
const trailingQuantityPattern = new RegExp(
  `^(.+?)\\s+(\\d+(?:[.,]\\d+)?)(?:\\s*(${unitExpression}))?$`,
  "iu",
);
const compactTrailingQuantityPattern = new RegExp(
  `^(.+?)(\\d+(?:[.,]\\d+)?)(?:\\s*(${unitExpression}))$`,
  "iu",
);

const defaultUnit: ShoppingUnit = "pcs";

interface SpaceSegmentation {
  items: ParsedShoppingItem[];
  tokenLengths: number[];
}

export const isShoppingUnit = (value: unknown): value is ShoppingUnit =>
  typeof value === "string" && shoppingUnits.includes(value as ShoppingUnit);

export const normalizeShoppingUnit = (value: unknown): ShoppingUnit | null => {
  if (typeof value !== "string") {
    return null;
  }

  return unitAliases[value.trim().toLocaleLowerCase()] ?? null;
};

export const normalizeProductName = (value: string): string =>
  value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeDisplayName = (value: string): string =>
  value
    .replace(/^[\s\-*•]+/u, "")
    .replace(/\s+/g, " ")
    .trim();

const getUnit = (value: string | undefined): ShoppingUnit => {
  if (!value) {
    return defaultUnit;
  }

  return normalizeShoppingUnit(value) ?? defaultUnit;
};

const getQuantity = (value: string): number => {
  const quantity = Number(value.replace(",", "."));

  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const parseSegment = (segment: string): ParsedShoppingItem | null => {
  const cleanedSegment = normalizeDisplayName(segment);

  if (!cleanedSegment) {
    return null;
  }

  const leadingMatch = cleanedSegment.match(leadingQuantityPattern);
  if (leadingMatch) {
    const name = normalizeDisplayName(leadingMatch[3]);
    const normalizedName = normalizeProductName(name);

    if (normalizedName) {
      return {
        name,
        normalizedName,
        quantity: getQuantity(leadingMatch[1]),
        unit: getUnit(leadingMatch[2]),
      };
    }
  }

  const trailingMatch =
    cleanedSegment.match(trailingQuantityPattern) ??
    cleanedSegment.match(compactTrailingQuantityPattern);

  if (trailingMatch) {
    const name = normalizeDisplayName(trailingMatch[1]);
    const normalizedName = normalizeProductName(name);

    if (normalizedName) {
      return {
        name,
        normalizedName,
        quantity: getQuantity(trailingMatch[2]),
        unit: getUnit(trailingMatch[3]),
      };
    }
  }

  const normalizedName = normalizeProductName(cleanedSegment);

  if (!normalizedName) {
    return null;
  }

  return {
    name: cleanedSegment,
    normalizedName,
    quantity: 1,
    unit: defaultUnit,
  };
};

const getKnownProductNames = (knownProductNames?: Iterable<string>): Set<string> => {
  const normalizedNames = new Set<string>();

  for (const productName of knownProductNames ?? []) {
    const normalizedName = normalizeProductName(productName);

    if (normalizedName) {
      normalizedNames.add(normalizedName);
    }
  }

  return normalizedNames;
};

const isPreferredSegmentation = (
  candidate: SpaceSegmentation,
  current: SpaceSegmentation | null,
): boolean => {
  if (!current || candidate.items.length < current.items.length) {
    return true;
  }

  if (candidate.items.length > current.items.length) {
    return false;
  }

  for (let index = 0; index < candidate.tokenLengths.length; index += 1) {
    const candidateLength = candidate.tokenLengths[index];
    const currentLength = current.tokenLengths[index];

    if (candidateLength !== currentLength) {
      return candidateLength > currentLength;
    }
  }

  return false;
};

const parseKnownProductSequence = (
  segment: string,
  knownProductNames: ReadonlySet<string>,
): ParsedShoppingItem[] | null => {
  if (knownProductNames.size === 0) {
    return null;
  }

  const cleanedSegment = normalizeDisplayName(segment);
  const completeItem = parseSegment(cleanedSegment);

  if (!completeItem || knownProductNames.has(completeItem.normalizedName)) {
    return completeItem ? [completeItem] : null;
  }

  const tokens = cleanedSegment.split(" ");
  const cachedSegmentations = new Map<number, SpaceSegmentation | null>();

  const findSegmentation = (startIndex: number): SpaceSegmentation | null => {
    if (startIndex === tokens.length) {
      return { items: [], tokenLengths: [] };
    }

    if (cachedSegmentations.has(startIndex)) {
      return cachedSegmentations.get(startIndex) ?? null;
    }

    let bestSegmentation: SpaceSegmentation | null = null;

    for (let endIndex = tokens.length; endIndex > startIndex; endIndex -= 1) {
      const candidateItem = parseSegment(tokens.slice(startIndex, endIndex).join(" "));

      if (!candidateItem || !knownProductNames.has(candidateItem.normalizedName)) {
        continue;
      }

      const remainingSegmentation = findSegmentation(endIndex);

      if (!remainingSegmentation) {
        continue;
      }

      const candidateSegmentation: SpaceSegmentation = {
        items: [candidateItem, ...remainingSegmentation.items],
        tokenLengths: [endIndex - startIndex, ...remainingSegmentation.tokenLengths],
      };

      if (isPreferredSegmentation(candidateSegmentation, bestSegmentation)) {
        bestSegmentation = candidateSegmentation;
      }
    }

    cachedSegmentations.set(startIndex, bestSegmentation);
    return bestSegmentation;
  };

  const segmentation = findSegmentation(0);

  return segmentation && segmentation.items.length > 1 ? segmentation.items : null;
};

const parseInputSegment = (
  segment: string,
  knownProductNames: ReadonlySet<string>,
): ParsedShoppingItem[] => {
  const knownSequence = parseKnownProductSequence(segment, knownProductNames);

  if (knownSequence) {
    return knownSequence;
  }

  const item = parseSegment(segment);

  return item ? [item] : [];
};

export const parseShoppingInput = (
  input: string,
  knownProductNames?: Iterable<string>,
): ParsedShoppingItem[] => {
  const normalizedKnownProductNames = getKnownProductNames(knownProductNames);

  return input
    .split(/[;\r\n|]+| {2,}|\t+|(?<!\d),|,(?!\d)/u)
    .flatMap((segment) => parseInputSegment(segment, normalizedKnownProductNames));
};

export default parseShoppingInput;
