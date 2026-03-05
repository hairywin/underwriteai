import type { PropertyFacts, RentComp, SaleComp } from "../types";

const BASE = "https://api.rentcast.io/v1";

function toFriendlyRentcastError(status: number, body: string) {
  if (status === 401 || status === 403) return "RentCast key invalid or unauthorized.";
  if (status === 429) return "RentCast rate limited. Please retry in a moment.";
  return `RentCast error ${status}: ${body || "Unexpected API response."}`;
}

async function rcGet<T>(path: string, apiKey: string, params: Record<string, string>) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(toFriendlyRentcastError(res.status, await res.text()));
  return (await res.json()) as T;
}

export async function fetchPropertyFacts(address: string, apiKey: string): Promise<PropertyFacts | null> {
  const raw = await rcGet<any[]>("/properties", apiKey, { address, limit: "1" }).catch(() => null);
  if (!raw?.length) return null;
  const p = raw[0];
  return {
    address,
    normalizedAddress: p.formattedAddress || p.address || address,
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
  const raw = await rcGet<any>("/avm/rent/long-term", apiKey, { address, compCount: "20", maxRadius: "2" });
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

export async function fetchValueData(address: string, apiKey: string) {
  const raw = await rcGet<any>("/avm/value", apiKey, { address, compCount: "20", maxRadius: "2" });
  const comps: SaleComp[] = (raw.comparables || []).map((c: any, i: number) => ({
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

  return {
    valueEstimate: Number(raw.price ?? raw.value ?? raw.estimate) || undefined,
    valueRangeLow: Number(raw.priceRangeLow ?? raw.valueRangeLow) || undefined,
    valueRangeHigh: Number(raw.priceRangeHigh ?? raw.valueRangeHigh) || undefined,
    comps,
  };
}
