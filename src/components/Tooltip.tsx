import { ReactNode } from "react";

type Props = { label: string; detail: ReactNode };

export function Tooltip({ label, detail }: Props) {
  return (
    <span className="group relative inline-flex items-center gap-1 cursor-help">
      {label}
      <span className="text-xs text-blue-600 border border-blue-500 rounded-full w-4 h-4 inline-flex items-center justify-center">i</span>
      <span className="hidden group-hover:block absolute z-20 top-full left-0 mt-1 w-72 bg-slate-900 text-white text-xs p-2 rounded shadow-lg">
        {detail}
      </span>
    </span>
  );
}
