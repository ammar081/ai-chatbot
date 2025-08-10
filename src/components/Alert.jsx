import React from "react";

export default function Alert({ kind = "error", children, onClose }) {
  const styles = {
    error:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    success:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  }[kind];

  return (
    <div
      className={`flex items-start gap-3 border rounded-lg px-3 py-2 ${styles}`}
    >
      <div className="text-sm flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-xs opacity-70 hover:opacity-100 underline"
        >
          close
        </button>
      )}
    </div>
  );
}
