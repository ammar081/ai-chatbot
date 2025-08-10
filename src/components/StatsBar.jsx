import React from "react";

export default function StatsBar({
  lastPromptTokens = 0,
  lastCompletionTokens = 0,
  totalPromptTokens = 0,
  totalCompletionTokens = 0,
  lastLatencyMs = 0,
}) {
  const Item = ({ label, value }) => (
    <div
      className="text-[11px] px-2 py-1 rounded
  bg-gray-100 border border-gray-200
  dark:bg-zinc-900 dark:border-zinc-800"
    >
      <span className="opacity-60">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
  return (
    <div className="glass mt-2 flex flex-wrap items-center gap-2">
      <Item label="Prompt tok (last)" value={lastPromptTokens} />
      <Item label="Completion tok (last)" value={lastCompletionTokens} />
      <Item label="Latency" value={`${Math.round(lastLatencyMs)} ms`} />
      <Item label="Prompt tok (total)" value={totalPromptTokens} />
      <Item label="Completion tok (total)" value={totalCompletionTokens} />
    </div>
  );
}
