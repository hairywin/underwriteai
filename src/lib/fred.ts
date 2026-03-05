import { httpFetch } from "./http.js";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

async function fetchSeries(seriesId: string, apiKey: string) {
  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "12");

  const res = await httpFetch(url.toString(), {}, "FRED series observations");
  const data = (await res.json()) as { observations?: { value: string; date: string }[] };
  const obs = data.observations ?? [];
  const valid = obs.find((o) => o.value !== ".");
  return valid ? { value: Number(valid.value) / 100, date: valid.date } : null;
}

export async function fetchMarketRates(apiKey: string) {
  const mortgage = await fetchSeries("MORTGAGE30US", apiKey);
  const cpi = await fetchSeries("CPIAUCSL", apiKey);
  return {
    mortgageRate: mortgage?.value,
    mortgageDate: mortgage?.date,
    inflationRef: cpi?.value,
    inflationDate: cpi?.date,
  };
}
