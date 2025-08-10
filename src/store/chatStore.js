import { create } from "zustand";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const safeLocal = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

// Initial theme
const initialDark = (() => {
  try {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return (
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false
    );
  } catch {
    return false;
  }
})();
if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("dark", initialDark);
}

const defaultSeed = [
  {
    id: 1,
    role: "assistant",
    content: "Hi there! Ask me anything—I’m here to help.",
    ts: Date.now(),
  },
];

const LS_CONV_LIST = "chat_local_conversations"; // [{id,title,created_at}]
const lsMsgsKey = (id) => `chat_local_messages_${id}`; // per-conversation messages

export const useChatStore = create((set, get) => ({
  // core
  messages: defaultSeed,
  input: "",
  loading: false,
  err: null,

  // meta
  dark: initialDark,
  hasSupabase: null, // set after /api/health
  conversations: [], // [{id,title,created_at}]
  conversationId: null,

  // stats
  lastPromptTokens: 0,
  lastCompletionTokens: 0,
  lastLatencyMs: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,

  // ---------- theme ----------
  setDark: (v) => {
    set({ dark: v });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", v);
    }
    try {
      localStorage.setItem("theme", v ? "dark" : "light");
    } catch {}
  },
  toggleDark: () => get().setDark(!get().dark),

  // ---------- ui/core ----------
  setInput: (v) => set({ input: v }),
  setLoading: (v) => set({ loading: v }),
  setErr: (v) => set({ err: v }),
  setMessages: (fnOrArray) =>
    set((state) => ({
      messages:
        typeof fnOrArray === "function" ? fnOrArray(state.messages) : fnOrArray,
    })),

  // ---------- backend capability ----------
  initBackend: async () => {
    try {
      const r = await fetch(`${API_BASE}/api/health`).then((r) => r.json());
      set({ hasSupabase: !!r?.hasSupabase });
      return !!r?.hasSupabase;
    } catch {
      set({ hasSupabase: false });
      return false;
    }
  },

  // ---------- conversations ----------
  loadConversations: async () => {
    const hasSupabase = get().hasSupabase ?? (await get().initBackend());
    if (hasSupabase) {
      try {
        const resp = await fetch(`${API_BASE}/api/conversations`);
        if (!resp.ok) throw new Error(String(resp.status)); // ⬅️ fallback on 404/501
        const j = await resp.json();
        if (Array.isArray(j?.conversations))
          set({ conversations: j.conversations });
        return;
      } catch (e) {
        // fall through to local
        set({ hasSupabase: false });
      }
    }
    // Local fallback
    const list = safeLocal.get("chat_local_conversations", []);
    set({ conversations: list });
    if (!list.length) await get().newConversation("New chat");
  },

  newConversation: async (title = "New chat") => {
    const hasSupabase = get().hasSupabase ?? (await get().initBackend());
    if (hasSupabase) {
      try {
        const res = await fetch(`${API_BASE}/api/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const data = await res.json();
        if (res.ok && data?.id) {
          set({ conversationId: data.id, messages: defaultSeed });
          await get().loadConversations();
          return data.id;
        }
      } catch {}
    } else {
      const id = `local-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const item = { id, title, created_at: new Date().toISOString() };
      const list = safeLocal.get(LS_CONV_LIST, []);
      list.unshift(item);
      safeLocal.set(LS_CONV_LIST, list);
      safeLocal.set(lsMsgsKey(id), defaultSeed);
      set({ conversations: list, conversationId: id, messages: defaultSeed });
      return id;
    }
  },

  selectConversation: async (id) => {
    const hasSupabase = get().hasSupabase ?? (await get().initBackend());
    if (!id) return;
    set({ conversationId: id });
    if (hasSupabase) {
      try {
        const r = await fetch(
          `${API_BASE}/api/conversations/${id}/messages`
        ).then((r) => r.json());
        if (Array.isArray(r?.messages)) {
          // normalize to our shape
          const msgs = r.messages.map((m, i) => ({
            id: Date.now() + i,
            role: m.role,
            content: m.content,
            ts: new Date(m.created_at).getTime(),
          }));
          set({ messages: msgs.length ? msgs : defaultSeed });
        }
      } catch {
        set({ messages: defaultSeed });
      }
    } else {
      const msgs = safeLocal.get(lsMsgsKey(id), defaultSeed);
      set({
        messages: Array.isArray(msgs) && msgs.length ? msgs : defaultSeed,
      });
    }
  },

  deleteConversation: async (id) => {
    const hasSupabase = get().hasSupabase ?? (await get().initBackend());
    if (!id) return;
    if (hasSupabase) {
      try {
        await fetch(`${API_BASE}/api/conversations/${id}`, {
          method: "DELETE",
        });
      } catch {}
      await get().loadConversations();
    } else {
      const list = safeLocal.get(LS_CONV_LIST, []).filter((x) => x.id !== id);
      safeLocal.set(LS_CONV_LIST, list);
      safeLocal.del(lsMsgsKey(id));
      set({ conversations: list });
    }
    // if we deleted the active one, move to first
    const cur = get().conversationId;
    if (cur === id) {
      const next = get().conversations[0]?.id;
      if (next) get().selectConversation(next);
      else set({ conversationId: null, messages: defaultSeed });
    }
  },

  renameConversation: async (id, title) => {
    if (!id || !title?.trim()) return;
    const hasSupabase = get().hasSupabase ?? (await get().initBackend());

    if (hasSupabase) {
      try {
        const res = await fetch(`${API_BASE}/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "Failed to rename");
        }
        await get().loadConversations();
      } catch (e) {
        console.error("renameConversation:", e);
      }
    } else {
      // local fallback
      const list = safeLocal.get("chat_local_conversations", []);
      const idx = list.findIndex((x) => x.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], title: title.trim() };
        safeLocal.set("chat_local_conversations", list);
        set({ conversations: list });
      }
    }
  },

  // Persist messages for current conversation (called after sending)
  persistCurrentMessages: async () => {
    const { conversationId, messages } = get();
    if (!conversationId) return;
    const hasSupabase = get().hasSupabase ?? (await get().initBackend());
    if (hasSupabase) {
      // append last 2 (user + assistant) if possible
      const last2 = messages
        .slice(-2)
        .map(({ role, content }) => ({ role, content }));
      try {
        await fetch(
          `${API_BASE}/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: last2 }),
          }
        );
      } catch {}
    } else {
      safeLocal.set(lsMsgsKey(conversationId), messages);
      // also update list (keep newest first)
      const list = safeLocal.get(LS_CONV_LIST, []);
      const idx = list.findIndex((x) => x.id === conversationId);
      if (idx > 0) {
        const [it] = list.splice(idx, 1);
        list.unshift(it);
        safeLocal.set(LS_CONV_LIST, list);
        set({ conversations: list });
      }
    }
  },

  // stats
  bumpStatsPrompt: (tok) =>
    set((s) => ({
      lastPromptTokens: tok,
      totalPromptTokens: s.totalPromptTokens + tok,
    })),
  finalizeStats: (latencyMs, completionTok) =>
    set((s) => ({
      lastLatencyMs: latencyMs,
      lastCompletionTokens: completionTok,
      totalCompletionTokens: s.totalCompletionTokens + completionTok,
    })),
}));
