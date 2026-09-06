import { useEffect, useRef, useState } from "react";

export interface ComboboxOption {
  id: string;
  label: string;
  group?: string;
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

function groupOptions(options: ComboboxOption[]): [string, ComboboxOption[]][] {
  const byGroup = new Map<string, ComboboxOption[]>();
  for (const o of options) {
    const key = o.group ?? "";
    const list = byGroup.get(key);
    if (list) list.push(o);
    else byGroup.set(key, [o]);
  }
  return [...byGroup.entries()];
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
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const groups = groupOptions(filtered);

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
    <div className="combobox" ref={containerRef}>
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
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false);
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
                  {o.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
