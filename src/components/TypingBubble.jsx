import React from "react";

export default function TypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold">
        AI
      </div>
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-white border shadow-sm">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-typing [animation-delay:0ms]"></span>
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-typing [animation-delay:200ms]"></span>
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-typing [animation-delay:400ms]"></span>
        </div>
      </div>
    </div>
  );
}
