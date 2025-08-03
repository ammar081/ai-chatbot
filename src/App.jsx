import React, { useEffect, useRef, useState } from "react";

const initialMessages = [
  { role: "assistant", content: "Hi! I am a placeholder chatbot." },
];

export default function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    // Simulate assistant typing while we don't have a backend yet (Day 1/2)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "This is a dummy reply." },
      ]);
      setLoading(false);
    }, 800);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-semibold">AI Chatbot UI — Day 1</h1>
          <span className="text-xs text-gray-500">Vite • React • Tailwind</span>
        </div>
      </header>

      <section className="flex-1 max-w-3xl mx-auto w-full px-4 py-4">
        <div className="h-[65vh] overflow-y-auto space-y-3 p-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap ${
                m.role === "user" ? "bg-blue-100 ml-auto" : "bg-white border"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                {m.role}
              </div>
              <div>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="max-w-[85%] rounded-lg px-3 py-2 bg-white border">
              <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                assistant
              </div>
              <div className="animate-pulse text-gray-500">typing…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="mt-3 flex gap-2">
          <textarea
            className="flex-1 border rounded-lg px-3 py-2 min-h-[48px] max-h-40"
            placeholder="Type a message and press Enter…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={send}
            className="px-4 py-2 border rounded-lg bg-white disabled:opacity-50"
            disabled={loading || input.trim().length === 0}
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Day 1/2: UI only.</p>
      </section>
    </main>
  );
}
