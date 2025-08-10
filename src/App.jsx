import React, { useEffect, useRef } from "react";
import HeaderBar from "./components/HeaderBar.jsx";
import ChatBubble from "./components/ChatBubble.jsx";
import TypingBubble from "./components/TypingBubble.jsx";
import Alert from "./components/Alert.jsx";
import StatsBar from "./components/StatsBar.jsx";
import ChatInput from "./components/ChatInput.jsx";
import { useChatStore } from "./store/chatStore.js";

const estTokens = (s = "") => Math.max(1, Math.ceil(s.length / 4));
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export default function App() {
  const {
    messages,
    input,
    loading,
    err,
    dark,
    conversationId,
    setInput,
    setLoading,
    setErr,
    toggleDark,
    setMessages,
    setConversationId,
    resetChat,
    bumpStatsPrompt,
    finalizeStats,
  } = useChatStore();

  const lastSentAtRef = useRef(0);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (conversationId && String(conversationId).startsWith("local-")) {
      try {
        localStorage.setItem("chat_local_messages", JSON.stringify(messages));
      } catch {}
    }
  }, [messages, conversationId]);

  async function ensureConversation() {
    if (conversationId) return conversationId;
    try {
      const res = await fetch(`${API_BASE}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Chat" }),
      });
      if (res.status === 501) {
        const id = `local-${Date.now()}`;
        setConversationId(id);
        const prev = JSON.parse(
          localStorage.getItem("chat_local_messages") || "null"
        );
        if (prev && Array.isArray(prev) && prev.length) setMessages(prev);
        return id;
      }
      const data = await res.json();
      if (!res.ok || !data?.id)
        throw new Error(data?.error || "Failed to create conversation");
      setConversationId(data.id);
      return data.id;
    } catch {
      const id = `local-${Date.now()}`;
      setConversationId(id);
      return id;
    }
  }

  function stop() {
    try {
      abortRef.current?.abort();
    } catch {}
  }

  async function send() {
    setErr(null);
    const text = input.trim();
    if (!text) return;

    const nowTs = Date.now();
    if (nowTs - lastSentAtRef.current < 900) return;
    lastSentAtRef.current = nowTs;

    const convId = await ensureConversation();

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

    const promptTok = estTokens(text);
    bumpStatsPrompt(promptTok);

    const ac = new AbortController();
    abortRef.current = ac;
    const clientTimeout = setTimeout(() => ac.abort("Client timeout"), 12_000);

    const started = performance.now();
    let acc = "";
    let streamed = false;

    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
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
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
        );
      }
    } catch (e) {
      if (!streamed && e.name !== "AbortError") {
        try {
          const res = await fetch(`${API_BASE}/api/chat`, {
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
          acc = res.ok
            ? data.reply || "(no content)"
            : data.error || "Request failed";
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
      const elapsed = performance.now() - started;
      const compTok = estTokens(acc);
      finalizeStats(elapsed, compTok);

      if (convId && !String(convId).startsWith("local-")) {
        try {
          await fetch(`${API_BASE}/api/conversations/${convId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [
                { role: "user", content: text },
                { role: "assistant", content: acc || "(no content)" },
              ],
            }),
          });
        } catch {}
      } else {
        try {
          localStorage.setItem(
            "chat_local_messages",
            JSON.stringify(useChatStore.getState().messages)
          );
        } catch {}
      }
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <HeaderBar onToggleDark={toggleDark} dark={dark} />
      <section className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {err && (
            <div className="mb-3">
              <Alert kind="error" onClose={() => setErr(null)}>
                {err}
              </Alert>
            </div>
          )}

          {/* Chat card */}
          <div className="glass rounded-3xl p-4">
            <div
              ref={scrollRef}
              className="h-[55vh] overflow-y-auto space-y-3 p-2"
            >
              {messages.map((m) => (
                <ChatBubble key={m.id} role={m.role} ts={m.ts}>
                  {m.content}
                </ChatBubble>
              ))}
              {loading && <TypingBubble />}
            </div>
          </div>

          <StatsBar />

          <ChatInput
            value={input}
            onChange={setInput}
            onSend={send}
            onStop={() => {
              try {
                abortRef.current?.abort();
              } catch {}
            }}
            disabledSend={loading || input.trim().length === 0}
            canStop={!!loading}
          />

          <div className="mt-3 flex justify-end">
            <button
              onClick={resetChat}
              className="px-3 py-1.5 text-sm rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5"
            >
              Reset
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
