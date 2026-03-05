import type { PropertyFacts, RentComp, SaleComp } from "../types";

const BASE = "https://api.rentcast.io/v1";
const INSUFFICIENT_COMPS_MESSAGE = "Unable to calculate AVM due to insufficient comparables matching request parameters";

const DEFAULT_TIMEOUT_MS = 8000;

type RcRequestOptions = {
  timeoutMs?: number;
};

type ValueAttempt = {
  maxRadius: string;
  daysOld?: string;
  compCount: string;
  squareFootageRange?: string;
  yearBuiltRange?: string;
  bedroomsRange?: string;
  bathroomsRange?: string;
};

const VALUE_ATTEMPTS: ValueAttempt[] = [
  { maxRadius: "1", daysOld: "365", compCount: "20", squareFootageRange: "0.2", yearBuiltRange: "10", bedroomsRange: "0", bathroomsRange: "0" },
  { maxRadius: "5", daysOld: "730", compCount: "30", squareFootageRange: "0.35", yearBuiltRange: "20", bedroomsRange: "1", bathroomsRange: "1" },
  { maxRadius: "12", daysOld: "1095", compCount: "40", bedroomsRange: "2", bathroomsRange: "2" },
];

export type ValuationResult = {
  valuation: {
    status: "ok" | "unavailable";
    source: "rentcast_avm" | "listing_price_fallback" | "comps_price_per_sqft_fallback" | "unavailable";
    warnings: string[];
  };
  valueEstimate?: number;
  valueRangeLow?: number;
  valueRangeHigh?: number;
  comps: SaleComp[];
};

class RentcastHttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(toFriendlyRentcastError(status, body));
    this.status = status;
    this.body = body;
  }
}

function toFriendlyRentcastError(status: number, body: string) {
  if (status === 401 || status === 403) return "RentCast key invalid or unauthorized.";
  if (status === 429) return "RentCast rate limited. Please retry in a moment.";
  if (status === 400 && body.includes(INSUFFICIENT_COMPS_MESSAGE)) {
    return "Valuation unavailable (not enough comparable sales nearby). We expanded the search area automatically; if this persists, try a nearby address or use listing price.";
  }
  return `RentCast error ${status}: ${body || "Unexpected API response."}`;
}

function normalizeAddress(address: string) {
  let normalized = address.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/\s+,/g, ",");
  normalized = normalized.replace(/,\s*/g, ", ");
  normalized = normalized.replace(/([A-Za-z])([A-Z][a-z]+),?\s+([A-Z]{2})\b/g, "$1, $2, $3");
  normalized = normalized.replace(/\b([A-Za-z]{2,})\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/, "$1, $2 $3");
  if (!normalized.includes(",")) {
    const maybeStateZip = normalized.match(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
    if (maybeStateZip) {
      const prefix = normalized.slice(0, maybeStateZip.index).trim();
      const parts = prefix.split(" ");
      if (parts.length >= 2) {
        const city = parts.pop();
        const street = parts.join(" ");
        normalized = `${street}, ${city}, ${maybeStateZip[1]} ${maybeStateZip[2]}`;
      }
    }
  }
  return normalized;
}

function isInsufficientCompsError(error: unknown) {
  return error instanceof RentcastHttpError && error.status === 400 && error.body.includes(INSUFFICIENT_COMPS_MESSAGE);
}

async function rcGet<T>(path: string, apiKey: string, params: Record<string, string>, options: RcRequestOptions = {}) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") url.searchParams.set(k, v);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { headers: { "X-Api-Key": apiKey }, signal: controller.signal });
    if (!res.ok) throw new RentcastHttpError(res.status, await res.text());
    return (await res.json()) as T;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("RentCast request timed out. Please retry.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mapSaleComps(raw: any): SaleComp[] {
  return (raw.comparables || []).map((c: any, i: number) => ({
    id: `s-${i}`,
    address: c.formattedAddress || c.address || "Unknown",
    price: Number(c.price ?? c.lastSalePrice ?? c.soldPrice) || undefined,
    bedrooms: Number(c.bedrooms) || undefined,
    bathrooms: Number(c.bathrooms) || undefined,
    squareFootage: Number(c.squareFootage) || undefined,
    distanceMiles: Number(c.distance) || undefined,
    soldDate: c.lastSaleDate || c.soldDate || undefined,
    url: c.url || undefined,
  }));
}

function computePpsfFallback(comps: SaleComp[], subjectSqft?: number): number | undefined {
  const ppsfValues = comps
    .map((c) => (c.price && c.squareFootage ? c.price / c.squareFootage : undefined))
    .filter((v): v is number => !!v && Number.isFinite(v));

  if (!ppsfValues.length || !subjectSqft) return undefined;
  const sorted = [...ppsfValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(median * subjectSqft);
}

async function resolveAddress(address: string, apiKey: string) {
  const normalizedInput = normalizeAddress(address);
  const raw = await rcGet<any[]>("/properties", apiKey, { address: normalizedInput, limit: "1" }).catch(() => null);
  if (!raw?.length) return { normalizedInput };
  const p = raw[0];
  return {
    normalizedInput,
    address: p.formattedAddress || p.address || normalizedInput,
    latitude: p.latitude,
    longitude: p.longitude,
    squareFootage: Number(p.squareFootage) || undefined,
  };
}

export async function fetchPropertyFacts(address: string, apiKey: string): Promise<PropertyFacts | null> {
  const resolved = await resolveAddress(address, apiKey);
  const raw = await rcGet<any[]>("/properties", apiKey, { address: resolved.address || resolved.normalizedInput, limit: "1" }).catch(() => null);
  if (!raw?.length) return null;
  const p = raw[0];
  return {
    address,
    normalizedAddress: p.formattedAddress || p.address || resolved.normalizedInput,
    propertyType: p.propertyType,
    bedrooms: Number(p.bedrooms) || undefined,
    bathrooms: Number(p.bathrooms) || undefined,
    squareFootage: Number(p.squareFootage) || undefined,
    lotSize: Number(p.lotSize) || undefined,
    yearBuilt: Number(p.yearBuilt) || undefined,
    estimatedValue: Number(p.lastSalePrice) || undefined,
    sourceNotes: ["Property facts from RentCast /properties"],
  };
}

export async function fetchRentData(address: string, apiKey: string) {
  const resolved = await resolveAddress(address, apiKey);
  const query = { address: resolved.address || resolved.normalizedInput, compCount: "20", maxRadius: "2" };
  const raw = await rcGet<any>("/avm/rent/long-term", apiKey, query);
  const comps: RentComp[] = (raw.comparables || []).map((c: any, i: number) => ({
    id: `r-${i}`,
    address: c.formattedAddress || c.address || "Unknown",
    rent: Number(c.rent ?? c.price) || undefined,
    bedrooms: Number(c.bedrooms) || undefined,
    bathrooms: Number(c.bathrooms) || undefined,
    squareFootage: Number(c.squareFootage) || undefined,
    distanceMiles: Number(c.distance) || undefined,
    daysOnMarket: Number(c.daysOnMarket) || undefined,
    url: c.url || undefined,
  }));

  return {
    rentEstimate: Number(raw.rent) || undefined,
    rentRangeLow: Number(raw.rentRangeLow) || undefined,
    rentRangeHigh: Number(raw.rentRangeHigh) || undefined,
    comps,
  };
}

export async function fetchValueData(
  address: string,
  apiKey: string,
  fallback?: { listingPrice?: number; subjectSquareFootage?: number },
): Promise<ValuationResult> {
  const resolved = await resolveAddress(address, apiKey);
  const normalizedAddress = resolved.address || resolved.normalizedInput;
  const warnings: string[] = [];
  const requestBase: Record<string, string> = { address: normalizedAddress };

  for (let i = 0; i < VALUE_ATTEMPTS.length; i += 1) {
    const attempt = VALUE_ATTEMPTS[i];
    try {
      const raw = await rcGet<any>("/avm/value", apiKey, { ...requestBase, ...attempt }, { timeoutMs: 5000 });
      const comps = mapSaleComps(raw);
      return {
        valuation: { status: "ok", source: "rentcast_avm", warnings },
        valueEstimate: Number(raw.price ?? raw.value ?? raw.estimate) || undefined,
        valueRangeLow: Number(raw.priceRangeLow ?? raw.valueRangeLow) || undefined,
        valueRangeHigh: Number(raw.priceRangeHigh ?? raw.valueRangeHigh) || undefined,
        comps,
      };
    } catch (error) {
      if (!isInsufficientCompsError(error)) throw error;
      warnings.push(`AVM attempt ${i + 1} had insufficient comparables; expanded search criteria.`);
      if (i === VALUE_ATTEMPTS.length - 1) break;
    }
  }

  const compsRaw = await rcGet<any>("/sales", apiKey, { address: normalizedAddress, limit: "40", radius: "15" }).catch(() => null);
  const comps = (compsRaw || []).map((c: any, i: number) => ({
    id: `sf-${i}`,
    address: c.formattedAddress || c.address || "Unknown",
    price: Number(c.lastSalePrice ?? c.price ?? c.soldPrice) || undefined,
    squareFootage: Number(c.squareFootage) || undefined,
    bedrooms: Number(c.bedrooms) || undefined,
    bathrooms: Number(c.bathrooms) || undefined,
    soldDate: c.lastSaleDate || c.soldDate || undefined,
    distanceMiles: Number(c.distance) || undefined,
    url: c.url || undefined,
  })) as SaleComp[];

  if (fallback?.listingPrice && fallback.listingPrice > 0) {
    warnings.push("RentCast AVM unavailable; used listing price fallback.");
    return {
      valuation: { status: "ok", source: "listing_price_fallback", warnings },
      valueEstimate: fallback.listingPrice,
      comps,
    };
  }

  const ppsfFallback = computePpsfFallback(comps, fallback?.subjectSquareFootage ?? resolved.squareFootage);
  if (ppsfFallback) {
    warnings.push("RentCast AVM unavailable; used comps median $/sqft fallback.");
    return {
      valuation: { status: "ok", source: "comps_price_per_sqft_fallback", warnings },
      valueEstimate: ppsfFallback,
      comps,
    };
  }

  warnings.push("Valuation unavailable (not enough comparable sales nearby). We expanded the search area automatically; if this persists, try a nearby address or use listing price.");
  return {
    valuation: { status: "unavailable", source: "unavailable", warnings },
    comps,
  };
}

export const rentcastInternals = {
  normalizeAddress,
  isInsufficientCompsError,
  computePpsfFallback,
  INSUFFICIENT_COMPS_MESSAGE,
};
