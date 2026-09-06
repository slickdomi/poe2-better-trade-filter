import type { FiltersData, Step } from "../state/types";

interface Props {
  steps: Step[];
  data: FiltersData;
  onRemoveStep: (index: number) => void;
  onUndoLast: () => void;
  onReset: () => void;
}

function describeStep(step: Step, data: FiltersData, statsById: Map<string, FiltersData["stats"][number]>): string {
  switch (step.kind) {
    case "category":
      return data.categories.find((c) => c.id === step.categoryId)?.text ?? step.categoryId;
    case "stat":
      // A handful of trade stat ids are listed twice under different wording
      // (confirmed live — e.g. explicit.stat_1210760818 is both "Breaches
      // have #% increased Monster density" and "Breaches in Map have #%
      // increased Pack Size"); a Map keyed by id take the same last-one-wins
      // entry `statsById` elsewhere (derive.ts) resolves to, so this always
      // shows the same wording as the modifier list/chosen-stat row instead
      // of independently landing on whichever happened to come first.
      return statsById.get(step.statId)?.text ?? step.statId;
    case "statSection":
      return `${step.type.toUpperCase()} group`;
    case "itemName":
      return step.name;
    case "misc": {
      const allDefs = [...data.itemFilters, ...data.reqFilters, ...data.miscFilters, ...data.equipmentFilters];
      const def = allDefs.find((d) => d.id === step.filterId);
      const label = def?.text ?? step.filterId;
      const value = step.value;
      if ("option" in value) {
        const optionText = def && "options" in def ? (def.options.find((o) => o.id === value.option)?.text ?? value.option) : value.option;
        return `${label}: ${optionText}`;
      }
      const { min, max } = value;
      return `${label}: ${min ?? "any"}–${max ?? "any"}`;
    }
  }
}

export function PipelineTrail({ steps, data, onRemoveStep, onUndoLast, onReset }: Props) {
  if (steps.length === 0) return null;

  const statsById = new Map(data.stats.map((s) => [s.id, s]));

  return (
    <nav className="pipeline-trail">
      <ol>
        {steps.map((step, i) => (
          <li key={i}>
            <button type="button" onClick={() => onRemoveStep(i)} title="Remove this selection">
              {describeStep(step, data, statsById)}
              <span className="trail-remove" aria-hidden="true">
                ×
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="pipeline-actions">
        <button type="button" onClick={onUndoLast}>
          Undo last
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </nav>
  );
}
