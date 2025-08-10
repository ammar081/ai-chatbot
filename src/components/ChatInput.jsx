import React from "react";

export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabledSend,
  canStop,
}) {
  return (
    <div className="glass rounded-2xl mt-4 p-2">
      <div className="flex items-end gap-2">
        <textarea
          className="flex-1 rounded-xl px-4 py-3 min-h-[56px] max-h-48
                     bg-transparent text-gray-900 placeholder-gray-500
                     focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
          placeholder="Type your message…  Press Enter to send, Shift+Enter for newline"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button
          onClick={onSend}
          disabled={disabledSend}
          className="rounded-xl px-4 py-3 bg-blue-600 text-white font-medium shadow hover:drop-shadow-glow
                     disabled:opacity-50 disabled:hover:drop-shadow-none transition"
          title="Send"
        >
          <span className="inline-block align-middle">Send</span>
        </button>
        <button
          onClick={onStop}
          disabled={!canStop}
          className="rounded-xl px-4 py-3 bg-white/60 dark:bg-white/10 border border-white/50 dark:border-white/10
                     text-gray-800 dark:text-zinc-200 hover:bg-white/80 disabled:opacity-50 transition"
          title="Stop"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
