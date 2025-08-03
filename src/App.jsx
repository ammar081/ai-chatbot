import React, { useEffect, useRef, useState } from "react";
import ChatBubble from "./components/ChatBubble.jsx";
import TypingBubble from "./components/TypingBubble.jsx";

const seed = [
  {
    id: 1,
    role: "assistant",
    content:
      "Welcome! focuses on UI polish: bubbles, auto-scroll, Enter-to-send, and loading.",
    ts: Date.now(),
  },
];

export default function App() {
  const [messages, setMessages] = useState(seed);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on updates
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function send() {
    const text = input.trim();
    if (!text) return;
    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: now, role: "user", content: text, ts: now },
    ]);
    setInput("");
    setLoading(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: "Thanks! This is a simulated response.",
          ts: Date.now(),
        },
      ]);
      setLoading(false);
    }, 1000);
  }

  function onKeyDown(e) {
    // Enter to send, Shift+Enter for newline
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
            disabled={loading || input.trim().length === 0}
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2"></p>
      </section>
    </main>
  );
}
