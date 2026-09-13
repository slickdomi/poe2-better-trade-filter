/**
 * Order-independent, forgiving search for the comboboxes: every word of the
 * query has to show up somewhere in the text, in any order — "dam minion"
 * finds "Minions deal #% increased Damage" — as a whole word, the start of
 * one, anywhere inside one, or with letters skipped within a single word
 * ("dmg" finds "Damage"). Results come best match first, in that same order
 * of preference, then shorter (more specific) texts first.
 */

/** Everything but letters, digits and the symbols stat texts lean on ("#%", "+#") separates words. */
const WORD_SEPARATOR = /[^a-z0-9#%+]+/;

function words(text: string): string[] {
  return text.toLowerCase().split(WORD_SEPARATOR).filter(Boolean);
}

/** `token`'s letters appear in `word` in order, starting with its first letter. */
function isSkippingMatch(token: string, word: string): boolean {
  if (word[0] !== token[0]) return false;
  let matched = 0;
  for (const char of word) {
    if (char === token[matched]) matched++;
    if (matched === token.length) return true;
  }
  return false;
}

function tokenScore(token: string, text: string, textWords: string[]): number {
  if (textWords.includes(token)) return 4;
  if (textWords.some((word) => word.startsWith(token))) return 3;
  if (text.includes(token)) return 2;
  if (token.length >= 2 && textWords.some((word) => isSkippingMatch(token, word))) return 1;
  return 0;
}

/** How well `text` matches `query` (higher is better), or `null` if some word of the query can't be found in it at all. */
export function fuzzyScore(query: string, text: string): number | null {
  const lower = text.toLowerCase();
  const textWords = words(lower);
  let total = 0;
  for (const token of words(query)) {
    const score = tokenScore(token, lower, textWords);
    if (score === 0) return null;
    total += score;
  }
  return total;
}

/** The items whose text matches `query`, best match first — or all of them, in their original order, for a blank query. */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  if (words(query).length === 0) return items;
  return items
    .map((item, index) => ({ item, index, text: getText(item) }))
    .map((entry) => ({ ...entry, score: fuzzyScore(query, entry.text) }))
    .filter((entry): entry is typeof entry & { score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.index - b.index)
    .map((entry) => entry.item);
}
