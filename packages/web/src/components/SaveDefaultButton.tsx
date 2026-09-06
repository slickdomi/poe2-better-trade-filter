import { useState } from "react";

interface Props {
  title: string;
  onSave: () => void;
}

/** A floppy-disk icon button that saves the current value of whatever field it's next to as the default applied on future visits — see lib/defaultTradeOptions.ts. Briefly confirms with a checkmark so clicking it doesn't feel like a no-op. */
export function SaveDefaultButton({ title, onSave }: Props) {
  const [justSaved, setJustSaved] = useState(false);

  function handleClick() {
    onSave();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  }

  return (
    <button
      type="button"
      className="save-default-button"
      title={title}
      aria-label={title}
      onClick={handleClick}
    >
      {justSaved ? "✓" : "💾"}
    </button>
  );
}
