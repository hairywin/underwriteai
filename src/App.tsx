import { useEffect, useMemo, useState } from "react";
import { Chat } from "./components/Chat";
import { HoldPeriodCharts, ScenarioCharts, SensitivityHeatmap } from "./components/Charts";
import { Scorecard } from "./components/Scorecard";
import { Tooltip } from "./components/Tooltip";
import { DEFAULTS } from "./config";
import { exportCsv, exportPdf, exportXlsx } from "./lib/exports";
import { formatCurrency, formatPercent } from "./lib/format";
import { runDealChat, runDeepDive } from "./lib/openai";
import { runUnderwritingPipeline } from "./lib/pipeline";
import { clearSettings, defaultSettings, loadSettings, saveSettings } from "./lib/storage";
import { buildHoldSeries, buildSensitivity, computeScenario, dealRiskScore, maxLoanFromDscr, maxOfferFromCoc } from "./lib/underwriting";
import type { AiDeepDive, ChatMessage, DealContext, PropertyFacts, RentComp, SaleComp, ScenarioKey, Settings, StepKey, UnderwritingInputs } from "./types";

const money = formatCurrency;
const pct = formatPercent;

const STEPS: StepKey[] = ["deal", "underwrite", "comps", "scenarios", "memo", "exports", "settings"];

function defaultInputs(): UnderwritingInputs {
  return {
    propertyType: "single_family",
    units: 1,
    useUnitMix: false,
    unitMix: [
      { type: "Studio", count: 0, avgRent: 0 },
      { type: "1BR", count: 1, avgRent: 0 },
      { type: "2BR", count: 0, avgRent: 0 },
      { type: "3BR+", count: 0, avgRent: 0 },
    ],
    rentMonthly: 0,
    otherIncomeMonthly: 0,
    purchasePrice: 0,
    downPaymentPct: DEFAULTS.downPaymentPct,
    interestOnly: false,
    interestRate: DEFAULTS.interestRate,
    termYears: DEFAULTS.termYears,
    pointsPct: DEFAULTS.pointsPct,
    closingCosts: DEFAULTS.closingCosts,
    propertyTaxAnnual: 0,
    insuranceAnnual: 1800,
    hoaMonthly: 0,
    vacancyPct: DEFAULTS.vacancyPct,
    managementPct: DEFAULTS.managementPct,
    repairsPct: DEFAULTS.repairsPct,
    capexPct: DEFAULTS.capexPct,
    reservePct: DEFAULTS.reservePct,
    includeCapex: true,
    includeManagement: true,
    includeReserves: true,
    expenseRatioPct: DEFAULTS.expenseRatioPct,
    useExpenseRatio: false,
    otherMonthly: 0,
    holdYears: DEFAULTS.holdYears,
    appreciationPct: DEFAULTS.appreciationPct,
    saleCostsPct: DEFAULTS.saleCostsPct,
    exitCapRate: DEFAULTS.exitCapRate,
    targetDscr: DEFAULTS.targetDscr,
    targetCoc: DEFAULTS.targetCoc,
    targetCashFlowMonthly: DEFAULTS.targetCashFlowMonthly,
  };
}

export function App() {
  const [step, setStep] = useState<StepKey>("deal");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [address, setAddress] = useState("");
  const [facts, setFacts] = useState<PropertyFacts | null>(null);
  const [rentComps, setRentComps] = useState<RentComp[]>([]);
  const [saleComps, setSaleComps] = useState<SaleComp[]>([]);
  const [inputs, setInputs] = useState<UnderwritingInputs>(defaultInputs());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [valuationWarnings, setValuationWarnings] = useState<string[]>([]);
  const [valuationStatus, setValuationStatus] = useState<"ok" | "unavailable" | null>(null);
  const [marketRate, setMarketRate] = useState<number>();
  const [inflationRate, setInflationRate] = useState<number>();
  const [memo, setMemo] = useState<AiDeepDive | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [pickedSensitivity, setPickedSensitivity] = useState<{ i: number; j: number } | null>(null);

  useEffect(() => setSettings(loadSettings()), []);

  const results = useMemo(() => (["base", "upside", "downside"] as ScenarioKey[]).map((s) => computeScenario(inputs, s)), [inputs]);
  const base = results[0];
  const holdSeries = useMemo(() => buildHoldSeries(inputs), [inputs]);
  const sensitivity = useMemo(() => buildSensitivity(inputs), [inputs]);
  const risk = dealRiskScore(base, marketRate);

  const context: DealContext = { facts, rentComps, saleComps, assumptions: inputs, scenarios: results, marketRate, inflationRate };

  async function analyzeDeal() {
    setBusy("Running underwriting pipeline (geocode → data sources)...");
    setError("");
    setValuationWarnings([]);
    setValuationStatus(null);
    try {
      if (!address.trim()) throw new Error("Address is required.");
      const result = await runUnderwritingPipeline(address, settings, inputs);
      setFacts({ address, normalizedAddress: result.subject.normalizedAddress });
      setValuationWarnings([...result.valuation.warnings, ...result.neighborhood.warnings, ...result.errors]);
      setValuationStatus(result.valuation.confidence === "low" ? "unavailable" : "ok");
      if (result.macro.mortgageRate) setMarketRate(result.macro.mortgageRate);
      if (result.macro.inflationRef) setInflationRate(result.macro.inflationRef);
      setInputs((prev) => ({
        ...prev,
        purchasePrice: prev.purchasePrice || result.valuation.value || 0,
        rentMonthly: prev.rentMonthly || result.rent.rentEstimate || 0,
      }));
      setRentComps([]);
      setSaleComps([]);
      setStep("underwrite");
    } catch (e: any) {
      setError(e.message || "Analyze failed.");
    } finally {
      setBusy("");
    }
  }

  async function generateMemo() {
    setBusy("Generating memo...");
    setError("");
    try {
      if (!settings.openaiApiKey.trim()) throw new Error("OpenAI key required in Settings.");
      const out = await runDeepDive({ apiKey: settings.openaiApiKey.trim(), model: settings.defaultModel, context });
      setMemo(out);
    } catch (e: any) {
      setError(e.message || "Memo failed.");
    } finally {
      setBusy("");
    }
  }

  async function askAI(question: string) {
    setBusy("Thinking...");
    setError("");
    try {
      const user: ChatMessage = { role: "user", text: question };
      const next = [...messages, user];
      setMessages(next);
      const answer = await runDealChat({ apiKey: settings.openaiApiKey, model: settings.defaultModel, context, messages: next, question });
      setMessages([...next, { role: "assistant", text: answer }]);
    } catch (e: any) {
      setError(e.message || "Chat failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">UnderwriteAI</h1>
      <Scorecard result={base} price={inputs.purchasePrice} rent={inputs.rentMonthly} />

      <div className="flex flex-wrap gap-2">{STEPS.map((s) => <button key={s} onClick={() => setStep(s)} className={`px-3 py-2 rounded border ${step === s ? "bg-black text-white" : "bg-white"}`}>{s.replace("_", " ")}</button>)}</div>

      {busy && <div className="text-sm bg-blue-50 p-2 rounded">{busy}</div>}
      {error && <div className="text-sm bg-red-50 text-red-700 p-2 rounded">{error}</div>}
      {!error && valuationWarnings.length > 0 && (
        <div className={`text-sm p-2 rounded ${valuationStatus === "unavailable" ? "bg-amber-50 text-amber-900" : "bg-yellow-50 text-yellow-900"}`}>
          {valuationWarnings[valuationWarnings.length - 1]}
        </div>
      )}

      <div id="report-root" className="space-y-4">
        {step === "deal" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
            <div className="space-y-3">
              <label className="block text-sm">Address<input className="mt-1 w-full border rounded px-2 py-1" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
              <label className="block text-sm">Property Type<select className="mt-1 w-full border rounded px-2 py-1" value={inputs.propertyType} onChange={(e) => setInputs({ ...inputs, propertyType: e.target.value as any, units: e.target.value === "multifamily" ? Math.max(2, inputs.units) : 1 })}><option value="single_family">Single-family</option><option value="multifamily">Multifamily</option></select></label>
              {inputs.propertyType === "multifamily" && (
                <>
                  <label className="block text-sm">Units<input type="number" className="mt-1 w-full border rounded px-2 py-1" value={inputs.units} onChange={(e) => setInputs({ ...inputs, units: Number(e.target.value) })} /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inputs.useUnitMix} onChange={(e) => setInputs({ ...inputs, useUnitMix: e.target.checked })} />Use unit mix table</label>
                  {inputs.useUnitMix && inputs.unitMix.map((u, idx) => (
                    <div key={u.type} className="grid grid-cols-3 gap-2 text-sm"><div>{u.type}</div><input type="number" className="border rounded px-2 py-1" value={u.count} onChange={(e) => setInputs({ ...inputs, unitMix: inputs.unitMix.map((x, i) => (i === idx ? { ...x, count: Number(e.target.value) } : x)) })} /><input type="number" className="border rounded px-2 py-1" value={u.avgRent} onChange={(e) => setInputs({ ...inputs, unitMix: inputs.unitMix.map((x, i) => (i === idx ? { ...x, avgRent: Number(e.target.value) } : x)) })} /></div>
                  ))}
                </>
              )}
              <button className="px-3 py-2 bg-black text-white rounded" onClick={analyzeDeal}>Fetch RentCast data</button>
            </div>
            <div>
              <div className="font-semibold mb-2">Market data (FRED)</div>
                            <div className="mt-2 text-sm">Mortgage reference: {pct(marketRate)}</div>
              <div className="text-sm">CPI reference: {pct(inflationRate)}</div>
              <div className="text-xs text-slate-500 mt-2">OpenAI cannot browse the internet. It only uses RentCast/FRED/user inputs loaded here.</div>
            </div>
          </div>
        )}

        {step === "underwrite" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border rounded p-4">
            {[
              ["Purchase Price", "purchasePrice"],
              ["Rent Monthly", "rentMonthly"],
              ["Other Income", "otherIncomeMonthly"],
              ["Vacancy %", "vacancyPct"],
              ["Interest Rate", "interestRate"],
              ["Down Payment %", "downPaymentPct"],
              ["Tax Annual", "propertyTaxAnnual"],
              ["Insurance Annual", "insuranceAnnual"],
              ["Expense Ratio %", "expenseRatioPct"],
            ].map(([label, key]) => <label key={key} className="text-sm">{label}<input type="number" className="mt-1 w-full border rounded px-2 py-1" value={(inputs as any)[key]} onChange={(e) => setInputs({ ...inputs, [key]: Number(e.target.value) })} /></label>)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inputs.interestOnly} onChange={(e) => setInputs({ ...inputs, interestOnly: e.target.checked })} />Interest-only loan</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inputs.useExpenseRatio} onChange={(e) => setInputs({ ...inputs, useExpenseRatio: e.target.checked })} />Use expense ratio mode</label>
            <div className="col-span-full text-sm bg-slate-50 p-2 rounded">Risk meter: <b>{risk}/100</b> (higher is riskier)</div>
            <div className="col-span-full text-sm">Loan helper: Max Loan by DSCR target = {money(maxLoanFromDscr(inputs))} | Max Offer by CoC target = {money(maxOfferFromCoc(inputs))}</div>
            <div className="col-span-full text-xs"><Tooltip label="DSCR" detail={<><div>Definition: NOI / Debt Service.</div><div>Interpretation: &gt;1.25 is generally safer.</div></>} /> | <Tooltip label="Cap Rate" detail={<><div>Definition: Annual NOI / Price.</div><div>Interpretation: Higher can mean better yield but can reflect risk.</div></>} /> | <Tooltip label="CoC" detail={<><div>Definition: Annual cash flow / cash invested.</div></>} /></div>
          </div>
        )}

        {step === "comps" && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><CompTable title="Rental comps" rows={rentComps} priceKey="rent" /><CompTable title="Sales comps" rows={saleComps} priceKey="price" /></div>}

        {step === "scenarios" && (
          <div className="space-y-4">
            <ScenarioCharts results={results} />
            <HoldPeriodCharts data={holdSeries} />
            <SensitivityHeatmap grid={sensitivity} onPick={(i, j) => setPickedSensitivity({ i, j })} />
            {pickedSensitivity && <div className="text-sm">Selected cell: rent delta {(sensitivity.rentDeltas[pickedSensitivity.i] * 100).toFixed(0)}%, vacancy delta {(sensitivity.vacancyDeltas[pickedSensitivity.j] * 100).toFixed(0)}%, DSCR {sensitivity.cells[pickedSensitivity.i][pickedSensitivity.j].dscr.toFixed(2)}</div>}
          </div>
        )}

        {step === "memo" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded p-3 space-y-2"><button className="px-3 py-2 bg-black text-white rounded" onClick={generateMemo}>AI Deep Dive</button>{memo && <><div className="font-semibold">Highlights</div><ul className="list-disc ml-5 text-sm">{memo.highlights.map((h) => <li key={h}>{h}</li>)}</ul><div className="font-semibold">Risks</div><ul className="list-disc ml-5 text-sm">{memo.risks.map((h) => <li key={h}>{h}</li>)}</ul><div className="text-sm whitespace-pre-wrap">{memo.memo}</div></>}</div>
            <Chat messages={messages} value={chatInput} onChange={setChatInput} onSend={() => { askAI(chatInput); setChatInput(""); }} onShortcut={(q) => askAI(q)} busy={!!busy} />
          </div>
        )}

        {step === "exports" && (
          <div className="border rounded p-4 space-x-2">
            <button className="px-3 py-2 border rounded" onClick={() => exportPdf("report-root")}>Export PDF</button>
            <button className="px-3 py-2 border rounded" onClick={() => exportXlsx({ inputs, facts, results, rentComps, saleComps, sensitivity, loanSchedule: holdSeries.map((h) => ({ year: h.year, loanBalance: h.loanBalance, equity: h.equity })), memo })}>Export XLSX</button>
            <button className="px-3 py-2 border rounded" onClick={() => exportCsv("underwrite.csv", [{ ...inputs, address: facts?.normalizedAddress || address }, ...results])}>Export CSV</button>
          </div>
        )}

        {step === "settings" && (
          <div className="border rounded p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <SettingInput label="OpenAI API key" value={settings.openaiApiKey} onChange={(v) => setSettings({ ...settings, openaiApiKey: v })} />
            <SettingInput label="RentCast API key" value={settings.rentcastApiKey} onChange={(v) => setSettings({ ...settings, rentcastApiKey: v })} />
            <SettingInput label="FRED API key" value={settings.fredApiKey} onChange={(v) => setSettings({ ...settings, fredApiKey: v })} />
            <SettingInput label="Census Data API key" value={settings.censusApiKey} onChange={(v) => setSettings({ ...settings, censusApiKey: v })} />
            <SettingInput label="Default model" value={settings.defaultModel} onChange={(v) => setSettings({ ...settings, defaultModel: v })} />
            <div className="col-span-full text-xs text-slate-600">Keys are stored in browser localStorage only.</div>
            <div className="col-span-full flex gap-2"><button className="px-3 py-2 bg-black text-white rounded" onClick={() => saveSettings(settings)}>Save settings</button><button className="px-3 py-2 border rounded" onClick={() => { clearSettings(); setSettings(loadSettings()); }}>Clear keys</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="text-sm">{label}<input type="password" className="mt-1 w-full border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function CompTable({ title, rows, priceKey }: { title: string; rows: any[]; priceKey: "rent" | "price" }) {
  return (
    <div className="border rounded p-3 overflow-auto">
      <div className="font-semibold mb-2">{title}</div>
      <table className="min-w-full text-xs"><thead><tr><th className="text-left">Address</th><th>{priceKey}</th><th>beds</th><th>baths</th><th>sqft</th><th>url</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td>{r.address}</td><td>{money(r[priceKey])}</td><td>{r.bedrooms ?? "—"}</td><td>{r.bathrooms ?? "—"}</td><td>{r.squareFootage ?? "—"}</td><td>{r.url ? <a className="text-blue-600" href={r.url} target="_blank">link</a> : "—"}</td></tr>)}</tbody></table>
      {!rows.length && <div className="text-xs text-amber-700 mt-2">No comps returned; for multifamily, provide manual assumptions and unit rents.</div>}
    </div>
  );
}
