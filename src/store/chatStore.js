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

// 1) Compute initial theme ONCE
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

// 2) Apply it to <html> immediately
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

export const useChatStore = create((set, get) => ({
  // core
  messages: defaultSeed,
  input: "",
  loading: false,
  err: null,

  // meta
  conversationId: safeLocal.get("conversationId", null),
  dark: initialDark, // 👈 use the precomputed value

  // stats...
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
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", v); // idempotent
    }
    try {
      localStorage.setItem("theme", v ? "dark" : "light");
    } catch {}
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
