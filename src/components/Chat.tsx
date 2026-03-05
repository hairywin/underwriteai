import type { ChatMessage } from "../types";

export function Chat({
  messages,
  value,
  onChange,
  onSend,
  onShortcut,
  busy,
}: {
  messages: ChatMessage[];
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onShortcut: (q: string) => void;
  busy: boolean;
}) {
  const shortcuts = [
    "What if rent drops 10%?",
    "What if vacancy rises to 12%?",
    "What if rate is 7.5%?",
    "What if capex is 10%?",
  ];
  return (
    <div className="border rounded p-3 space-y-3">
      <div className="font-semibold">Ask AI</div>
      <div className="flex flex-wrap gap-2">
        {shortcuts.map((s) => (
          <button key={s} className="text-xs px-2 py-1 border rounded" onClick={() => onShortcut(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="h-72 overflow-y-auto border rounded p-2 space-y-2 bg-slate-50">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "assistant" ? "text-slate-700" : "font-medium"}>
            <span className="text-xs uppercase mr-2">{m.role}</span>
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 border rounded px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ask about risk, comps, assumptions..." />
        <button className="px-3 py-2 bg-black text-white rounded disabled:opacity-50" onClick={onSend} disabled={busy || !value.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
