import React, { useEffect, useRef } from "react";
import HeaderBar from "./components/HeaderBar.jsx";
import ChatBubble from "./components/ChatBubble.jsx";
import TypingBubble from "./components/TypingBubble.jsx";
import Alert from "./components/Alert.jsx";
import StatsBar from "./components/StatsBar.jsx";
import ChatInput from "./components/ChatInput.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { useChatStore } from "./store/chatStore.js";

const estTokens = (s = "") => Math.max(1, Math.ceil(s.length / 4));
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const {
    messages,
    input,
    loading,
    err,
    dark,
    conversations,
    conversationId,
    setInput,
    setLoading,
    setErr,
    toggleDark,
    setMessages,
    resetChat,
    bumpStatsPrompt,
    finalizeStats,
    newConversation,
    selectConversation,
    deleteConversation,
    loadConversations,
    persistCurrentMessages,
  } = useChatStore();

  const lastSentAtRef = useRef(0);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function exportJSON(id) {
    // if exporting current convo, use memory; else fetch it
    let data = null;
    if (id === conversationId) {
      data = messages;
    } else {
      try {
        const r = await fetch(`${API_BASE}/api/conversations/${id}/messages`);
        if (r.ok) {
          const j = await r.json();
          data = (j.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
            created_at: m.created_at,
          }));
        }
      } catch {}
    }
    if (!data) return;
    downloadText(
      `conversation-${id}.json`,
      JSON.stringify({ id, messages: data }, null, 2)
    );
  }

  async function exportMD(id) {
    let data = null;
    if (id === conversationId) {
      data = messages.map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.ts,
      }));
    } else {
      try {
        const r = await fetch(`${API_BASE}/api/conversations/${id}/messages`);
        if (r.ok) {
          const j = await r.json();
          data = (j.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
            ts: new Date(m.created_at).getTime(),
          }));
        }
      } catch {}
    }
    if (!data) return;
    const md = [
      `# Conversation ${id}\n`,
      ...data.map(
        (m) => `**${m.role.toUpperCase()}**\n\n${m.content}\n\n---\n`
      ),
    ].join("\n");
    downloadText(`conversation-${id}.md`, md);
  }

  function stop() {
    try {
      abortRef.current?.abort();
    } catch {}
  }

  // --- your existing send() stays the same EXCEPT the very end: call persistCurrentMessages() ---
  async function send() {
    setErr(null);
    const text = input.trim();
    if (!text) return;

    const nowTs = Date.now();
    if (nowTs - lastSentAtRef.current < 900) return;
    lastSentAtRef.current = nowTs;

    // ensure conversation exists
    let convId = conversationId;
    if (!convId) convId = await newConversation("New chat");

    // push messages (user + placeholder)
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

      // ✅ persist last turn to Supabase or local
      await persistCurrentMessages();
    }
  }

  return (
    <main
      className="min-h-screen
    bg-gradient-to-b from-white to-gray-100
  dark:from-zinc-950 dark:to-black"
    >
      <HeaderBar onToggleDark={toggleDark} dark={dark} />
      <section className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Sidebar */}
          <Sidebar
            items={conversations}
            selectedId={conversationId}
            onSelect={(id) => selectConversation(id)}
            onNew={() => newConversation("New chat")}
            onDelete={(id) => deleteConversation(id)}
            onRename={(id, title) =>
              useChatStore.getState().renameConversation(id, title)
            }
          />

          {/* Chat column */}
          <div>
            {err && (
              <div className="mb-3">
                <Alert kind="error" onClose={() => setErr(null)}>
                  {err}
                </Alert>
              </div>
            )}

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
        </div>
      </section>
    </main>
  );
}
