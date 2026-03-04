import type { TabsKey } from "../types";

export function Tabs(props: {
  value: TabsKey;
  onChange: (t: TabsKey) => void;
}) {
  const items: { key: TabsKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "underwrite", label: "Underwrite" },
    { key: "comps", label: "Comps" },
    { key: "ai", label: "AI Memo" },
    { key: "exports", label: "Exports" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b pb-2">
      {items.map((i) => (
        <button
          key={i.key}
          onClick={() => props.onChange(i.key)}
          className={
            "px-3 py-1 rounded text-sm border " +
            (props.value === i.key ? "bg-black text-white" : "bg-white")
          }
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
