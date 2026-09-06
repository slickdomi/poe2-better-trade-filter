import type { FilterDef, RawFilterDef, RawFilterGroup } from "./types.js";

function toFilterDef(raw: RawFilterDef): FilterDef {
  if (raw.minMax) return { id: raw.id, text: raw.text, minMax: true };
  const options = (raw.option?.options ?? []).filter(
    (o): o is { id: string; text: string } => o.id !== null,
  );
  return { id: raw.id, text: raw.text, options };
}

export function buildPassthroughFilters(
  groups: RawFilterGroup[],
  groupId: string,
  includeIds?: string[],
): FilterDef[] {
  const group = groups.find((g) => g.id === groupId);
  const defs = (group?.filters ?? []).map(toFilterDef);
  return includeIds ? defs.filter((d) => includeIds.includes(d.id)) : defs;
}
