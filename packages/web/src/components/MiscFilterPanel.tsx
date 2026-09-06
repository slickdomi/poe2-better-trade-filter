import type { FilterDef, MiscFilterGroup, MiscFilterValue } from "../state/types";
import type { DerivedMiscFilter } from "../state/derive";
import { SearchableCombobox } from "./SearchableCombobox";

interface FieldProps {
  def: FilterDef;
  group: MiscFilterGroup;
  value?: MiscFilterValue;
  onAdd: (group: MiscFilterGroup, filterId: string, value: MiscFilterValue) => void;
  onUpdate: (filterId: string, value: MiscFilterValue) => void;
  onRemove: (filterId: string) => void;
}

// 0 is the same as "no bound" for every field in this panel (a minimum of 0
// or a maximum of 0 constrains nothing), so treat it as unset rather than
// as a real choice — otherwise clearing a field back to 0 would still leave
// a no-op filter sitting in the pipeline history.
function normalize(v: number | undefined): number | undefined {
  return v === undefined || v === 0 ? undefined : v;
}

function MinMaxField({ def, group, value, onAdd, onUpdate, onRemove }: FieldProps) {
  const range = value && "min" in value ? value : undefined;

  function handleChange(rawMin: number | undefined, rawMax: number | undefined) {
    const min = normalize(rawMin);
    const max = normalize(rawMax);
    if (min === undefined && max === undefined) {
      onRemove(def.id);
      return;
    }
    if (range) onUpdate(def.id, { min, max });
    else onAdd(group, def.id, { min, max });
  }

  return (
    <div className="misc-field">
      <label>{def.text}</label>
      <input
        type="number"
        placeholder="min"
        value={range?.min ?? ""}
        onChange={(e) => handleChange(e.target.value === "" ? undefined : Number(e.target.value), range?.max)}
      />
      <input
        type="number"
        placeholder="max"
        value={range?.max ?? ""}
        onChange={(e) => handleChange(range?.min, e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </div>
  );
}

function OptionField({ def, group, value, onAdd, onUpdate, onRemove }: FieldProps) {
  if (!("options" in def)) return null;
  const chosen = value && "option" in value ? value.option : "";
  const chosenText = def.options.find((o) => o.id === chosen)?.text ?? "Any";

  return (
    <div className="misc-field">
      <label>{def.text}</label>
      <SearchableCombobox
        options={[{ id: "", label: "Any" }, ...def.options.map((o) => ({ id: o.id, label: o.text }))]}
        selectedLabel={chosenText}
        onSelect={(option) => {
          if (!option) {
            onRemove(def.id);
            return;
          }
          if (chosen) onUpdate(def.id, { option });
          else onAdd(group, def.id, { option });
        }}
      />
    </div>
  );
}

function renderField(
  def: FilterDef,
  group: MiscFilterGroup,
  chosenMisc: DerivedMiscFilter[],
  onAdd: FieldProps["onAdd"],
  onUpdate: FieldProps["onUpdate"],
  onRemove: FieldProps["onRemove"],
) {
  const value = chosenMisc.find((m) => m.filterId === def.id)?.value;
  const Field = "minMax" in def ? MinMaxField : OptionField;
  return <Field key={def.id} def={def} group={group} value={value} onAdd={onAdd} onUpdate={onUpdate} onRemove={onRemove} />;
}

interface Props {
  itemFilters: FilterDef[];
  relevantReqFilters: FilterDef[];
  relevantMiscFilters: FilterDef[];
  relevantEquipmentFilters: FilterDef[];
  chosenMisc: DerivedMiscFilter[];
  onAdd: FieldProps["onAdd"];
  onUpdate: FieldProps["onUpdate"];
  onRemove: FieldProps["onRemove"];
}

export function MiscFilterPanel({
  itemFilters,
  relevantReqFilters,
  relevantMiscFilters,
  relevantEquipmentFilters,
  chosenMisc,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  return (
    <section>
      <h2>Item, requirements &amp; equipment</h2>
      <p className="hint">Only properties this selection can actually have are listed.</p>

      <div className="misc-section">
        <h3>Item</h3>
        <div className="misc-grid">
          {itemFilters.map((def) => renderField(def, "itemFilters", chosenMisc, onAdd, onUpdate, onRemove))}
        </div>
      </div>

      <div className="misc-section">
        <h3>Requirements</h3>
        <div className="misc-grid">
          {relevantReqFilters.map((def) => renderField(def, "reqFilters", chosenMisc, onAdd, onUpdate, onRemove))}
        </div>
      </div>

      {relevantEquipmentFilters.length > 0 && (
        <div className="misc-section">
          <h3>Equipment</h3>
          <div className="misc-grid">
            {relevantEquipmentFilters.map((def) =>
              renderField(def, "equipmentFilters", chosenMisc, onAdd, onUpdate, onRemove),
            )}
          </div>
        </div>
      )}

      <details className="misc-section">
        <summary>More (identified, corrupted, mirrored, …)</summary>
        <div className="misc-grid">
          {relevantMiscFilters.map((def) => renderField(def, "miscFilters", chosenMisc, onAdd, onUpdate, onRemove))}
        </div>
      </details>
    </section>
  );
}
