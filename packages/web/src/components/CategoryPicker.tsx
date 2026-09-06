import type { FiltersData } from "../state/types";

interface Props {
  categories: FiltersData["categories"];
  onSelect: (categoryId: string) => void;
}

export function CategoryPicker({ categories, onSelect }: Props) {
  return (
    <section>
      <h2>Item category</h2>
      <div className="category-grid">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => onSelect(c.id)}>
            {c.text}
          </button>
        ))}
      </div>
    </section>
  );
}
