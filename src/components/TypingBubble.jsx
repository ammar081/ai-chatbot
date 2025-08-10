import React from "react";

export default function TypingBubble() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-semibold shadow">
        AI
      </div>
      <div className="rounded-2xl px-4 py-3 bg-white/80 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-zinc-500 animate-typing [animation-delay:0ms]"></span>
          <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-zinc-500 animate-typing [animation-delay:200ms]"></span>
          <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-zinc-500 animate-typing [animation-delay:400ms]"></span>
        </div>
      </div>
    </div>
  );
}
