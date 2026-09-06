import { useState } from "react";
import type { DerivedState } from "../state/derive";
import { buildTradeUrl } from "../lib/tradeUrl";

interface Props {
  league: string;
  derived: DerivedState;
}

export function TradeLinkButton({ league, derived }: Props) {
  const [error, setError] = useState<string | null>(null);
  const disabled =
    !derived.chosenCategory &&
    derived.chosenStats.length === 0 &&
    !derived.chosenItemName &&
    derived.chosenMisc.length === 0;

  async function handleClick() {
    setError(null);
    try {
      const url = await buildTradeUrl(league, derived);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build the trade URL.");
    }
  }

  return (
    <section>
      <button type="button" className="trade-link-button" onClick={handleClick} disabled={disabled}>
        Open in official PoE2 trade site
      </button>
      {disabled && <p className="hint">Choose a category, modifier, item, or filter first.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
