import { useMemo } from "react";
import type { FiltersData, RegexSnapshot } from "../state/types";
import type { Pipeline } from "../state/usePipeline";
import { buildRegex } from "../lib/regex";
import { regexQueryStore, type SavedRegex } from "../lib/savedQueries";
import { CategoryChoice } from "../components/CategoryChoice";
import { ItemNamePicker } from "../components/ItemNamePicker";
import { PipelineTrail } from "../components/PipelineTrail";
import { RegexOutput } from "../components/RegexOutput";
import { SavedQueriesPanel } from "../components/SavedQueriesPanel";
import { StatFilterList } from "../components/StatFilterList";

interface Props {
  data: FiltersData;
  /** Owned by App, so the selection survives switching tabs (only the active tab is mounted). */
  pipeline: Pipeline;
}

/**
 * The Regex generator tab: the Trade tab's category → base type → modifier
 * pipeline, minus everything only the trade site understands (item
 * properties, league, sellers, price). Instead of a trade link it produces
 * an in-game search string — see lib/regex.ts.
 */
export function RegexPage({ data, pipeline }: Props) {
  const { derived } = pipeline;
  const { regex, warnings } = useMemo(() => buildRegex(derived, data), [derived, data]);
  const categoryStepIndex = pipeline.steps.findIndex((s) => s.kind === "category");
  const snapshot: RegexSnapshot = {
    enforceAffixCap: pipeline.enforceAffixCap,
    includeUniqueMods: pipeline.includeUniqueMods,
    steps: pipeline.steps,
  };

  function describeSavedRegex(entry: SavedRegex): string {
    const categoryStep = entry.steps.find((s) => s.kind === "category");
    const categoryId = categoryStep?.kind === "category" ? categoryStep.categoryId : undefined;
    const category = data.categories.find((c) => c.id === categoryId)?.text ?? "Any category";
    const statCount = entry.steps.filter((s) => s.kind === "stat").length;
    return `${category} · ${statCount} modifier${statCount === 1 ? "" : "s"}`;
  }

  function handleLoad(entry: SavedRegex) {
    pipeline.loadSteps(entry.steps, {
      enforceAffixCap: entry.enforceAffixCap,
      includeUniqueMods: entry.includeUniqueMods,
    });
  }

  return (
    <>
      <PipelineTrail
        steps={pipeline.steps}
        data={data}
        onRemoveStep={pipeline.removeStepAt}
        onUndoLast={pipeline.undoLast}
        onReset={pipeline.reset}
      />

      <div className="layout">
        <div className="layout-left">
          <CategoryChoice
            chosenCategory={derived.chosenCategory}
            availableCategories={derived.availableCategories}
            onSelect={pipeline.selectCategory}
            onChange={() => pipeline.removeStepAt(categoryStepIndex)}
          />

          {derived.chosenCategory && (
            <ItemNamePicker
              availableNames={derived.availableItemNames}
              chosenName={derived.chosenItemName}
              onSet={pipeline.setItemName}
              onClear={pipeline.clearItemName}
            />
          )}

          <SavedQueriesPanel
            store={regexQueryStore}
            noun={{ singular: "regex", plural: "regexes" }}
            snapshot={snapshot}
            canSave={pipeline.steps.length > 0}
            describe={describeSavedRegex}
            onLoad={handleLoad}
          />
        </div>

        <div className="layout-right">
          <RegexOutput regex={regex} warnings={warnings} />

          <StatFilterList
            availableStats={derived.availableStats}
            statSections={derived.statSections}
            categories={data.categories}
            prefixCount={derived.prefixCount}
            suffixCount={derived.suffixCount}
            enforceAffixCap={pipeline.enforceAffixCap}
            onToggleAffixCap={pipeline.setEnforceAffixCap}
            includeUniqueMods={pipeline.includeUniqueMods}
            onToggleUniqueMods={pipeline.setIncludeUniqueMods}
            onAdd={pipeline.addStat}
            onRemove={pipeline.removeStat}
            onRangeChange={pipeline.updateStatRange}
            onAddSection={pipeline.addStatSection}
            onUpdateSection={pipeline.updateStatSection}
            onRemoveSection={pipeline.removeStatSection}
            onMoveStat={pipeline.moveStatToSection}
            onWeightChange={pipeline.updateStatWeight}
            onToggleEnabled={pipeline.setStatEnabled}
            allowGroups={false}
          />
        </div>
      </div>
    </>
  );
}
