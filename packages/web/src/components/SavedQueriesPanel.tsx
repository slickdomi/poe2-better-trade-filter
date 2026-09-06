import { useState } from "react";
import { STATUS_OPTIONS } from "../state/types";
import { deleteSavedQuery, saveQuery, type SavedQuery } from "../lib/savedQueries";

interface Props {
  queries: SavedQuery[];
  onQueriesChange: () => void;
  canSave: boolean;
  league: string;
  status: SavedQuery["status"];
  buyoutPrice: SavedQuery["buyoutPrice"];
  enforceAffixCap: boolean;
  steps: SavedQuery["steps"];
  onLoad: (query: SavedQuery) => void;
}

export function SavedQueriesPanel({
  queries,
  onQueriesChange,
  canSave,
  league,
  status,
  buyoutPrice,
  enforceAffixCap,
  steps,
  onLoad,
}: Props) {
  const [name, setName] = useState("");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveQuery({ name: trimmed, league, status, buyoutPrice, enforceAffixCap, steps });
    setName("");
    onQueriesChange();
  }

  function handleDelete(id: string) {
    deleteSavedQuery(id);
    onQueriesChange();
  }

  return (
    <section className="saved-queries">
      <h2>Saved queries</h2>

      <div className="saved-queries-save-row">
        <input
          type="text"
          placeholder="Name this query…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          disabled={!canSave}
        />
        <button type="button" onClick={handleSave} disabled={!canSave || !name.trim()}>
          Save current
        </button>
      </div>
      {!canSave && <p className="hint">Add at least one filter before saving.</p>}

      {queries.length === 0 ? (
        <p className="hint">No saved queries yet.</p>
      ) : (
        <ul className="saved-queries-list">
          {queries.map((q) => (
            <li key={q.id}>
              <div className="saved-query-info">
                <span className="saved-query-name">{q.name}</span>
                <span className="saved-query-meta">
                  {q.league} · {STATUS_OPTIONS.find((o) => o.id === q.status)?.label ?? q.status} ·{" "}
                  {q.steps.length} filter{q.steps.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="saved-query-actions">
                <button type="button" onClick={() => onLoad(q)}>
                  Load
                </button>
                <button type="button" onClick={() => handleDelete(q.id)} title="Delete this saved query">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
