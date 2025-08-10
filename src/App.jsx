import React, { useEffect, useRef, useState } from "react";
import ChatBubble from "./components/ChatBubble.jsx";
import TypingBubble from "./components/TypingBubble.jsx";
import Alert from "./components/Alert.jsx";
import StatsBar from "./components/StatsBar.jsx";

const seed = [
  {
    id: 1,
    role: "assistant",
    content:
      "Day 5: polished UX — errors, timeout/stop, dark mode, token/latency stats.",
    ts: Date.now(),
  },
];

// quick-n-dirty token estimator (~4 chars per token)
const estTokens = (s = "") => Math.max(1, Math.ceil(s.length / 4));

export default function App() {
  const [messages, setMessages] = useState(seed);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // stats
  const [lastPromptTokens, setLastPromptTokens] = useState(0);
  const [lastCompletionTokens, setLastCompletionTokens] = useState(0);
  const [lastLatencyMs, setLastLatencyMs] = useState(0);
  const [totalPromptTokens, setTotalPromptTokens] = useState(0);
  const [totalCompletionTokens, setTotalCompletionTokens] = useState(0);

  // dark mode
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved
      ? saved === "dark"
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const lastSentAtRef = useRef(0);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function stop() {
    try {
      abortRef.current?.abort();
    } catch {}
  }

  async function send() {
    setErr(null);
    const text = input.trim();
    if (!text) return;

    // cooldown to avoid bursts
    const nowTs = Date.now();
    if (nowTs - lastSentAtRef.current < 900) return;
    lastSentAtRef.current = nowTs;

    // prime UI
    const now = Date.now();
    const userMsg = { id: now, role: "user", content: text, ts: now };
    const assistantId = now + 1;
    const placeholder = {
      id: assistantId,
      role: "assistant",
      content: "",
      ts: Date.now(),
    };
    const nextMessages = [...messages, userMsg, placeholder];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    // prompt token estimate
    const promptTok = estTokens(text);
    setLastPromptTokens(promptTok);
    setTotalPromptTokens((t) => t + promptTok);

    // client timeout + abort controller
    const ac = new AbortController();
    abortRef.current = ac;
    const clientTimeout = setTimeout(() => ac.abort("Client timeout"), 12_000);

    const started = performance.now();
    let acc = "";
    let streamed = false;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
          system: "You are a helpful assistant. Be concise and clear.",
          model: "gemini-1.5-flash",
          temperature: 0.7,
        }),
      });

      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "Request failed");
        throw new Error(t || "Streaming request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        streamed = true;
        const chunk = decoder.decode(value || new Uint8Array(), {
          stream: true,
        });
        if (!chunk) continue;
        acc += chunk;

        // live completion token estimate
        const compTok = estTokens(acc);
        setLastCompletionTokens(compTok);

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
        );
      }
    } catch (e) {
      // Fallback to non-streaming once if streaming failed early
      if (!streamed && e.name !== "AbortError") {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: nextMessages.map(({ role, content }) => ({
                role,
                content,
              })),
              system: "You are a helpful assistant. Be concise and clear.",
              model: "gemini-1.5-flash",
              temperature: 0.7,
            }),
          });
          const data = await res.json();
          const reply = res.ok
            ? data.reply || "(no content)"
            : data.error || "Request failed";
          acc = reply;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
          );
        } catch (e2) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${e2.message}` }
                : m
            )
          );
          setErr(`Fallback error: ${e2.message}`);
        }
      } else if (e.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "(stopped)" } : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${e.message}` } : m
          )
        );
        setErr(e.message || "Request failed");
      }
    } finally {
      clearTimeout(clientTimeout);
      abortRef.current = null;
      setLoading(false);

      // finalize stats
      const elapsed = performance.now() - started;
      setLastLatencyMs(elapsed);
      const compTok = estTokens(acc);
      setLastCompletionTokens(compTok);
      setTotalCompletionTokens((t) => t + compTok);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function clearChat() {
    setMessages(seed);
    setErr(null);
    setLastPromptTokens(0);
    setLastCompletionTokens(0);
    setLastLatencyMs(0);
  }

  return (
    <main className="min-h-screen flex flex-col dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b bg-white sticky top-0 z-10 dark:bg-zinc-950 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-semibold">AI Chatbot UI — Day 5</h1>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setDark((d) => !d)}
              className="border rounded px-3 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              title="Toggle dark mode"
            >
              {dark ? "☀️ Light" : "🌙 Dark"}
            </button>
            <button
              onClick={clearChat}
              className="border rounded px-3 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto w-full px-4 pt-4 space-y-2">
        {err && (
          <Alert kind="error" onClose={() => setErr(null)}>
            {err}
          </Alert>
        )}
      </section>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-4">
        <div
          ref={scrollRef}
          className="h-[65vh] overflow-y-auto space-y-3 p-2 bg-gray-50 rounded-lg border dark:bg-zinc-950 dark:border-zinc-800"
        >
          {messages.map((m) => (
            <ChatBubble key={m.id} role={m.role} ts={m.ts}>
              {m.content}
            </ChatBubble>
          ))}
          {loading && <TypingBubble />}
        </div>

        <div className="mt-3 flex gap-2">
          <textarea
            className="flex-1 rounded-lg px-3 py-2 min-h-[48px] max-h-40
             bg-white text-gray-900 placeholder-gray-500 border border-gray-300
             caret-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
             dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:border-zinc-700 dark:focus:ring-blue-400"
            placeholder="Type a message. Press Enter to send. Shift+Enter for a new line."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />

          <button
            onClick={send}
            className="px-4 py-2 border rounded-lg bg-blue-600 text-white disabled:opacity-50"
            disabled={loading || input.trim().length === 0}
          >
            Send
          </button>
          <button
            onClick={stop}
            className="px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 dark:border-zinc-800 disabled:opacity-50"
            disabled={!loading}
            title="Abort current request"
          >
            Stop
          </button>
        </div>

        <StatsBar
          lastPromptTokens={lastPromptTokens}
          lastCompletionTokens={lastCompletionTokens}
          totalPromptTokens={totalPromptTokens}
          totalCompletionTokens={totalCompletionTokens}
          lastLatencyMs={lastLatencyMs}
        />

        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-2">
          Errors show above as a banner; you can stop a slow request with
          “Stop”. Token counts are approximate.
        </p>
      </section>
    </main>
  );
}
