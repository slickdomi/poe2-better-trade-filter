import { useEffect, useRef, useState } from "react";
import { fuzzyFilter } from "../lib/fuzzySearch";
import { GroupBadge } from "./GroupBadge";

export interface ComboboxOption {
  id: string;
  label: string;
  group?: string;
  /** A second, independent badge (e.g. "Unique") alongside `group` — doesn't affect how options are grouped/sectioned. */
  extraBadge?: string;
}

interface Props {
  options: ComboboxOption[];
  placeholder?: string;
  /** Label shown when closed, for a persistent single-choice dropdown (e.g. league). Omit for an "add and clear" picker. */
  selectedLabel?: string;
  /** If true, selecting an option clears the search box and keeps the list open instead of closing (for "click to add" pickers). */
  clearOnSelect?: boolean;
  onSelect: (id: string) => void;
  emptyMessage?: string;
}

/**
 * Sections `options` by group, with groups in the order they first appear in
 * `allOptions` — so a best-match-first search result still lists its groups
 * (Explicit, Implicit, ...) in their usual order, ranking only within each.
 */
function groupOptions(options: ComboboxOption[], allOptions: ComboboxOption[]): [string, ComboboxOption[]][] {
  const byGroup = new Map<string, ComboboxOption[]>(allOptions.map((o) => [o.group ?? "", []]));
  for (const o of options) byGroup.get(o.group ?? "")!.push(o);
  return [...byGroup.entries()].filter(([, opts]) => opts.length > 0);
}

export function SearchableCombobox({
  options,
  placeholder,
  selectedLabel,
  clearOnSelect = false,
  onSelect,
  emptyMessage = "No matches",
}: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // "click", not "mousedown": closing the list shifts the layout, and doing
    // that between a button's mousedown and mouseup would swallow the very
    // click that was meant to close it (e.g. "Save current" elsewhere on the
    // page). On "click" the clicked element has already had its turn.
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const filtered = fuzzyFilter(options, query, (o) => o.label);
  const groups = groupOptions(filtered, options);

  function handleSelect(option: ComboboxOption) {
    onSelect(option.id);
    if (clearOnSelect) {
      setQuery("");
    } else {
      setIsOpen(false);
    }
  }

  const inputValue = isOpen ? query : clearOnSelect ? query : (selectedLabel ?? query);

  return (
    // Escape is handled on the whole combobox, not just the input, so it still
    // closes the list after an option was clicked (focus is then on the option).
    <div
      className="combobox"
      ref={containerRef}
      onKeyDown={(e) => {
        if (e.key === "Escape") setIsOpen(false);
      }}
    >
      <input
        type="text"
        className="combobox-input"
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => {
          setIsOpen(true);
          if (!clearOnSelect) setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
      />
      {isOpen && (
        <div className="combobox-list">
          {filtered.length === 0 && <div className="combobox-empty">{emptyMessage}</div>}
          {groups.map(([group, opts]) => (
            <div key={group || "_"} className="combobox-group">
              {group && <div className="combobox-group-label">{group}</div>}
              {opts.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className="combobox-option"
                  onClick={() => handleSelect(o)}
                >
                  {o.group && <GroupBadge group={o.group} />}
                  {o.extraBadge && <GroupBadge group={o.extraBadge} />}
                  <span className="combobox-option-label">{o.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
