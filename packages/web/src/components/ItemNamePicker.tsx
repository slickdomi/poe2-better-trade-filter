import { SearchableCombobox } from "./SearchableCombobox";

interface Props {
  availableNames: string[];
  chosenName?: string;
  onSet: (name: string) => void;
  onClear: () => void;
}

export function ItemNamePicker({ availableNames, chosenName, onSet, onClear }: Props) {
  return (
    <section>
      <h2>Item base type</h2>
      <div className="item-name-row">
        <SearchableCombobox
          options={[{ id: "", label: "Any base type" }, ...availableNames.map((n) => ({ id: n, label: n }))]}
          selectedLabel={chosenName ?? "Any base type"}
          onSelect={(name) => (name ? onSet(name) : onClear())}
        />
      </div>
    </section>
  );
}
