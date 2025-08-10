import React from "react";

export default function ChatBubble({ role, children, ts }) {
  const isUser = role === "user";
  return (
    <div
      className={`flex items-start gap-3 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs font-semibold shadow">
          AI
        </div>
      )}
      <div
        className={`bubble max-w-[80%] rounded-2xl px-4 py-3 shadow-sm leading-relaxed
        ${
          isUser
            ? "text-white bg-gradient-to-br from-blue-600 to-indigo-600"
            : "bg-white/80 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur"
        }`}
      >
        <div>{children}</div>
        {ts && (
          <div
            className={`mt-2 text-[10px] ${
              isUser ? "text-blue-100" : "text-gray-500 dark:text-zinc-400"
            }`}
          >
            {new Date(ts).toLocaleTimeString()}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-semibold dark:bg-blue-900/40 dark:text-blue-200">
          You
        </div>
      )}
    </div>
  );
}
