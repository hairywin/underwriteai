import { money } from "../lib/format";

export function SensitivityTable(props: {
  rentDeltas: number[];
  vacancyDeltas: number[];
  grid: { cashFlowMonthly: number; dscr: number }[][];
}) {
  return (
    <div className="overflow-auto border rounded">
      <table className="text-sm w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 border text-left">Rent Δ \\ Vacancy Δ</th>
            {props.vacancyDeltas.map((v) => (
              <th key={v} className="p-2 border text-right">
                {(v * 100).toFixed(0)} pts
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rentDeltas.map((r, i) => (
            <tr key={r}>
              <td className="p-2 border">{(r * 100).toFixed(0)}%</td>
              {props.vacancyDeltas.map((_, j) => (
                <td key={j} className="p-2 border text-right">
                  {money(props.grid[i][j].cashFlowMonthly)}
                  <div className="text-xs text-gray-600">DSCR {Number.isFinite(props.grid[i][j].dscr) ? props.grid[i][j].dscr.toFixed(2) : "∞"}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
