/**
 * poe2db's scraped `text` field is plain-text display text (HTML already
 * stripped by the scraper), structurally the same as RePoE's mod text but
 * with two differences: it uses an en/em dash inside ranges (e.g.
 * "(7—9)%") instead of a hyphen, and we don't have a separate min/max
 * field to target a bare fixed value precisely (unlike RePoE's
 * normalizeRepoeText) — so both parenthesized ranges and bare standalone
 * numbers are replaced with "#" outright, matching trade's own text
 * format closely enough for the lookup this feeds.
 */
export function normalizePoe2dbText(text: string): string {
  return text
    .replace(/\(-?[\d.]+\s*[—-]\s*-?[\d.]+\)/g, "#") // (5—8) — em dash (U+2014), verified against live data
    .replace(/(?<![\d.])-?\d+(?:\.\d+)?(?![\d.])/g, "#")
    .replace(/\+(?=#)/g, "") // "+#" -> "#" wherever it occurs, not just at the start of the string
    .replace(/\s+/g, " ")
    .trim();
}
