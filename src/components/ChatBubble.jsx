import React from "react";

export default function ChatBubble({ role, children, ts }) {
  const isUser = role === "user";
  return (
    <div
      className={`flex items-start gap-2 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm whitespace-pre-wrap ${
          isUser ? "bg-blue-600 text-white" : "bg-white border"
        }`}
      >
        {children}
        {ts && (
          <div
            className={`mt-1 text-[10px] ${
              isUser ? "text-blue-100" : "text-gray-500"
            }`}
          >
            {new Date(ts).toLocaleTimeString()}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-xs font-semibold">
          You
        </div>
      )}
    </div>
  );
}
