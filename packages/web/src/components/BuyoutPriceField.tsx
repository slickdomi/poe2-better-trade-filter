import { PRICE_CURRENCY_OPTIONS, type BuyoutPriceValue } from "../state/types";
import { SearchableCombobox } from "./SearchableCombobox";

interface Props {
  value: BuyoutPriceValue;
  onChange: (value: BuyoutPriceValue) => void;
}

// 0 is the same as "no bound" here (a minimum or maximum of 0 constrains
// nothing), so treat it as unset rather than as a real choice.
function normalize(v: number | undefined): number | undefined {
  return v === undefined || v === 0 ? undefined : v;
}

export function BuyoutPriceField({ value, onChange }: Props) {
  const currencyText = PRICE_CURRENCY_OPTIONS.find((o) => o.id === value.currency)?.text ?? "Exalted Orb Equivalent";

  return (
    <div className="status-select buyout-price-field">
      <span>Buyout Price</span>
      <input
        type="number"
        placeholder="min"
        value={value.min ?? ""}
        onChange={(e) => onChange({ ...value, min: normalize(e.target.value === "" ? undefined : Number(e.target.value)) })}
      />
      <SearchableCombobox
        options={PRICE_CURRENCY_OPTIONS.map((o) => ({ id: o.id, label: o.text }))}
        selectedLabel={currencyText}
        onSelect={(currency) => onChange({ ...value, currency })}
      />
      <input
        type="number"
        placeholder="max"
        value={value.max ?? ""}
        onChange={(e) => onChange({ ...value, max: normalize(e.target.value === "" ? undefined : Number(e.target.value)) })}
      />
    </div>
  );
}
