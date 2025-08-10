import { create } from "zustand";

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
};

const defaultSeed = [
  {
    id: 1,
    role: "assistant",
    content: "Day 6: Supabase persistence + Zustand global state.",
    ts: Date.now(),
  },
];

export const useChatStore = create((set, get) => ({
  // core
  messages: defaultSeed,
  input: "",
  loading: false,
  err: null,

  // meta
  conversationId: safeLocal.get("conversationId", null),
  dark: (() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (saved) return saved === "dark";
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  })(),

  // stats
  lastPromptTokens: 0,
  lastCompletionTokens: 0,
  lastLatencyMs: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,

  // actions
  setInput: (v) => set({ input: v }),
  setLoading: (v) => set({ loading: v }),
  setErr: (v) => set({ err: v }),
  setDark: (v) => {
    set({ dark: v });
    if (typeof document !== "undefined")
      document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("theme", v ? "dark" : "light");
  },
  toggleDark: () => get().setDark(!get().dark),

  setMessages: (fnOrArray) =>
    set((state) => ({
      messages:
        typeof fnOrArray === "function" ? fnOrArray(state.messages) : fnOrArray,
    })),

  setConversationId: (id) => {
    set({ conversationId: id });
    safeLocal.set("conversationId", id);
  },

  resetChat: () =>
    set({
      messages: defaultSeed,
      input: "",
      err: null,
      lastPromptTokens: 0,
      lastCompletionTokens: 0,
      lastLatencyMs: 0,
    }),

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
