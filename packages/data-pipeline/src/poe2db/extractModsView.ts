/**
 * poe2db.tw's "Modifiers Calc" widget has no separate API — its data ships
 * embedded in each item-type page's HTML as `new ModsView({ ... a large
 * JSON object literal ... })`. This walks the raw HTML byte-by-byte to find
 * the balanced `{...}` argument of every such call (regex can't safely
 * bracket-match, since the object contains HTML strings full of `{`/`}`-free
 * but quote-heavy markup) and JSON.parses each one.
 */
export function extractModsViewCalls(html: string): unknown[] {
  const marker = "new ModsView(";
  const results: unknown[] = [];
  let searchFrom = 0;

  while (true) {
    const start = html.indexOf(marker, searchFrom);
    if (start === -1) break;
    const jsonStart = start + marker.length;
    if (html[jsonStart] !== "{") {
      searchFrom = jsonStart;
      continue;
    }

    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escaped = false;
    let end = -1;
    for (let i = jsonStart; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === stringChar) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      searchFrom = jsonStart;
      continue;
    }

    const jsonText = html.slice(jsonStart, end + 1);
    try {
      results.push(JSON.parse(jsonText));
    } catch {
      // Skip anything that doesn't parse rather than aborting the whole page.
    }
    searchFrom = end + 1;
  }

  return results;
}
