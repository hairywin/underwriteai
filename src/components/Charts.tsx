import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HoldSeriesPoint, ScenarioResult, SensitivityGrid } from "../types";

export function ScenarioCharts({ results }: { results: ScenarioResult[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <ChartCard title="Monthly Cash Flow"><BarViz data={results.map((r) => ({ name: r.scenario, value: r.cashFlowMonthly }))} /></ChartCard>
      <ChartCard title="DSCR"><BarViz data={results.map((r) => ({ name: r.scenario, value: r.dscr }))} /></ChartCard>
      <ChartCard title="Cap Rate vs CoC">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={results.map((r) => ({ name: r.scenario, capRate: r.capRate * 100, coc: r.cashOnCash * 100 }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
            <Bar dataKey="capRate" fill="#334155" />
            <Bar dataKey="coc" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function BarViz({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value">{data.map((d) => <Cell key={d.name} fill={d.value < 0 ? "#dc2626" : "#2563eb"} />)}</Bar></BarChart>
    </ResponsiveContainer>
  );
}

export function HoldPeriodCharts({ data }: { data: HoldSeriesPoint[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ChartCard title="Projected Property Value + Cumulative Cash Flow">
        <ResponsiveContainer width="100%" height={240}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip /><Line dataKey="propertyValue" stroke="#1d4ed8" /><Line dataKey="cumulativeCashFlow" stroke="#16a34a" /></LineChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Loan Balance + Equity">
        <ResponsiveContainer width="100%" height={240}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip /><Line dataKey="loanBalance" stroke="#dc2626" /><Line dataKey="equity" stroke="#7c3aed" /></LineChart></ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

export function SensitivityHeatmap({ grid, onPick }: { grid: SensitivityGrid; onPick: (i: number, j: number) => void }) {
  return (
    <div className="overflow-auto border rounded">
      <table className="min-w-full text-xs">
        <thead><tr><th className="p-2">Rent / Vacancy</th>{grid.vacancyDeltas.map((v) => <th key={v} className="p-2">{(v * 100).toFixed(0)}%</th>)}</tr></thead>
        <tbody>
          {grid.rentDeltas.map((r, i) => (
            <tr key={r}><td className="p-2 font-semibold">{(r * 100).toFixed(0)}%</td>{grid.cells[i].map((cell, j) => (<td key={j} className={`p-2 cursor-pointer ${cell.cashFlowMonthly > 0 ? "bg-green-100" : "bg-red-100"}`} onClick={() => onPick(i, j)}>${Math.round(cell.cashFlowMonthly)}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="border rounded p-3"><div className="font-medium mb-2">{title}</div>{children}</div>;
}
