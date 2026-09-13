import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import filtersJson from "../data/filters.json";
import {
  STATUS_OPTIONS,
  type BuyoutPriceValue,
  type FiltersData,
  type QuerySnapshot,
  type RegexSnapshot,
  type StatusOption,
  type TabId,
} from "../state/types";
import { usePipeline } from "../state/usePipeline";
import { CategoryChoice } from "../components/CategoryChoice";
import { StatFilterList } from "../components/StatFilterList";
import { ItemNamePicker } from "../components/ItemNamePicker";
import { MiscFilterPanel } from "../components/MiscFilterPanel";
import { PipelineTrail } from "../components/PipelineTrail";
import { TradeLinkButton } from "../components/TradeLinkButton";
import { SearchableCombobox } from "../components/SearchableCombobox";
import { SavedQueriesPanel } from "../components/SavedQueriesPanel";
import { RegexPage } from "./RegexPage";
import { pushSharedStateToHistory, readSharedState, type SharedState } from "../lib/shareUrl";
import { getDefaultBuyoutPrice, getDefaultStatus } from "../lib/defaultTradeOptions";
import { tradeQueryStore, type SavedQuery } from "../lib/savedQueries";

const data = filtersJson as FiltersData;
const DEFAULT_LEAGUE = data.leagues[0]?.id ?? "Standard";

const TABS: { id: TabId; label: string; badge?: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "regex", label: "Regex generator", badge: "(beta)" },
];

function describeSavedQuery(q: SavedQuery): string {
  const statusLabel = STATUS_OPTIONS.find((o) => o.id === q.status)?.label ?? q.status;
  return `${q.league} · ${statusLabel} · ${q.steps.length} filter${q.steps.length === 1 ? "" : "s"}`;
}

/** Whether the Trade tab is exactly what a blank slate loads (see syncFromLocation below). */
function isBlankTradeSnapshot(q: QuerySnapshot): boolean {
  return (
    q.steps.length === 0 &&
    q.enforceAffixCap &&
    !q.includeUniqueMods &&
    q.league === DEFAULT_LEAGUE &&
    q.status === (getDefaultStatus() ?? "securable") &&
    JSON.stringify(q.buyoutPrice) === JSON.stringify(getDefaultBuyoutPrice() ?? { currency: "" })
  );
}

function isBlankRegexSnapshot(r: RegexSnapshot): boolean {
  return r.steps.length === 0 && r.enforceAffixCap && !r.includeUniqueMods;
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("trade");
  const pipeline = usePipeline(data);
  // Lives here rather than in RegexPage so that tab's selection survives
  // switching away (only the active tab is mounted), and so it can be
  // encoded into the URL alongside the Trade tab's.
  const regexPipeline = usePipeline(data);
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
  // state — the open tab and both tabs' selections — in both directions:
  //  - state -> URL: whenever any of it changes, push a new history entry
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
      readSharedState().then((shared) => {
        setActiveTab(shared.tab);
        if (shared.trade) {
          handleLoadQuery(shared.trade);
        } else {
          // Nothing (valid) in the URL for this tab — either the very first
          // load, or the user went back past its first edit — either way,
          // blank slate. Seller/buyout price fall back to the user's own
          // saved defaults (see lib/defaultTradeOptions.ts) rather than the
          // hardcoded app defaults, if they've saved one — the debounced
          // push effect below then encodes whichever applies into the URL on
          // its own once this settles, same as any other state change.
          pipeline.reset();
          pipeline.setIncludeUniqueMods(false);
          setLeague(DEFAULT_LEAGUE);
          setStatus(getDefaultStatus() ?? "securable");
          setBuyoutPrice(getDefaultBuyoutPrice() ?? { currency: "" });
        }
        if (shared.regex) {
          regexPipeline.loadSteps(shared.regex.steps, {
            enforceAffixCap: shared.regex.enforceAffixCap,
            includeUniqueMods: shared.regex.includeUniqueMods,
          });
        } else {
          regexPipeline.loadSteps([], { enforceAffixCap: true, includeUniqueMods: false });
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
  const regexSnapshot: RegexSnapshot = {
    enforceAffixCap: regexPipeline.enforceAffixCap,
    includeUniqueMods: regexPipeline.includeUniqueMods,
    steps: regexPipeline.steps,
  };
  const sharedState: SharedState = {
    tab: activeTab,
    trade: isBlankTradeSnapshot(snapshot) ? null : snapshot,
    regex: isBlankRegexSnapshot(regexSnapshot) ? null : regexSnapshot,
  };
  const sharedStateKey = JSON.stringify(sharedState);

  // Debounced so rapid-fire changes (typing a min/max value, dragging a
  // stat) collapse into one history entry once things settle, rather than
  // pushing on every keystroke and making back/forward useless.
  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      pushSharedStateToHistory(sharedState);
    }, 600);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedStateKey]);

  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern.
  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const index = TABS.findIndex((t) => t.id === activeTab);
    const next = TABS[(index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setActiveTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <main>
      <header>
        <h1>PoE2 Better Trade Filter</h1>
        {activeTab === "trade" && (
          <div className="league-select">
            <span>League</span>
            <SearchableCombobox
              options={data.leagues.map((l) => ({ id: l.id, label: l.text }))}
              selectedLabel={leagueText}
              onSelect={setLeague}
            />
          </div>
        )}
      </header>

      <div className="tabs" role="tablist" aria-label="Tools">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={isActive ? `tabpanel-${tab.id}` : undefined}
              tabIndex={isActive ? 0 : -1}
              className={`tab${isActive ? " tab-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
              {tab.badge && <span className="tab-badge">{tab.badge}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "regex" ? (
          <RegexPage data={data} pipeline={regexPipeline} />
        ) : (
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
                  store={tradeQueryStore}
                  noun={{ singular: "query", plural: "queries" }}
                  snapshot={snapshot}
                  canSave={pipeline.steps.length > 0}
                  describe={describeSavedQuery}
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
                  onToggleEnabled={pipeline.setStatEnabled}
                />
              </div>
            </div>
          </>
        )}
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
