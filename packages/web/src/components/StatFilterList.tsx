import { useState } from "react";
import type { TradeStatEntry } from "../state/types";
import type { DerivedStatFilter } from "../state/derive";
import { SearchableCombobox } from "./SearchableCombobox";

interface Props {
  availableStats: TradeStatEntry[];
  chosenStats: DerivedStatFilter[];
  prefixCount: number;
  suffixCount: number;
  enforceAffixCap: boolean;
  onToggleAffixCap: (enforce: boolean) => void;
  onAdd: (statId: string) => void;
  onRemove: (statId: string) => void;
  onRangeChange: (statId: string, min: number | undefined, max: number | undefined) => void;
}

function GroupBadge({ group }: { group: string }) {
  return <span className={`group-badge group-${group.toLowerCase()}`}>{group}</span>;
}

function AffixBadge({ affixType }: { affixType: NonNullable<DerivedStatFilter["affixType"]> }) {
  return <span className={`affix-badge affix-${affixType}`}>{affixType === "prefix" ? "P" : "S"}</span>;
}

function Legend() {
  return (
    <div className="stat-legend">
      <span className="legend-item">
        <span className="affix-badge affix-prefix">P</span> Prefix
      </span>
      <span className="legend-item">
        <span className="affix-badge affix-suffix">S</span> Suffix
      </span>
      <span className="legend-item">
        <GroupBadge group="Explicit" /> Explicit modifier
      </span>
      <span className="legend-item">
        <GroupBadge group="Implicit" /> Implicit modifier
      </span>
      <span className="legend-item">
        <GroupBadge group="Fractured" /> Selectable as a fractured mod too
      </span>
    </div>
  );
}

/**
 * A stat can roll from more than one independent pool (a normal Base
 * prefix/suffix, a Corrupted-only addition, a base Implicit, ...), each
 * with its own tier progression — shown as separate labeled tables rather
 * than merged into one, matching the official site's per-source tooltip
 * sections.
 */
function TierGroups({ tierGroups }: { tierGroups: NonNullable<DerivedStatFilter["tierGroups"]> }) {
  return (
    <div className="tier-groups">
      {tierGroups.map((g) => (
        <div key={g.source} className="tier-group">
          <div className="tier-group-source">{g.source}</div>
          <table className="tier-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Req. level</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {g.tiers.map((t) => (
                <tr key={t.tier}>
                  <td>T{t.tier}</td>
                  <td>{t.requiredLevel}</td>
                  <td>
                    {t.min}–{t.max}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function StatFilterList({
  availableStats,
  chosenStats,
  prefixCount,
  suffixCount,
  enforceAffixCap,
  onToggleAffixCap,
  onAdd,
  onRemove,
  onRangeChange,
}: Props) {
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set());

  function toggleTiers(statId: string) {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(statId)) next.delete(statId);
      else next.add(statId);
      return next;
    });
  }

  return (
    <section>
      <h2>Modifiers</h2>
      <p className="hint">Only modifiers that can actually roll on this selection are listed. Click one to add it.</p>
      <Legend />
      <label className="affix-cap-toggle">
        <input
          type="checkbox"
          checked={enforceAffixCap}
          onChange={(e) => onToggleAffixCap(e.target.checked)}
        />
        Cap prefixes/suffixes at 3/3
        <span className="affix-counts">
          — {prefixCount}/3 prefix, {suffixCount}/3 suffix
        </span>
      </label>
      <SearchableCombobox
        options={availableStats.map((s) => ({ id: s.id, label: s.text, group: s.group }))}
        placeholder={availableStats.length === 0 ? "No more eligible modifiers" : "Search modifiers…"}
        clearOnSelect
        onSelect={onAdd}
        emptyMessage="No matching modifiers"
      />
      <ul className="chosen-stats">
        {chosenStats.map((s) => (
          <li key={s.statId}>
            <div className="chosen-stat-row">
              <GroupBadge group={s.group} />
              {s.affixType && <AffixBadge affixType={s.affixType} />}
              <span className="stat-text">{s.text}</span>
              <input
                type="number"
                placeholder="min"
                value={s.min ?? ""}
                onChange={(e) =>
                  onRangeChange(s.statId, e.target.value === "" ? undefined : Number(e.target.value), s.max)
                }
              />
              <input
                type="number"
                placeholder="max"
                value={s.max ?? ""}
                onChange={(e) =>
                  onRangeChange(s.statId, s.min, e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
              {s.tierGroups && s.tierGroups.length > 0 && (
                <button type="button" onClick={() => toggleTiers(s.statId)}>
                  Tiers {expandedTiers.has(s.statId) ? "▴" : "▾"}
                </button>
              )}
              <button type="button" onClick={() => onRemove(s.statId)}>
                Remove
              </button>
            </div>
            {s.tierGroups && s.tierGroups.length > 0 && expandedTiers.has(s.statId) && (
              <TierGroups tierGroups={s.tierGroups} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
