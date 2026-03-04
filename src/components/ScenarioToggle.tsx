import type { ScenarioKey } from "../types";
import { SCENARIOS } from "../config";

export function ScenarioToggle(props: { value: ScenarioKey; onChange: (k: ScenarioKey) => void }) {
  const keys: ScenarioKey[] = ["base", "upside", "downside"];
  return (
    <div className="flex gap-2">
      {keys.map((k) => (
        <button
          key={k}
          onClick={() => props.onChange(k)}
          className={"px-3 py-1 rounded border text-sm " + (props.value === k ? "bg-black text-white" : "bg-white")}
        >
          {SCENARIOS[k].label}
        </button>
      ))}
    </div>
  );
}
