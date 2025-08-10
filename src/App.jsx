import React, { useEffect, useRef, useState } from "react";
import ChatBubble from "./components/ChatBubble.jsx";
import TypingBubble from "./components/TypingBubble.jsx";

const seed = [
  {
    id: 1,
    role: "assistant",
    content: "Welcome! connects the UI to a secure backend calling OpenAI.",
    ts: Date.now(),
  },
];

export default function App() {
  const [messages, setMessages] = useState(seed);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendDisabledUntil, setSendDisabledUntil] = useState(0);

  // ✅ cooldown that does NOT trigger re-renders
  const lastSentAtRef = useRef(0);

  const scrollRef = useRef(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text) return;

    // ✅ cooldown guard (900ms)
    const nowTs = Date.now();
    if (nowTs - lastSentAtRef.current < 900) return;
    lastSentAtRef.current = nowTs;

    const now = Date.now();
    const nextMessages = [
      ...messages,
      { id: now, role: "user", content: text, ts: now },
    ];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

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
          model: "gpt-4o-mini",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: data.reply || "(no content)",
          ts: Date.now(),
        },
      ]);
    } catch (e) {
      const msg = `${e.message || "Request failed"}`;
      // If server said 429, pause sending for 2s
      if (
        msg.toLowerCase().includes("429") ||
        msg.toLowerCase().includes("limited")
      ) {
        setSendDisabledUntil(Date.now() + 2000);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: `Error: ${msg}`,
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
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
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-semibold">AI Chatbot UI</h1>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={clearChat}
              className="border rounded px-3 py-1 bg-white"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-4">
        <div
          ref={scrollRef}
          className="h-[65vh] overflow-y-auto space-y-3 p-2 bg-gray-50 rounded-lg border"
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
            className="flex-1 border rounded-lg px-3 py-2 min-h-[48px] max-h-40 bg-white"
            placeholder="Type a message. Press Enter to send. Shift+Enter for a new line."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            onClick={send}
            className="px-4 py-2 border rounded-lg bg-blue-600 text-white disabled:opacity-50"
            disabled={
              loading ||
              input.trim().length === 0 ||
              Date.now() < sendDisabledUntil
            }
          >
            Send
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          Backend proxy is live (non-streaming).
        </p>
      </section>
    </main>
  );
}
