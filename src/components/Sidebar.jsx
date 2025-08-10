import React, { useState } from "react";

export default function Sidebar({
  items = [],
  selectedId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}) {
  const [editingId, setEditingId] = useState(null);
  const [tempTitle, setTempTitle] = useState("");

  function startEdit(item) {
    setEditingId(item.id);
    setTempTitle(item.title || "Untitled");
  }
  async function saveEdit(id) {
    const t = tempTitle.trim();
    if (t) await onRename?.(id, t);
    setEditingId(null);
    setTempTitle("");
  }
  function cancelEdit() {
    setEditingId(null);
    setTempTitle("");
  }

  return (
    <aside className="w-[260px] hidden md:block">
      <div className="glass rounded-2xl p-3 sticky top-4 max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <button
            onClick={onNew}
            className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
            title="New chat"
          >
            New
          </button>
        </div>

        <ul className="space-y-1">
          {items.map((c) => {
            const isSel = selectedId === c.id;
            const isEditing = editingId === c.id;
            return (
              <li key={c.id}>
                <div
                  className={`group flex items-center justify-between gap-2 rounded-lg px-2 py-2
                              ${
                                isSel
                                  ? "bg-blue-600 text-white"
                                  : "hover:bg-black/5 dark:hover:bg-white/5"
                              }`}
                  onClick={() => !isEditing && onSelect(c.id)}
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        autoFocus
                        className={`w-full text-sm rounded px-2 py-1 outline-none border
                                   ${
                                     isSel
                                       ? "bg-white/20 text-white border-white/30"
                                       : "bg-white/70 dark:bg-white/10 border-black/10 dark:border-white/10"
                                   }`}
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(c.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="truncate text-sm">
                          {c.title || "Untitled"}
                        </div>
                        <div
                          className={`text-[11px] opacity-70 truncate ${
                            isSel
                              ? "text-blue-100"
                              : "text-gray-500 dark:text-zinc-400"
                          }`}
                        >
                          {new Date(c.created_at).toLocaleString()}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <button
                          className={`text-[11px] px-2 py-1 rounded ${
                            isSel
                              ? "bg-white/20 text-white"
                              : "bg-black/10 dark:bg-white/10"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEdit(c.id);
                          }}
                          title="Save"
                        >
                          Save
                        </button>
                        <button
                          className={`text-[11px] px-2 py-1 rounded ${
                            isSel
                              ? "bg-white/20 text-white"
                              : "bg-black/10 dark:bg-white/10"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEdit();
                          }}
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`text-[11px] px-2 py-1 rounded opacity-70 group-hover:opacity-100 ${
                            isSel
                              ? "bg-white/20 text-white"
                              : "bg-black/10 dark:bg-white/10"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(c);
                          }}
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          className={`text-[11px] px-2 py-1 rounded opacity-70 group-hover:opacity-100 ${
                            isSel
                              ? "bg-white/20 text-white"
                              : "bg-black/10 dark:bg-white/10"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(c.id);
                          }}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {!items.length && (
            <li className="text-xs text-gray-500 dark:text-zinc-400">
              No conversations yet.
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}
