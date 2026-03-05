import { localCache, stableHash } from "./cache.js";
import type { GeocodeResult } from "./geocode.js";
import { httpFetch } from "./http.js";

const BASE = "https://api.census.gov/data";
const DEFAULT_YEAR = "2022";
const DATASET = "acs/acs5";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const VARIABLES = {
  medianHouseholdIncome: "B19013_001E",
  medianGrossRent: "B25064_001E",
  totalHousingUnits: "B25001_001E",
  vacantHousingUnits: "B25002_003E",
  totalOccupied: "B25003_001E",
  ownerOccupied: "B25003_002E",
  renterOccupied: "B25003_003E",
  population: "B01003_001E",
} as const;

export type NeighborhoodProfile = {
  geographyLevel: "tract" | "county" | "unavailable";
  year: string;
  medianHouseholdIncome?: number;
  medianGrossRent?: number;
  vacancyRate?: number;
  ownerOccupiedShare?: number;
  renterOccupiedShare?: number;
  population?: number;
  warnings: string[];
};

function envCensusApiKey() {
  const viteEnv = (import.meta as any)?.env ?? {};
  return viteEnv.CENSUS_API_KEY || viteEnv.VITE_CENSUS_API_KEY || "";
}

function toNum(value: string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function fetchAcs(params: URLSearchParams) {
  const url = `${BASE}/${DEFAULT_YEAR}/${DATASET}?${params.toString()}`;
  const res = await httpFetch(url, {}, "US Census ACS");
  return (await res.json()) as string[][];
}

function parseProfile(row: Record<string, string>, level: "tract" | "county"): NeighborhoodProfile {
  const totalUnits = toNum(row[VARIABLES.totalHousingUnits]);
  const vacantUnits = toNum(row[VARIABLES.vacantHousingUnits]);
  const totalOccupied = toNum(row[VARIABLES.totalOccupied]);
  const ownerOccupied = toNum(row[VARIABLES.ownerOccupied]);
  const renterOccupied = toNum(row[VARIABLES.renterOccupied]);
  return {
    geographyLevel: level,
    year: DEFAULT_YEAR,
    medianHouseholdIncome: toNum(row[VARIABLES.medianHouseholdIncome]),
    medianGrossRent: toNum(row[VARIABLES.medianGrossRent]),
    vacancyRate: totalUnits && vacantUnits != null ? vacantUnits / totalUnits : undefined,
    ownerOccupiedShare: totalOccupied && ownerOccupied != null ? ownerOccupied / totalOccupied : undefined,
    renterOccupiedShare: totalOccupied && renterOccupied != null ? renterOccupied / totalOccupied : undefined,
    population: toNum(row[VARIABLES.population]),
    warnings: [],
  };
}

function rowsToObject(data: string[][]) {
  const [header, values] = data;
  return Object.fromEntries(header.map((key, idx) => [key, values[idx] ?? ""]));
}

export async function fetchNeighborhoodProfile(geo: GeocodeResult, apiKey = envCensusApiKey()): Promise<NeighborhoodProfile> {
  if (!apiKey) {
    return { geographyLevel: "unavailable", year: DEFAULT_YEAR, warnings: ["CENSUS_API_KEY missing; neighborhood profile unavailable."] };
  }

  const vars = Object.values(VARIABLES).join(",");
  const tractGeoId = geo.stateFips && geo.countyFips && geo.tract ? `${geo.stateFips}${geo.countyFips}${geo.tract}` : "";
  const tractKey = `uw:census:${stableHash(`${DEFAULT_YEAR}:${tractGeoId}`)}`;
  const countyGeoId = geo.stateFips && geo.countyFips ? `${geo.stateFips}${geo.countyFips}` : "";
  const countyKey = `uw:census:${stableHash(`${DEFAULT_YEAR}:${countyGeoId}:county`)}`;

  if (tractGeoId) {
    const cached = localCache.get<NeighborhoodProfile>(tractKey);
    if (cached) return cached;

    const tractParams = new URLSearchParams({ get: vars, for: `tract:${geo.tract!}`, in: `state:${geo.stateFips!} county:${geo.countyFips!}`, key: apiKey });
    try {
      const data = await fetchAcs(tractParams);
      const profile = parseProfile(rowsToObject(data), "tract");
      localCache.set(tractKey, profile, THIRTY_DAYS_MS);
      return profile;
    } catch {
      // fallback to county below
    }
  }

  if (countyGeoId) {
    const cached = localCache.get<NeighborhoodProfile>(countyKey);
    if (cached) return cached;
    const countyParams = new URLSearchParams({ get: vars, for: `county:${geo.countyFips!}`, in: `state:${geo.stateFips!}`, key: apiKey });
    const data = await fetchAcs(countyParams);
    const profile = parseProfile(rowsToObject(data), "county");
    profile.warnings.push("Tract data unavailable; used county-level ACS profile.");
    localCache.set(countyKey, profile, THIRTY_DAYS_MS);
    return profile;
  }

  return { geographyLevel: "unavailable", year: DEFAULT_YEAR, warnings: ["FIPS/tract unavailable from geocoder; neighborhood profile unavailable."] };
}

export const censusInternals = { envCensusApiKey };
