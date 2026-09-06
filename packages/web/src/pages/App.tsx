import { useState } from "react";
import filtersJson from "../data/filters.json";
import type { BuyoutPriceValue, FiltersData, StatusOption } from "../state/types";
import { usePipeline } from "../state/usePipeline";
import { CategoryPicker } from "../components/CategoryPicker";
import { StatFilterList } from "../components/StatFilterList";
import { ItemNamePicker } from "../components/ItemNamePicker";
import { MiscFilterPanel } from "../components/MiscFilterPanel";
import { PipelineTrail } from "../components/PipelineTrail";
import { TradeLinkButton } from "../components/TradeLinkButton";
import { SearchableCombobox } from "../components/SearchableCombobox";
import { SavedQueriesPanel } from "../components/SavedQueriesPanel";
import { listSavedQueries, type SavedQuery } from "../lib/savedQueries";

const data = filtersJson as FiltersData;

export function App() {
  const pipeline = usePipeline(data);
  const [league, setLeague] = useState(data.leagues[0]?.id ?? "Standard");
  const [status, setStatus] = useState<StatusOption>("securable");
  const [buyoutPrice, setBuyoutPrice] = useState<BuyoutPriceValue>({ currency: "" });
  const [savedQueries, setSavedQueries] = useState(listSavedQueries);
  const { derived } = pipeline;

  function refreshSavedQueries() {
    setSavedQueries(listSavedQueries());
  }

  function handleLoadQuery(query: SavedQuery) {
    pipeline.loadSteps(query.steps, { enforceAffixCap: query.enforceAffixCap });
    setLeague(query.league);
    setStatus(query.status);
    setBuyoutPrice(query.buyoutPrice);
  }

  const categoryStepIndex = pipeline.steps.findIndex((s) => s.kind === "category");
  const leagueText = data.leagues.find((l) => l.id === league)?.text ?? league;

  return (
    <main>
      <header>
        <h1>PoE2 Better Trade Filter</h1>
        <div className="league-select">
          <span>League</span>
          <SearchableCombobox
            options={data.leagues.map((l) => ({ id: l.id, label: l.text }))}
            selectedLabel={leagueText}
            onSelect={setLeague}
          />
        </div>
      </header>

      <PipelineTrail
        steps={pipeline.steps}
        data={data}
        onRemoveStep={pipeline.removeStepAt}
        onUndoLast={pipeline.undoLast}
        onReset={pipeline.reset}
      />

      <div className="layout">
        <div className="layout-left">
          {derived.chosenCategory ? (
            <section className="category-chip">
              <h2>Item category</h2>
              <div className="chip-row">
                <span className="chip">{derived.chosenCategory.text}</span>
                <button type="button" onClick={() => pipeline.removeStepAt(categoryStepIndex)}>
                  Change
                </button>
              </div>
            </section>
          ) : (
            <CategoryPicker categories={derived.availableCategories} onSelect={pipeline.selectCategory} />
          )}

          {derived.chosenCategory && (
            <ItemNamePicker
              availableNames={derived.availableItemNames}
              chosenName={derived.chosenItemName}
              onSet={pipeline.setItemName}
              onClear={pipeline.clearItemName}
            />
          )}

          <MiscFilterPanel
            itemFilters={data.itemFilters}
            relevantReqFilters={derived.relevantReqFilters}
            relevantMiscFilters={derived.relevantMiscFilters}
            relevantEquipmentFilters={derived.relevantEquipmentFilters}
            chosenMisc={derived.chosenMisc}
            onAdd={pipeline.addMiscFilter}
            onUpdate={pipeline.updateMiscFilter}
            onRemove={pipeline.removeMiscFilter}
          />

          <SavedQueriesPanel
            queries={savedQueries}
            onQueriesChange={refreshSavedQueries}
            canSave={pipeline.steps.length > 0}
            league={league}
            status={status}
            buyoutPrice={buyoutPrice}
            enforceAffixCap={pipeline.enforceAffixCap}
            steps={pipeline.steps}
            onLoad={handleLoadQuery}
          />
        </div>

        <div className="layout-right">
          <div className="trade-link-row">
            <TradeLinkButton
              league={league}
              derived={derived}
              status={status}
              onStatusChange={setStatus}
              buyoutPrice={buyoutPrice}
              onBuyoutPriceChange={setBuyoutPrice}
            />
          </div>

          <StatFilterList
            availableStats={derived.availableStats}
            chosenStats={derived.chosenStats}
            categories={data.categories}
            prefixCount={derived.prefixCount}
            suffixCount={derived.suffixCount}
            enforceAffixCap={pipeline.enforceAffixCap}
            onToggleAffixCap={pipeline.setEnforceAffixCap}
            onAdd={pipeline.addStat}
            onRemove={pipeline.removeStat}
            onRangeChange={pipeline.updateStatRange}
          />
        </div>
      </div>

      <footer className="site-footer">
        <a href="https://github.com/slickdomi/poe2-better-trade-filter" target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
        <a href="https://ko-fi.com/domi_zip" target="_blank" rel="noopener noreferrer">
          Support on Ko-fi
        </a>
      </footer>
    </main>
  );
}
