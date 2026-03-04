import { useEffect, useMemo, useState } from "react";
import type {
  AiDeepDive,
  PropertyFacts,
  RentComp,
  RentcastMemoContext,
  SaleComp,
  ScenarioKey,
  ScenarioResult,
  Settings,
  TabsKey,
  UnderwritingInputs,
} from "./types";
import { Tabs } from "./components/Tabs";
import { Banner } from "./components/Banner";
import { Field } from "./components/Field";
import { NumberField } from "./components/NumberField";
import { Loading } from "./components/Loading";
import { ScenarioToggle } from "./components/ScenarioToggle";
import { RentalCompsTable, SalesCompsTable } from "./components/Tables";
import { CashflowChart, DscrChart } from "./components/Charts";
import { SensitivityTable } from "./components/SensitivityTable";

import {
  DEFAULTS,
  DEFAULT_INSURANCE_ANNUAL,
  DEFAULT_PROPERTY_TAX_RATE,
  SCENARIOS,
} from "./config";
import {
  loadSettings,
  saveSettings,
  clearSettings,
  defaultSettings,
} from "./lib/storage";
import { money, num, pct } from "./lib/format";
import {
  fetchPropertyFactsFromRentcast,
  fetchRentEstimateAndComps,
  fetchValueEstimateAndSalesComps,
} from "./lib/rentcast";
import { extractPropertyFromText, runDeepDive } from "./lib/openai";
import {
  computeScenario,
  sensitivityGrid,
  underwritingSummaryText,
} from "./lib/underwriting";
import { exportCsv, exportPdf, exportXlsx } from "./lib/exports";

function defaultInputs(): UnderwritingInputs {
  return {
    purchasePrice: 0,
    downPaymentPct: DEFAULTS.downPaymentPct,
    interestOnly: false,
    interestRate: DEFAULTS.interestRate,
    termYears: DEFAULTS.termYears,
    pointsPct: DEFAULTS.pointsPct,
    closingCosts: DEFAULTS.closingCosts,
    propertyTaxAnnual: 0,
    insuranceAnnual: DEFAULT_INSURANCE_ANNUAL,
    hoaMonthly: DEFAULTS.hoaMonthly,
    vacancyPct: DEFAULTS.vacancyPct,
    managementPct: DEFAULTS.managementPct,
    repairsPct: DEFAULTS.repairsPct,
    capexPct: DEFAULTS.capexPct,
    otherMonthly: DEFAULTS.otherMonthly,
    holdYears: DEFAULTS.holdYears,
    appreciationPct: DEFAULTS.appreciationPct,
    saleCostsPct: DEFAULTS.saleCostsPct,
    rentMonthly: 0,
  };
}

export function App() {
  const [tab, setTab] = useState<TabsKey>("overview");
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [facts, setFacts] = useState<PropertyFacts | null>(null);
  const [rentComps, setRentComps] = useState<RentComp[]>([]);
  const [saleComps, setSaleComps] = useState<SaleComp[]>([]);
  const [inputs, setInputs] = useState<UnderwritingInputs>(defaultInputs());
  const [memoContext, setMemoContext] = useState<RentcastMemoContext>({});

  const [manualUrl, setManualUrl] = useState("");
  const [manualText, setManualText] = useState("");

  const [scenarioView, setScenarioView] = useState<ScenarioKey>("base");
  const [ai, setAi] = useState<AiDeepDive | null>(null);

  useEffect(() => setSettings(loadSettings()), []);

  const results: ScenarioResult[] = useMemo(() => {
    if (!inputs.purchasePrice || !inputs.rentMonthly) return [];
    return (["base", "upside", "downside"] as ScenarioKey[]).map((k) =>
      computeScenario(inputs, k)
    );
  }, [inputs]);

  const selected = results.find((r) => r.scenario === scenarioView) || null;

  const sensitivity = useMemo(() => {
    if (!inputs.purchasePrice || !inputs.rentMonthly) return null;
    return sensitivityGrid(inputs);
  }, [inputs]);

  async function analyze() {
    setError(null);
    setAi(null);
    setBusy("Analyzing");
    try {
      const nextFacts: PropertyFacts = { address };
      const notes: string[] = [];

      // RentCast property facts (optional but recommended)
      if (settings.rentcastApiKey.trim()) {
        const rcFacts = await fetchPropertyFactsFromRentcast(
          address,
          settings.rentcastApiKey.trim()
        );
        if (rcFacts) {
          Object.assign(nextFacts, rcFacts);
          notes.push("Loaded property facts from RentCast.");
        } else {
          notes.push("RentCast property facts not found for address.");
        }
      } else {
        notes.push("RentCast key not set; skipping property facts API.");
      }

      // RentCast rent estimate + comps
      let rentEstimate: number | undefined = undefined;
      const nextMemoContext: RentcastMemoContext = {};
      if (settings.rentcastApiKey.trim()) {
        const rent = await fetchRentEstimateAndComps(
          address,
          settings.rentcastApiKey.trim()
        );
        rentEstimate = rent.rent;
        nextMemoContext.rentEstimate = rent.rent;
        nextMemoContext.rentRangeLow = rent.rentRangeLow;
        nextMemoContext.rentRangeHigh = rent.rentRangeHigh;
        nextMemoContext.subjectProperty = rent.subjectProperty;
        setRentComps(rent.comps);
        notes.push("Loaded rent estimate + rental comps from RentCast.");
        // RentCast value estimate + sales comps
if (settings.rentcastApiKey.trim()) {
  const val = await fetchValueEstimateAndSalesComps(
    address,
    settings.rentcastApiKey.trim()
  );
  nextMemoContext.valueEstimate = val.value;
  nextMemoContext.valueRangeLow = val.valueRangeLow;
  nextMemoContext.valueRangeHigh = val.valueRangeHigh;

  // Seed price if missing
const looksTooLow =
  nextFacts.price && val.value ? nextFacts.price < val.value * 0.6 : false;

if ((!nextFacts.price || looksTooLow) && val.value) {
  nextFacts.price = val.value;
  notes.push("Seeded purchase price from RentCast /avm/value estimate.");
}

  setSaleComps(val.comps);
  notes.push("Loaded sales comps from RentCast /avm/value.");
} else {
  setSaleComps([]);
}
      } else {
        setRentComps([]);
        notes.push("RentCast key not set; skipping rent comps.");
      }

      nextFacts.sourceNotes = [...(nextFacts.sourceNotes || []), ...notes];
      setFacts(nextFacts);
      setMemoContext(nextMemoContext);

      // Seed underwriting inputs from best available
      const price = nextFacts.price ?? 0;
      const inferredTaxAnnual = price > 0 ? price * DEFAULT_PROPERTY_TAX_RATE : 0;

      setInputs((prev) => ({
        ...prev,
        purchasePrice: price || prev.purchasePrice || 0,
        propertyTaxAnnual: prev.propertyTaxAnnual || inferredTaxAnnual,
        rentMonthly: rentEstimate ?? prev.rentMonthly ?? 0,
      }));

      setTab("overview");
    } catch (e: any) {
      setError(e?.message || "Analyze failed.");
    } finally {
      setBusy(null);
    }
  }

  async function tryFetchUrlText(url: string) {
    // This often fails due to CORS; handled in UI.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`URL fetch failed: ${res.status}`);
    const html = await res.text();

    // very naive HTML-to-text
    const txt = html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // attempt to find an og:image
    const ogMatch =
      html.match(
        /property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      ) ||
      html.match(/name=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = ogMatch?.[1];

    return { text: txt.slice(0, 20000), ogImage };
  }

  async function extractFromManual() {
    setError(null);
    setBusy("Extracting listing fields");
    try {
      if (!settings.openaiApiKey.trim())
        throw new Error(
          "OpenAI API key is required for extraction. Set it in Settings."
        );
      if (!address.trim()) throw new Error("Enter an address first.");

      let listingText = manualText.trim();
      let photoUrl: string | undefined = undefined;

      if (!listingText && manualUrl.trim()) {
        try {
          const fetched = await tryFetchUrlText(manualUrl.trim());
          listingText = fetched.text;
          photoUrl = fetched.ogImage;
        } catch (e: any) {
          throw new Error(
            "Could not fetch listing URL (likely CORS). Paste listing text instead.\n\n" +
              (e?.message || "")
          );
        }
      }

      if (!listingText)
        throw new Error("Paste listing text or provide a listing URL that can be fetched.");

      const extracted = await extractPropertyFromText({
        apiKey: settings.openaiApiKey.trim(),
        address,
        listingText,
      });

      // If we got an OG image from HTML fetch, prefer it when model returned none.
      if (photoUrl && !extracted.photoUrl) extracted.photoUrl = photoUrl;

      setFacts((prev) => ({ ...(prev || { address }), ...extracted }));
      setInputs((prev) => ({
        ...prev,
        purchasePrice: extracted.price ?? prev.purchasePrice,
        rentMonthly: prev.rentMonthly,
      }));
      setTab("overview");
    } catch (e: any) {
      setError(e?.message || "Extraction failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deepDive() {
    setError(null);
    setBusy("Running AI Deep Dive");
    try {
      if (!settings.openaiApiKey.trim())
        throw new Error("OpenAI API key is required. Set it in Settings.");
      if (!facts) throw new Error("Run Analyze / Extraction first.");
      if (results.length === 0)
        throw new Error("Fill purchase price and rent so underwriting can run.");

      const base = results.find((r) => r.scenario === "base")!;
      const up = results.find((r) => r.scenario === "upside")!;
      const down = results.find((r) => r.scenario === "downside")!;
      const summary = underwritingSummaryText(base, up, down);

      const resp = await runDeepDive({
        apiKey: settings.openaiApiKey.trim(),
        facts,
        rentComps,
        salesComps: saleComps,
        memoContext,
        rentEstimate: inputs.rentMonthly,
        underwritingSummary: summary,
      });

      setAi(resp);
      setTab("ai");
    } catch (e: any) {
      setError(e?.message || "Deep Dive failed.");
    } finally {
      setBusy(null);
    }
  }

  function saveSettingsUi(next: Settings) {
    setSettings(next);
    saveSettings(next);
  }

  function clearKeys() {
    clearSettings();
    setSettings(loadSettings());
  }

  const reportId = "report-root";

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">UnderwriteAI</div>
          <div className="text-sm text-gray-700">
            Static underwriting tool (GitHub Pages). Keys stored in localStorage.
          </div>
        </div>
        <div className="w-full max-w-xl">
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2"
              placeholder="Enter address (Street, City, State Zip)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <button
              className="px-3 py-2 border rounded bg-black text-white"
              onClick={analyze}
              disabled={!address.trim() || !!busy}
            >
              Analyze
            </button>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Tip: For best results, set a RentCast key in Settings. RentCast
            endpoints used: /properties, /avm/rent/long-term, and /avm/value.
          </div>
        </div>
      </div>

      {busy ? <Loading label={busy} /> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Tabs value={tab} onChange={setTab} />

      <div id={reportId} className="space-y-4">
        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-3">
              <div className="border rounded p-3">
                <div className="text-sm text-gray-600">Address</div>
                <div className="font-medium">
                  {facts?.normalizedAddress || address || "—"}
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-600">Price</div>
                    <div className="font-medium">
                      {money(facts?.price ?? inputs.purchasePrice)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Beds</div>
                    <div className="font-medium">{num(facts?.bedrooms)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Baths</div>
                    <div className="font-medium">
                      {num(facts?.bathrooms, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Sqft</div>
                    <div className="font-medium">
                      {num(facts?.squareFootage)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Year</div>
                    <div className="font-medium">{num(facts?.yearBuilt)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Type</div>
                    <div className="font-medium">
                      {facts?.propertyType || "—"}
                    </div>
                  </div>
                </div>
                {facts?.features?.length ? (
                  <div className="mt-3">
                    <div className="text-sm text-gray-600">Features</div>
                    <div className="text-sm">
                      {facts.features.slice(0, 12).join(", ")}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border rounded p-3 space-y-3">
                <div className="font-medium">Manual Listing Mode (optional)</div>
                <Banner kind="warn">
                  Many listing sites block browser fetching (CORS). If URL fetch
                  fails, paste listing text.
                </Banner>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Listing URL (optional)">
                    <input
                      className="w-full border rounded px-2 py-1"
                      placeholder="https://..."
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                    />
                  </Field>
                  <Field label="Listing Text (paste) (optional)">
                    <textarea
                      className="w-full border rounded px-2 py-1 h-24"
                      placeholder="Paste the listing description + key facts..."
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                    />
                  </Field>
                </div>
                <button
                  className="px-3 py-2 border rounded"
                  onClick={extractFromManual}
                  disabled={!!busy}
                >
                  Extract fields using OpenAI
                </button>
              </div>

              {facts?.sourceNotes?.length ? (
                <div className="border rounded p-3 text-sm">
                  <div className="font-medium">Notes</div>
                  <ul className="list-disc ml-5">
                    {facts.sourceNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="border rounded p-3">
              <div className="font-medium">Photo</div>
              <div className="mt-2">
                {facts?.photoUrl ? (
                  <img
                    src={facts.photoUrl}
                    alt="Property"
                    className="w-full rounded border"
                  />
                ) : (
                  <div className="w-full h-48 border rounded flex items-center justify-center text-sm text-gray-600">
                    No photo available
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-sm text-gray-600">Rent (base)</div>
                <div className="text-xl font-semibold">
                  {money(inputs.rentMonthly)}
                </div>
                <button
                  className="px-3 py-2 border rounded w-full"
                  onClick={() => setTab("underwrite")}
                >
                  Edit underwriting
                </button>
                <button
                  className="px-3 py-2 border rounded w-full bg-black text-white"
                  onClick={deepDive}
                  disabled={!!busy || !settings.openaiApiKey.trim()}
                >
                  Run AI Deep Dive
                </button>
                {!settings.openaiApiKey.trim() ? (
                  <div className="text-xs text-gray-600">
                    Set OpenAI key in Settings to enable AI.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {tab === "underwrite" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded p-3 space-y-3">
              <div className="font-medium">Assumptions</div>

              <NumberField
                label="Purchase price"
                value={inputs.purchasePrice}
                onChange={(v) => setInputs((p) => ({ ...p, purchasePrice: v }))}
                step={1000}
              />
              <NumberField
                label="Rent (monthly, base)"
                value={inputs.rentMonthly}
                onChange={(v) => setInputs((p) => ({ ...p, rentMonthly: v }))}
                step={50}
              />

              <NumberField
                label="Down payment %"
                value={inputs.downPaymentPct}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, downPaymentPct: v }))
                }
                step={0.01}
              />
              <Field label="Loan type">
                <div className="flex gap-2">
                  <button
                    className={
                      "px-3 py-1 border rounded text-sm " +
                      (!inputs.interestOnly ? "bg-black text-white" : "")
                    }
                    onClick={() =>
                      setInputs((p) => ({ ...p, interestOnly: false }))
                    }
                  >
                    Amortizing
                  </button>
                  <button
                    className={
                      "px-3 py-1 border rounded text-sm " +
                      (inputs.interestOnly ? "bg-black text-white" : "")
                    }
                    onClick={() =>
                      setInputs((p) => ({ ...p, interestOnly: true }))
                    }
                  >
                    Interest-only
                  </button>
                </div>
              </Field>

              <NumberField
                label="Interest rate"
                value={inputs.interestRate}
                onChange={(v) => setInputs((p) => ({ ...p, interestRate: v }))}
                step={0.001}
              />
              <NumberField
                label="Term (years)"
                value={inputs.termYears}
                onChange={(v) => setInputs((p) => ({ ...p, termYears: v }))}
                step={1}
              />
              <NumberField
                label="Points %"
                value={inputs.pointsPct}
                onChange={(v) => setInputs((p) => ({ ...p, pointsPct: v }))}
                step={0.001}
              />
              <NumberField
                label="Closing costs"
                value={inputs.closingCosts}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, closingCosts: v }))
                }
                step={500}
              />

              <NumberField
                label="Property tax (annual)"
                value={inputs.propertyTaxAnnual}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, propertyTaxAnnual: v }))
                }
                step={100}
              />
              <NumberField
                label="Insurance (annual)"
                value={inputs.insuranceAnnual}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, insuranceAnnual: v }))
                }
                step={100}
              />
              <NumberField
                label="HOA (monthly)"
                value={inputs.hoaMonthly}
                onChange={(v) => setInputs((p) => ({ ...p, hoaMonthly: v }))}
                step={25}
              />

              <NumberField
                label="Vacancy %"
                value={inputs.vacancyPct}
                onChange={(v) => setInputs((p) => ({ ...p, vacancyPct: v }))}
                step={0.005}
              />
              <NumberField
                label="Management %"
                value={inputs.managementPct}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, managementPct: v }))
                }
                step={0.005}
              />
              <NumberField
                label="Repairs %"
                value={inputs.repairsPct}
                onChange={(v) => setInputs((p) => ({ ...p, repairsPct: v }))}
                step={0.005}
              />
              <NumberField
                label="Capex %"
                value={inputs.capexPct}
                onChange={(v) => setInputs((p) => ({ ...p, capexPct: v }))}
                step={0.005}
              />
              <NumberField
                label="Other (monthly)"
                value={inputs.otherMonthly}
                onChange={(v) => setInputs((p) => ({ ...p, otherMonthly: v }))}
                step={25}
              />

              <div className="pt-2 border-t" />
              <NumberField
                label="Hold period (years)"
                value={inputs.holdYears}
                onChange={(v) => setInputs((p) => ({ ...p, holdYears: v }))}
                step={1}
              />
              <NumberField
                label="Appreciation %"
                value={inputs.appreciationPct}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, appreciationPct: v }))
                }
                step={0.005}
              />
              <NumberField
                label="Sale costs %"
                value={inputs.saleCostsPct}
                onChange={(v) =>
                  setInputs((p) => ({ ...p, saleCostsPct: v }))
                }
                step={0.005}
              />
            </div>

            <div className="md:col-span-2 space-y-4">
              <div className="border rounded p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">Scenario results</div>
                  <ScenarioToggle value={scenarioView} onChange={setScenarioView} />
                </div>

                {!selected ? (
                  <div className="text-sm text-gray-700">
                    Enter purchase price and rent to see results.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-gray-600">Rent</div>
                      <div className="font-medium">{money(selected.rentMonthly)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">NOI (mo)</div>
                      <div className="font-medium">{money(selected.noiMonthly)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Debt svc (mo)</div>
                      <div className="font-medium">{money(selected.debtServiceMonthly)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Cash flow (mo)</div>
                      <div className="font-semibold">{money(selected.cashFlowMonthly)}</div>
                    </div>

                    <div>
                      <div className="text-gray-600">Cap rate</div>
                      <div className="font-medium">{pct(selected.capRate)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Cash-on-cash</div>
                      <div className="font-medium">{pct(selected.cashOnCash)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">DSCR</div>
                      <div className="font-medium">
                        {Number.isFinite(selected.dscr) ? selected.dscr.toFixed(2) : "∞"}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Break-even occ</div>
                      <div className="font-medium">{pct(selected.breakEvenOcc)}</div>
                    </div>

                    <div>
                      <div className="text-gray-600">IRR (annual)</div>
                      <div className="font-medium">{pct(selected.irr)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Equity build</div>
                      <div className="font-medium">{money(selected.equityBuild)}</div>
                    </div>
                  </div>
                )}
              </div>

              {results.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded p-3">
                    <div className="font-medium mb-2">Monthly cash flow</div>
                    <CashflowChart results={results} />
                  </div>
                  <div className="border rounded p-3">
                    <div className="font-medium mb-2">DSCR</div>
                    <DscrChart results={results} />
                  </div>
                </div>
              ) : null}

              {sensitivity ? (
                <div className="border rounded p-3 space-y-2">
                  <div className="font-medium">Sensitivity (Base)</div>
                  <SensitivityTable
                    rentDeltas={sensitivity.rentDeltas}
                    vacancyDeltas={sensitivity.vacancyDeltas}
                    grid={sensitivity.grid}
                  />
                </div>
              ) : null}

              <div className="border rounded p-3">
                <div className="font-medium">Scenario defaults</div>
                <div className="text-sm text-gray-700 mt-1">
                  Base: rent {SCENARIOS.base.rentAdjPct * 100}% | vacancy{" "}
                  {SCENARIOS.base.vacancyAdjPts * 100} pts | expenses{" "}
                  {SCENARIOS.base.expenseAdjPct * 100}%
                  <br />
                  Upside: rent +{SCENARIOS.upside.rentAdjPct * 100}% | vacancy{" "}
                  {SCENARIOS.upside.vacancyAdjPts * 100} pts | expenses{" "}
                  {SCENARIOS.upside.expenseAdjPct * 100}%
                  <br />
                  Downside: rent {SCENARIOS.downside.rentAdjPct * 100}% | vacancy
                  +{SCENARIOS.downside.vacancyAdjPts * 100} pts | expenses +
                  {SCENARIOS.downside.expenseAdjPct * 100}%
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "comps" && (
          <div className="space-y-4">
            <div className="border rounded p-3 space-y-2">
              <div className="font-medium">Rental comps (3)</div>
              <RentalCompsTable comps={rentComps} />
            </div>
            <div className="border rounded p-3 space-y-2">
              <div className="font-medium">Sales comps (manual, up to 3)</div>
              <SalesCompsTable comps={saleComps} onChange={setSaleComps} />
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div className="space-y-4">
            {!settings.openaiApiKey.trim() ? (
              <Banner kind="warn">
                Set your OpenAI key in Settings to enable AI memo.
              </Banner>
            ) : null}

            <div className="flex gap-2">
              <button
                className="px-3 py-2 border rounded bg-black text-white"
                onClick={deepDive}
                disabled={!!busy}
              >
                Run AI Deep Dive
              </button>
              <button
                className="px-3 py-2 border rounded"
                onClick={() => setAi(null)}
                disabled={!!busy}
              >
                Clear memo
              </button>
            </div>

            {ai ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded p-3 space-y-2">
                  <div className="font-medium">Highlights</div>
                  <ul className="list-disc ml-5 text-sm">
                    {ai.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                  <div className="font-medium mt-3">Red flags</div>
                  <ul className="list-disc ml-5 text-sm">
                    {ai.redFlags.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div className="border rounded p-3 space-y-2">
                  <div className="font-medium">Rent rationale</div>
                  <div className="text-sm whitespace-pre-wrap">
                    {ai.rentRationale}
                  </div>
                </div>
                <div className="border rounded p-3 md:col-span-2 space-y-2">
                  <div className="font-medium">Investment memo</div>
                  <div className="text-sm whitespace-pre-wrap">{ai.memo}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-700">No memo yet.</div>
            )}
          </div>
        )}

        {tab === "exports" && (
          <div className="space-y-3">
            <Banner kind="info">
              Exports use whatever is currently on-screen
              (assumptions/results/comps/memo). PDF captures the report container.
            </Banner>

            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-2 border rounded"
                onClick={() => exportPdf(reportId)}
                disabled={!!busy}
              >
                Download PDF
              </button>
              <button
                className="px-3 py-2 border rounded"
                onClick={() => {
                  if (!facts || results.length === 0 || !sensitivity) return;
                  exportXlsx({
                    facts,
                    inputs,
                    results,
                    rentComps,
                    saleComps,
                    sensitivity,
                    memo: ai,
                  });
                }}
                disabled={!facts || results.length === 0 || !sensitivity}
              >
                Download XLSX
              </button>
              <button
                className="px-3 py-2 border rounded"
                onClick={() => {
                  const rows = [
                    { section: "Property", ...(facts || {}) },
                    { section: "Assumptions", ...(inputs || {}) },
                    ...results.map((r) => ({ section: "Result", ...r })),
                  ];
                  exportCsv("underwriteai-summary.csv", rows);
                }}
              >
                Download CSV (summary)
              </button>
              <button
                className="px-3 py-2 border rounded"
                onClick={() => exportCsv("underwriteai-rental-comps.csv", rentComps as any)}
              >
                Download CSV (rental comps)
              </button>
              <button
                className="px-3 py-2 border rounded"
                onClick={() => exportCsv("underwriteai-sales-comps.csv", saleComps as any)}
              >
                Download CSV (sales comps)
              </button>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <Banner kind="warn">
              Keys are stored in this browser only (localStorage). Do not use on
              shared machines. Static GitHub Pages cannot securely store shared
              keys.
            </Banner>

            <div className="border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="OpenAI API Key (required for AI features)">
                <input
                  className="w-full border rounded px-2 py-1"
                  placeholder="sk-..."
                  value={settings.openaiApiKey}
                  onChange={(e) =>
                    saveSettingsUi({ ...settings, openaiApiKey: e.target.value })
                  }
                />
              </Field>

              <Field label="RentCast API Key (recommended)">
                <input
                  className="w-full border rounded px-2 py-1"
                  placeholder="RentCast key"
                  value={settings.rentcastApiKey}
                  onChange={(e) =>
                    saveSettingsUi({ ...settings, rentcastApiKey: e.target.value })
                  }
                />
              </Field>

              <Field
                label="Enable web search (placeholder; off by default)"
                hint="OpenAI key does not browse. Web search requires a separate search API key and additional implementation."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.enableWebSearch}
                    onChange={(e) =>
                      saveSettingsUi({ ...settings, enableWebSearch: e.target.checked })
                    }
                  />
                  <span className="text-sm">Enable</span>
                </div>
              </Field>

              {settings.enableWebSearch ? (
                <Field label="Search API key (Brave/Bing) (not used in MVP)">
                  <input
                    className="w-full border rounded px-2 py-1"
                    placeholder="Search API key"
                    value={settings.searchApiKey}
                    onChange={(e) =>
                      saveSettingsUi({ ...settings, searchApiKey: e.target.value })
                    }
                  />
                </Field>
              ) : null}
            </div>

            <button className="px-3 py-2 border rounded" onClick={clearKeys}>
              Clear stored settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
