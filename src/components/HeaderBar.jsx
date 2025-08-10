import React from "react";

export default function HeaderBar({ onToggleDark, dark }) {
  return (
    <header className="sticky top-0 z-20">
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-fuchsia-600">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-white font-semibold text-lg drop-shadow">
            <span className="opacity-90">AI Chatbot UI</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDark}
              className="px-3 py-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition"
              title="Toggle theme"
            >
              {dark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
