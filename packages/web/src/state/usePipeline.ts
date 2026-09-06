import { useMemo, useState } from "react";
import type { FiltersData, MiscFilterGroup, MiscFilterValue, Step } from "./types";
import { deriveState } from "./derive";

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

  return {
    steps,
    derived,
    enforceAffixCap,
    setEnforceAffixCap,
    selectCategory,
    addStat,
    updateStatRange,
    removeStat,
    setItemName,
    clearItemName,
    addMiscFilter,
    updateMiscFilter,
    removeMiscFilter,
    undoLast,
    removeStepAt,
    reset,
  };
}
