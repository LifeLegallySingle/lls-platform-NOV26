/**
 * SLEE quote bank: original single-life one-liners for auto-replies.
 * Each contact gets a stable pick (by contact id), so repeat emails vary across people, not per refresh.
 * Add, edit or remove lines freely — keep them original (no attributed quotes from real people).
 */
export const SINGLE_LIFE_QUOTES: string[] = [
  "Table for one? Best seat in the house.",
  "I’m not waiting for my other half. I came whole.",
  "Self-partnered and fully booked.",
  "My longest relationship? My savings account. Still going strong.",
  "Single isn’t a status. It’s a strategy.",
  "I don’t need a date for Singles Day. I am the date.",
  "One cart. One checkout. Zero compromises.",
  "My love language is free shipping.",
  "Solo, not lonely. Free, not available.",
  "Treat yourself like the main character. Spoiler: you are.",
  "Plus-ones are optional. Upgrades are not.",
  "Being single is a Power Move™.",
];

export function quoteFor(seed: number): string {
  const n = SINGLE_LIFE_QUOTES.length;
  return SINGLE_LIFE_QUOTES[((seed % n) + n) % n];
}
