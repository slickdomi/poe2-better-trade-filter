import type { ComponentProps } from "react";
import { CategoryPicker } from "./CategoryPicker";

interface Props {
  chosenCategory?: { id: string; text: string };
  availableCategories: ComponentProps<typeof CategoryPicker>["categories"];
  onSelect: (categoryId: string) => void;
  /** Drops the chosen category, bringing the picker back. */
  onChange: () => void;
}

/** The item category step: the picker until a category is chosen, then a chip with a way back to it. */
export function CategoryChoice({ chosenCategory, availableCategories, onSelect, onChange }: Props) {
  if (!chosenCategory) return <CategoryPicker categories={availableCategories} onSelect={onSelect} />;

  return (
    <section className="category-chip">
      <h2>Item category</h2>
      <div className="chip-row">
        <span className="chip">{chosenCategory.text}</span>
        <button type="button" onClick={onChange}>
          Change
        </button>
      </div>
    </section>
  );
}
