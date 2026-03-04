import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import type { ScenarioResult } from "../types";

export function CashflowChart(props: { results: ScenarioResult[] }) {
  const data = props.results.map((r) => ({
    name: r.scenario,
    cashFlowMonthly: Math.round(r.cashFlowMonthly),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="cashFlowMonthly" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DscrChart(props: { results: ScenarioResult[] }) {
  const data = props.results.map((r) => ({
    name: r.scenario,
    dscr: Number.isFinite(r.dscr) ? Number(r.dscr.toFixed(2)) : 99,
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="dscr" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BalanceChart(props: { balances: { month: number; balance: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <LineChart data={props.balances}>
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="balance" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
