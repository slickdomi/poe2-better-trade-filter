import { useEffect, useRef, useState } from "react";
import filtersJson from "../data/filters.json";
import type { BuyoutPriceValue, FiltersData, QuerySnapshot, StatusOption } from "../state/types";
import { usePipeline } from "../state/usePipeline";
import { CategoryPicker } from "../components/CategoryPicker";
import { StatFilterList } from "../components/StatFilterList";
import { ItemNamePicker } from "../components/ItemNamePicker";
import { MiscFilterPanel } from "../components/MiscFilterPanel";
import { PipelineTrail } from "../components/PipelineTrail";
import { TradeLinkButton } from "../components/TradeLinkButton";
import { SearchableCombobox } from "../components/SearchableCombobox";
import { SavedQueriesPanel } from "../components/SavedQueriesPanel";
import { pushQueryToHistory, readSharedQuery } from "../lib/shareUrl";
import { getDefaultBuyoutPrice, getDefaultStatus } from "../lib/defaultTradeOptions";

const data = filtersJson as FiltersData;
const DEFAULT_LEAGUE = data.leagues[0]?.id ?? "Standard";

export function App() {
  const pipeline = usePipeline(data);
  const [league, setLeague] = useState(DEFAULT_LEAGUE);
  const [status, setStatus] = useState<StatusOption>("securable");
  const [buyoutPrice, setBuyoutPrice] = useState<BuyoutPriceValue>({ currency: "" });
  const { derived } = pipeline;

  function handleLoadQuery(query: QuerySnapshot) {
    pipeline.loadSteps(query.steps, {
      enforceAffixCap: query.enforceAffixCap,
      includeUniqueMods: query.includeUniqueMods ?? false,
    });
    setLeague(query.league);
    setStatus(query.status);
    setBuyoutPrice(query.buyoutPrice);
  }

  // The next two effects keep the URL and browser history in sync with app
  // state, in both directions:
  //  - state -> URL: whenever the query changes, push a new history entry
  //    encoding it (below), so the address bar always doubles as a share
  //    link and back/forward step through the edit history.
  //  - URL -> state: on first load (a shared link) and on every back/forward
  //    (popstate), decode whatever the URL says now and load it into state.
  // `skipNextPushRef` is what keeps these from fighting each other — a load
  // triggered by this effect would otherwise immediately trigger the other
  // effect to push yet another (redundant) history entry for the state we
  // just navigated to.
  const skipNextPushRef = useRef(true);

  useEffect(() => {
    function syncFromLocation() {
      skipNextPushRef.current = true;
      readSharedQuery().then((shared) => {
        if (shared) {
          handleLoadQuery(shared);
        } else {
          // Nothing (valid) in the URL — either the very first load, or the
          // user went back past the first edit — either way, blank slate.
          // Seller/buyout price fall back to the user's own saved defaults
          // (see lib/defaultTradeOptions.ts) rather than the hardcoded app
          // defaults, if they've saved one — the debounced push effect below
          // then encodes whichever applies into the URL on its own once this
          // settles, same as any other state change.
          pipeline.reset();
          pipeline.setIncludeUniqueMods(false);
          setLeague(DEFAULT_LEAGUE);
          setStatus(getDefaultStatus() ?? "securable");
          setBuyoutPrice(getDefaultBuyoutPrice() ?? { currency: "" });
        }
      });
    }
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryStepIndex = pipeline.steps.findIndex((s) => s.kind === "category");
  const leagueText = data.leagues.find((l) => l.id === league)?.text ?? league;
  const snapshot: QuerySnapshot = {
    league,
    status,
    buyoutPrice,
    enforceAffixCap: pipeline.enforceAffixCap,
    includeUniqueMods: pipeline.includeUniqueMods,
    steps: pipeline.steps,
  };
  const snapshotKey = JSON.stringify(snapshot);

  // Debounced so rapid-fire changes (typing a min/max value, dragging a
  // stat) collapse into one history entry once things settle, rather than
  // pushing on every keystroke and making back/forward useless.
  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      pushQueryToHistory(snapshot);
    }, 600);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey]);

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
            canSave={pipeline.steps.length > 0}
            league={league}
            status={status}
            buyoutPrice={buyoutPrice}
            enforceAffixCap={pipeline.enforceAffixCap}
            includeUniqueMods={pipeline.includeUniqueMods}
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
