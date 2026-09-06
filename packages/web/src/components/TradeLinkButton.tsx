import { useState } from "react";
import type { DerivedState } from "../state/derive";
import { STATUS_OPTIONS, type BuyoutPriceValue, type StatusOption } from "../state/types";
import { buildTradeUrl } from "../lib/tradeUrl";
import { setDefaultBuyoutPrice, setDefaultStatus } from "../lib/defaultTradeOptions";
import { BuyoutPriceField } from "./BuyoutPriceField";
import { SaveDefaultButton } from "./SaveDefaultButton";

interface Props {
  league: string;
  derived: DerivedState;
  status: StatusOption;
  onStatusChange: (status: StatusOption) => void;
  buyoutPrice: BuyoutPriceValue;
  onBuyoutPriceChange: (value: BuyoutPriceValue) => void;
}

export function TradeLinkButton({
  league,
  derived,
  status,
  onStatusChange,
  buyoutPrice,
  onBuyoutPriceChange,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const disabled =
    !derived.chosenCategory &&
    derived.chosenStats.length === 0 &&
    !derived.chosenItemName &&
    derived.chosenMisc.length === 0;

  async function handleClick() {
    setError(null);
    try {
      const url = await buildTradeUrl(league, derived, status, buyoutPrice);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build the trade URL.");
    }
  }

  return (
    <section>
      <BuyoutPriceField
        value={buyoutPrice}
        onChange={onBuyoutPriceChange}
        onSaveDefault={() => setDefaultBuyoutPrice(buyoutPrice)}
      />
      <div className="status-select">
        <span>Show sellers</span>
        <select value={status} onChange={(e) => onStatusChange(e.target.value as StatusOption)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <SaveDefaultButton title="Save as default seller filter" onSave={() => setDefaultStatus(status)} />
      </div>
      <button type="button" className="trade-link-button" onClick={handleClick} disabled={disabled}>
        Open in official PoE2 trade site
      </button>
      {disabled && <p className="hint">Choose a category, modifier, item, or filter first.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
