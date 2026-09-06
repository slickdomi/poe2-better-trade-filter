import { useMemo, useState } from "react";
import type { FiltersData, MiscFilterGroup, MiscFilterValue, StatSectionType, Step } from "./types";
import { DEFAULT_SECTION_ID, deriveState } from "./derive";

export function usePipeline(data: FiltersData) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [enforceAffixCap, setEnforceAffixCap] = useState(true);
  const derived = useMemo(
    () => deriveState(steps, data, { enforceAffixCap }),
    [steps, data, enforceAffixCap],
  );

  function selectCategory(categoryId: string) {
    setSteps((prev) => [...prev, { kind: "category", categoryId }]);
  }

  function addStat(statId: string) {
    setSteps((prev) => [...prev, { kind: "stat", statId }]);
  }

  function updateStatRange(statId: string, min: number | undefined, max: number | undefined) {
    setSteps((prev) =>
      prev.map((s) => (s.kind === "stat" && s.statId === statId ? { ...s, min, max } : s)),
    );
  }

  function removeStat(statId: string) {
    setSteps((prev) => prev.filter((s) => !(s.kind === "stat" && s.statId === statId)));
  }

  function addStatSection(type: StatSectionType) {
    const sectionId = crypto.randomUUID();
    setSteps((prev) => [...prev, { kind: "statSection", sectionId, type }]);
  }

  function updateStatSection(sectionId: string, patch: { type?: StatSectionType; min?: number; max?: number }) {
    setSteps((prev) =>
      prev.map((s) => (s.kind === "statSection" && s.sectionId === sectionId ? { ...s, ...patch } : s)),
    );
  }

  /** Member stats fall back to the default (AND) section rather than being deleted along with their box. */
  function removeStatSection(sectionId: string) {
    setSteps((prev) =>
      prev
        .filter((s) => !(s.kind === "statSection" && s.sectionId === sectionId))
        .map((s) => (s.kind === "stat" && s.sectionId === sectionId ? { ...s, sectionId: undefined } : s)),
    );
  }

  function moveStatToSection(statId: string, sectionId: string) {
    setSteps((prev) =>
      prev.map((s) =>
        s.kind === "stat" && s.statId === statId
          ? { ...s, sectionId: sectionId === DEFAULT_SECTION_ID ? undefined : sectionId }
          : s,
      ),
    );
  }

  function updateStatWeight(statId: string, weight: number | undefined) {
    setSteps((prev) => prev.map((s) => (s.kind === "stat" && s.statId === statId ? { ...s, weight } : s)));
  }

  function setItemName(name: string) {
    setSteps((prev) => [...prev.filter((s) => s.kind !== "itemName"), { kind: "itemName", name }]);
  }

  function clearItemName() {
    setSteps((prev) => prev.filter((s) => s.kind !== "itemName"));
  }

  function addMiscFilter(group: MiscFilterGroup, filterId: string, value: MiscFilterValue) {
    setSteps((prev) => [...prev, { kind: "misc", group, filterId, value }]);
  }

  function updateMiscFilter(filterId: string, value: MiscFilterValue) {
    setSteps((prev) =>
      prev.map((s) => (s.kind === "misc" && s.filterId === filterId ? { ...s, value } : s)),
    );
  }

  function removeMiscFilter(filterId: string) {
    setSteps((prev) => prev.filter((s) => !(s.kind === "misc" && s.filterId === filterId)));
  }

  function undoLast() {
    setSteps((prev) => prev.slice(0, -1));
  }

  /** Remove just the step at `index`, leaving every other step (before and after it) untouched. */
  function removeStepAt(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setSteps([]);
  }

  function loadSteps(newSteps: Step[], options?: { enforceAffixCap?: boolean }) {
    setSteps(newSteps);
    if (options?.enforceAffixCap !== undefined) setEnforceAffixCap(options.enforceAffixCap);
  }

  return {
    steps,
    derived,
    enforceAffixCap,
    setEnforceAffixCap,
    selectCategory,
    addStat,
    updateStatRange,
    removeStat,
    addStatSection,
    updateStatSection,
    removeStatSection,
    moveStatToSection,
    updateStatWeight,
    setItemName,
    clearItemName,
    addMiscFilter,
    updateMiscFilter,
    removeMiscFilter,
    undoLast,
    removeStepAt,
    reset,
    loadSteps,
  };
}
