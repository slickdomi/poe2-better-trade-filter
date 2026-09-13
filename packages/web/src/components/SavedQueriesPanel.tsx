import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { SavedEntry, SavedQueryFolder, SavedQueryStore } from "../lib/savedQueries";

interface Props<S extends object> {
  /** Which pool this panel reads and writes — each tab has its own. */
  store: SavedQueryStore<S>;
  /** What one entry is called in the UI, e.g. { singular: "query", plural: "queries" }. */
  noun: { singular: string; plural: string };
  /** The current state, saved as-is by "Save current". */
  snapshot: S;
  canSave: boolean;
  /** The one-line summary shown under an entry's name. */
  describe: (entry: SavedEntry<S>) => string;
  onLoad: (entry: SavedEntry<S>) => void;
}

// Custom dataTransfer types, not "text/plain" — folders and queries need to
// be told apart on drop, and a drag started from outside this panel (a file,
// text from elsewhere) should never be mistaken for one of these.
const QUERY_MIME = "application/x-poe2bt-saved-query";
const FOLDER_MIME = "application/x-poe2bt-saved-folder";
/** Sentinel for the top-level drop target — never a real folder id (those are UUIDs). */
const ROOT_ID = "root";

export function SavedQueriesPanel<S extends object>({ store, noun, snapshot, canSave, describe, onLoad }: Props<S>) {
  const [name, setName] = useState("");
  const [queries, setQueries] = useState(store.list);
  const [folders, setFolders] = useState(store.listFolders);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Pending "hover long enough to auto-expand" timers, keyed by folder id —
  // see handleDragOver's doc comment for why this exists.
  const expandTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = expandTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  function clearExpandTimer(targetId: string) {
    const timer = expandTimersRef.current.get(targetId);
    if (timer) {
      clearTimeout(timer);
      expandTimersRef.current.delete(targetId);
    }
  }

  function clearAllExpandTimers() {
    for (const timer of expandTimersRef.current.values()) clearTimeout(timer);
    expandTimersRef.current.clear();
  }

  // A drag that ends without landing on a drop target (dropped outside the
  // panel, or cancelled with Escape) never calls handleDrop — clean up here too.
  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
    clearAllExpandTimers();
  }

  function refresh() {
    setQueries(store.list());
    setFolders(store.listFolders());
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    store.save({ ...snapshot, name: trimmed });
    setName("");
    refresh();
  }

  function handleDelete(id: string) {
    store.remove(id);
    refresh();
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleNewFolder(parentId: string | null) {
    const trimmed = window.prompt("Folder name:")?.trim();
    if (!trimmed) return;
    store.createFolder(trimmed, parentId);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    refresh();
  }

  function handleRenameFolder(folder: SavedQueryFolder) {
    const trimmed = window.prompt("Rename folder:", folder.name)?.trim();
    if (!trimmed || trimmed === folder.name) return;
    store.renameFolder(folder.id, trimmed);
    refresh();
  }

  function handleDeleteFolder(folder: SavedQueryFolder) {
    if (!window.confirm(`Delete "${folder.name}"? Its contents move up a level rather than being deleted.`)) return;
    store.deleteFolder(folder.id);
    refresh();
  }

  function handleExport() {
    const json = store.exportToJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${store.exportFilePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so re-selecting the same file later still fires onChange
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      store.importFromJson(text);
      refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import file.");
    }
  }

  function handleDragOver(e: DragEvent, targetId: string) {
    if (!e.dataTransfer.types.includes(QUERY_MIME) && !e.dataTransfer.types.includes(FOLDER_MIME)) return;
    e.preventDefault();
    e.stopPropagation(); // dragover bubbles just like drop does — without this, every ancestor (root included) re-claims the highlight on each bubble, and the outermost one wins
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== targetId) {
      setDragOverId(targetId);
      // Hovering a collapsed folder while dragging auto-expands it after a
      // short pause, the same way a file manager or VS Code's sidebar does —
      // otherwise reaching a nested target means pre-expanding the whole
      // tree by hand first, since you can't click a toggle mid-drag.
      if (targetId !== ROOT_ID && !expanded.has(targetId)) {
        const timer = setTimeout(() => setExpanded((prev) => new Set(prev).add(targetId)), 500);
        expandTimersRef.current.set(targetId, timer);
      }
    }
  }

  function handleDragLeave(e: DragEvent, targetId: string) {
    // Fires on every child boundary crossing too — only clear once the pointer
    // has actually left this drop target's whole box, not just moved between children.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverId((cur) => (cur === targetId ? null : cur));
      clearExpandTimer(targetId);
    }
  }

  function handleDrop(e: DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    e.stopPropagation(); // the innermost folder (or root) under the pointer should win, not every ancestor too
    setDragOverId(null);
    setDraggingId(null);
    clearAllExpandTimers();
    // Auto-expand the folder something just got dropped into, so a moved
    // item (or the folder that now contains it) is immediately visible
    // instead of vanishing into a collapsed folder.
    if (targetFolderId) setExpanded((prev) => new Set(prev).add(targetFolderId));
    const queryId = e.dataTransfer.getData(QUERY_MIME);
    if (queryId) {
      store.moveToFolder(queryId, targetFolderId);
      refresh();
      return;
    }
    const folderId = e.dataTransfer.getData(FOLDER_MIME);
    if (folderId) {
      store.moveFolderToFolder(folderId, targetFolderId); // no-ops if this would nest a folder inside itself
      refresh();
    }
  }

  function renderQuery(q: SavedEntry<S>) {
    return (
      <li key={q.id} className={`saved-query-item${draggingId === q.id ? " saved-query-dragging" : ""}`}>
        <span
          className="drag-handle"
          draggable
          title="Drag to move into a folder"
          aria-hidden="true"
          onDragStart={(e) => {
            e.dataTransfer.setData(QUERY_MIME, q.id);
            e.dataTransfer.effectAllowed = "move";
            setDraggingId(q.id);
          }}
          onDragEnd={handleDragEnd}
        />
        <div className="saved-query-info">
          <span className="saved-query-name">{q.name}</span>
          <span className="saved-query-meta">{describe(q)}</span>
        </div>
        <div className="saved-query-actions">
          <button type="button" onClick={() => onLoad(q)}>
            Load
          </button>
          <button type="button" onClick={() => handleDelete(q.id)} title={`Delete this saved ${noun.singular}`}>
            Delete
          </button>
        </div>
      </li>
    );
  }

  function renderFolder(folder: SavedQueryFolder) {
    const isExpanded = expanded.has(folder.id);
    const isDropTarget = dragOverId === folder.id;
    const childFolders = folders.filter((f) => f.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name));
    const childQueries = queries.filter((q) => q.folderId === folder.id);

    return (
      <li
        key={folder.id}
        className={`saved-query-folder${draggingId === folder.id ? " saved-query-dragging" : ""}`}
        onDragOver={(e) => handleDragOver(e, folder.id)}
        onDragLeave={(e) => handleDragLeave(e, folder.id)}
        onDrop={(e) => handleDrop(e, folder.id)}
      >
        {/* Highlight only this folder's own row, not its whole (possibly
            expanded) subtree — otherwise the box drawn around a folder with
            visible children reads as "drop somewhere in here", not
            specifically "goes inside this folder". */}
        <div className={`saved-folder-header${isDropTarget ? " saved-folder-drag-over" : ""}`}>
          <span
            className="drag-handle"
            draggable
            title="Drag to move into another folder"
            aria-hidden="true"
            onDragStart={(e) => {
              e.dataTransfer.setData(FOLDER_MIME, folder.id);
              e.dataTransfer.effectAllowed = "move";
              setDraggingId(folder.id);
            }}
            onDragEnd={handleDragEnd}
          />
          <button type="button" className="folder-toggle" onClick={() => toggleExpanded(folder.id)}>
            {isExpanded ? "▾" : "▸"}
          </button>
          <span className="folder-icon" aria-hidden="true">
            {isDropTarget ? "📂" : "📁"}
          </span>
          <span className="saved-folder-name" title="Double-click to rename" onDoubleClick={() => handleRenameFolder(folder)}>
            {folder.name}
          </span>
          <div className="saved-folder-actions">
            <button type="button" onClick={() => handleNewFolder(folder.id)} title="New subfolder">
              + Folder
            </button>
            <button type="button" onClick={() => handleRenameFolder(folder)} title="Rename folder">
              Rename
            </button>
            <button type="button" onClick={() => handleDeleteFolder(folder)} title="Delete folder (keeps contents)">
              Delete
            </button>
          </div>
        </div>
        {isExpanded && (
          <ul className="saved-queries-tree" style={{ paddingLeft: "1.25rem" }}>
            {childFolders.map((f) => renderFolder(f))}
            {childQueries.map(renderQuery)}
            {childFolders.length === 0 && childQueries.length === 0 && (
              <li className="hint saved-folder-empty">Empty — drag a saved {noun.singular} here.</li>
            )}
          </ul>
        )}
      </li>
    );
  }

  const rootFolders = folders.filter((f) => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name));
  const rootQueries = queries.filter((q) => q.folderId === null);

  return (
    <section className="saved-queries">
      <h2>Saved {noun.plural}</h2>

      <div className="saved-queries-save-row">
        <input
          type="text"
          placeholder={`Name this ${noun.singular}…`}
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

      <div className="saved-queries-toolbar">
        <button type="button" onClick={() => handleNewFolder(null)}>
          + New folder
        </button>
        <button type="button" onClick={handleExport} disabled={queries.length === 0 && folders.length === 0}>
          Export…
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="visually-hidden"
          onChange={handleImportFile}
        />
      </div>
      {importError && <p className="error">{importError}</p>}

      {queries.length === 0 && folders.length === 0 ? (
        <p className="hint">No saved {noun.plural} yet.</p>
      ) : (
        <>
          {/* Only rendered when there's a folder to actually escape from —
              a nested tree can easily fill the whole box with no visible
              root-level empty space left to drop onto otherwise, which made
              dragging something back out effectively impossible. Kept
              mounted at all times (not just mid-drag): inserting it only
              once a drag starts would shift the whole list down right as
              you start dragging, right under the cursor. */}
          {folders.length > 0 && (
            <div
              className={`saved-queries-outdent${dragOverId === ROOT_ID ? " saved-folder-drag-over" : ""}`}
              onDragOver={(e) => handleDragOver(e, ROOT_ID)}
              onDragLeave={(e) => handleDragLeave(e, ROOT_ID)}
              onDrop={(e) => handleDrop(e, null)}
            >
              ⤴ Drop here to move to the top level
            </div>
          )}
          <ul
            className={`saved-queries-tree saved-queries-root${dragOverId === ROOT_ID ? " saved-folder-drag-over" : ""}`}
            onDragOver={(e) => handleDragOver(e, ROOT_ID)}
            onDragLeave={(e) => handleDragLeave(e, ROOT_ID)}
            onDrop={(e) => handleDrop(e, null)}
          >
            {rootFolders.map((f) => renderFolder(f))}
            {rootQueries.map(renderQuery)}
          </ul>
        </>
      )}
    </section>
  );
}
