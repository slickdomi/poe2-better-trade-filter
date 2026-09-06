import { useState, type DragEvent } from "react";
import type { FiltersData, StatSectionType, TradeStatEntry } from "../state/types";
import { DEFAULT_SECTION_ID, type DerivedStatFilter, type DerivedStatSection } from "../state/derive";
import { SearchableCombobox } from "./SearchableCombobox";
import { GroupBadge } from "./GroupBadge";

interface Props {
  availableStats: TradeStatEntry[];
  statSections: DerivedStatSection[];
  categories: FiltersData["categories"];
  prefixCount: number;
  suffixCount: number;
  enforceAffixCap: boolean;
  onToggleAffixCap: (enforce: boolean) => void;
  onAdd: (statId: string) => void;
  onRemove: (statId: string) => void;
  onRangeChange: (statId: string, min: number | undefined, max: number | undefined) => void;
  onAddSection: (type: StatSectionType) => void;
  onUpdateSection: (sectionId: string, patch: { type?: StatSectionType; min?: number; max?: number }) => void;
  onRemoveSection: (sectionId: string) => void;
  onMoveStat: (statId: string, sectionId: string) => void;
  onWeightChange: (statId: string, weight: number | undefined) => void;
}

const SECTION_TYPE_LABEL: Record<StatSectionType, string> = {
  and: "And",
  count: "Count",
  weight: "Weighted sum",
  weight2: "Weighted sum V2",
  not: "Not",
  if: "If",
};

const SECTION_TYPE_HINT: Partial<Record<StatSectionType, string>> = {
  not: "The item must not have any of these modifiers.",
  count: "At least this many (up to at most this many) of the listed modifiers must be present.",
  if: "Each modifier here is optional — but if the item does have it, its value must still fall within that modifier's own min/max.",
  weight: "Each modifier's value is multiplied by its weight and summed; the total must fall in range. Also caps each modifier individually, as though its value alone made up the whole sum.",
  weight2: "Each modifier's value is multiplied by its weight and summed; the total must fall in range — without an individual per-modifier cap, so one strong stat can offset a weaker one.",
};

function isWeightedSectionType(type: StatSectionType): boolean {
  return type === "weight" || type === "weight2";
}

/**
 * `categoryIds` mixes a source's specific item-type ids (e.g. "armour.helmet")
 * with the broader "Any X" umbrella id (e.g. "armour") whenever the pool is
 * also reachable while that umbrella category is chosen unnarrowed — showing
 * both would just read as "Any Armour, Helmet", so prefer the specific ones
 * once at least one is present.
 */
function describeCategoryScope(ids: string[], categories: FiltersData["categories"]): string {
  const specific = ids.filter((id) => id.includes("."));
  const idsToShow = specific.length > 0 ? specific : ids;
  return idsToShow.map((id) => categories.find((c) => c.id === id)?.text ?? id).join(", ");
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
function TierGroups({
  tierGroups,
  categories,
  min,
  max,
  onSelectTier,
}: {
  tierGroups: NonNullable<DerivedStatFilter["tierGroups"]>;
  categories: FiltersData["categories"];
  min: number | undefined;
  max: number | undefined;
  onSelectTier: (min: number, max: number) => void;
}) {
  return (
    <div className="tier-groups">
      {tierGroups.map((g, i) => (
        <div key={`${g.source}-${i}`} className="tier-group">
          <div className="tier-group-source">
            {g.source}
            {g.categoryIds && <span className="tier-group-scope"> — {describeCategoryScope(g.categoryIds, categories)}</span>}
          </div>
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
                <tr
                  key={t.tier}
                  className={`tier-row${t.min === min && t.max === max ? " tier-row-active" : ""}`}
                  title="Fill min/max with this tier's value"
                  onClick={() => onSelectTier(t.min, t.max)}
                >
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

function StatRow({
  stat,
  section,
  sectionOptions,
  categories,
  expanded,
  isDragging,
  onToggleTiers,
  onRemove,
  onRangeChange,
  onMoveStat,
  onWeightChange,
  onDragStart,
  onDragEnd,
}: {
  stat: DerivedStatFilter;
  section: DerivedStatSection;
  sectionOptions: { id: string; label: string }[];
  categories: FiltersData["categories"];
  expanded: boolean;
  isDragging: boolean;
  onToggleTiers: (statId: string) => void;
  onRemove: (statId: string) => void;
  onRangeChange: (statId: string, min: number | undefined, max: number | undefined) => void;
  onMoveStat: (statId: string, sectionId: string) => void;
  onWeightChange: (statId: string, weight: number | undefined) => void;
  onDragStart: (statId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <li className={isDragging ? "chosen-stat-dragging" : undefined}>
      <div className="chosen-stat-row">
        <div className="chosen-stat-controls">
          <span
            className="drag-handle"
            draggable
            title="Drag to move to a different group"
            aria-hidden="true"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", stat.statId);
              e.dataTransfer.effectAllowed = "move";
              onDragStart(stat.statId);
            }}
            onDragEnd={onDragEnd}
          />
          <GroupBadge group={stat.group} />
          {stat.affixType && <AffixBadge affixType={stat.affixType} />}
          <div className="chosen-stat-fields">
            <input
              type="number"
              placeholder="min"
              value={stat.min ?? ""}
              onChange={(e) =>
                onRangeChange(stat.statId, e.target.value === "" ? undefined : Number(e.target.value), stat.max)
              }
            />
            <input
              type="number"
              placeholder="max"
              value={stat.max ?? ""}
              onChange={(e) =>
                onRangeChange(stat.statId, stat.min, e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
            {isWeightedSectionType(section.type) && (
              <input
                type="number"
                className="stat-weight-input"
                placeholder="weight"
                title="Weight applied to this modifier's rolled value in the group's weighted sum"
                value={stat.weight ?? ""}
                onChange={(e) =>
                  onWeightChange(stat.statId, e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            )}
            {sectionOptions.length > 1 && (
              <select
                className="stat-section-select"
                title="Move to filter group"
                value={stat.sectionId}
                onChange={(e) => onMoveStat(stat.statId, e.target.value)}
              >
                {sectionOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {stat.tierGroups && stat.tierGroups.length > 0 && (
              <button type="button" onClick={() => onToggleTiers(stat.statId)}>
                Tiers {expanded ? "▴" : "▾"}
              </button>
            )}
            <button type="button" onClick={() => onRemove(stat.statId)}>
              Remove
            </button>
          </div>
        </div>
        <span className="stat-text">{stat.text}</span>
      </div>
      {stat.tierGroups && stat.tierGroups.length > 0 && expanded && (
        <TierGroups
          tierGroups={stat.tierGroups}
          categories={categories}
          min={stat.min}
          max={stat.max}
          onSelectTier={(min, max) => onRangeChange(stat.statId, min, max)}
        />
      )}
    </li>
  );
}

export function StatFilterList({
  availableStats,
  statSections,
  categories,
  prefixCount,
  suffixCount,
  enforceAffixCap,
  onToggleAffixCap,
  onAdd,
  onRemove,
  onRangeChange,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
  onMoveStat,
  onWeightChange,
}: Props) {
  const [expandedTiers, setExpandedTiers] = useState<Set<string>>(new Set());
  const [newSectionType, setNewSectionType] = useState<StatSectionType>("count");
  const [draggingStatId, setDraggingStatId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);

  function toggleTiers(statId: string) {
    setExpandedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(statId)) next.delete(statId);
      else next.add(statId);
      return next;
    });
  }

  function handleDragOver(e: DragEvent, sectionId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverSectionId !== sectionId) setDragOverSectionId(sectionId);
  }

  function handleDragLeave(e: DragEvent, sectionId: string) {
    // Fires on every child boundary crossing too — only clear once the pointer
    // has actually left the section box, not just moved between its children.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverSectionId((cur) => (cur === sectionId ? null : cur));
    }
  }

  function handleDrop(e: DragEvent, sectionId: string) {
    e.preventDefault();
    setDragOverSectionId(null);
    const statId = e.dataTransfer.getData("text/plain");
    if (statId) onMoveStat(statId, sectionId);
    // A successful move re-parents this stat's <li> into a different
    // section's list, unmounting the dragged node before the browser gets a
    // chance to fire its "dragend" — so the onDragEnd handler that normally
    // clears this never runs, permanently dimming the row's new home unless
    // it's cleared here too.
    setDraggingStatId(null);
  }

  const customSections = statSections.filter((s) => !s.isDefault);
  const sectionOptions = [
    { id: DEFAULT_SECTION_ID, label: "Default (And)" },
    ...customSections.map((s, i) => ({ id: s.id, label: `Group ${i + 1}: ${SECTION_TYPE_LABEL[s.type]}` })),
  ];

  return (
    <section>
      <h2>Modifiers</h2>
      <p className="hint">
        Only modifiers that can actually roll on this selection are listed. Click one to add it. Drag a modifier
        by its handle to move it between groups.
      </p>
      <Legend />
      <label className="affix-cap-toggle">
        <input
          type="checkbox"
          checked={enforceAffixCap}
          onChange={(e) => onToggleAffixCap(e.target.checked)}
        />
        Cap prefixes/suffixes at 3/3
        <span className="affix-cap-scope">(default group only)</span>
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

      {statSections.map((section, sectionIndex) => (
        <div
          className={`stat-section stat-section-${section.type}${
            dragOverSectionId === section.id ? " stat-section-drag-over" : ""
          }`}
          key={section.id}
          onDragOver={(e) => handleDragOver(e, section.id)}
          onDragLeave={(e) => handleDragLeave(e, section.id)}
          onDrop={(e) => handleDrop(e, section.id)}
        >
          <div className="stat-section-header">
            {section.isDefault ? (
              <span className="stat-section-title">Default — all of these must match</span>
            ) : (
              <>
                <span className="stat-section-title">Group {sectionIndex}:</span>
                <select
                  value={section.type}
                  onChange={(e) => onUpdateSection(section.id, { type: e.target.value as StatSectionType })}
                >
                  {(Object.keys(SECTION_TYPE_LABEL) as StatSectionType[]).map((type) => (
                    <option key={type} value={type}>
                      {SECTION_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
                {(section.type === "count" || isWeightedSectionType(section.type)) && (
                  <span className="stat-section-value">
                    <input
                      type="number"
                      placeholder="min"
                      title={section.type === "count" ? "Minimum number of matches" : "Minimum weighted sum"}
                      value={section.min ?? ""}
                      onChange={(e) =>
                        onUpdateSection(section.id, {
                          min: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                    <input
                      type="number"
                      placeholder="max"
                      title={section.type === "count" ? "Maximum number of matches" : "Maximum weighted sum"}
                      value={section.max ?? ""}
                      onChange={(e) =>
                        onUpdateSection(section.id, {
                          max: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </span>
                )}
                <button type="button" onClick={() => onRemoveSection(section.id)}>
                  Remove group
                </button>
              </>
            )}
          </div>
          {!section.isDefault && SECTION_TYPE_HINT[section.type] && (
            <p className="stat-section-hint hint">{SECTION_TYPE_HINT[section.type]}</p>
          )}
          {section.stats.length === 0 ? (
            <p className="stat-section-empty hint">Drag a modifier here, or move one using its group dropdown.</p>
          ) : (
            <ul className="chosen-stats">
              {section.stats.map((stat) => (
                <StatRow
                  key={stat.statId}
                  stat={stat}
                  section={section}
                  sectionOptions={sectionOptions}
                  categories={categories}
                  expanded={expandedTiers.has(stat.statId)}
                  isDragging={draggingStatId === stat.statId}
                  onToggleTiers={toggleTiers}
                  onRemove={onRemove}
                  onRangeChange={onRangeChange}
                  onMoveStat={onMoveStat}
                  onWeightChange={onWeightChange}
                  onDragStart={setDraggingStatId}
                  onDragEnd={() => setDraggingStatId(null)}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="add-section-row">
        <select value={newSectionType} onChange={(e) => setNewSectionType(e.target.value as StatSectionType)}>
          {(Object.keys(SECTION_TYPE_LABEL) as StatSectionType[]).map((type) => (
            <option key={type} value={type}>
              {SECTION_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onAddSection(newSectionType)}>
          + Add filter group
        </button>
      </div>
    </section>
  );
}
