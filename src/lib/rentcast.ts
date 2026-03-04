import type { PropertyFacts, RentComp, RentcastRentEstimateResponse } from "../types";

// RentCast docs indicate these base URLs and endpoints. :contentReference[oaicite:1]{index=1}
const BASE = "https://api.rentcast.io/v1";

async function rentcastGet<T>(path: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      "X-Api-Key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RentCast error ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchPropertyFactsFromRentcast(address: string, apiKey: string): Promise<PropertyFacts | null> {
  // /properties supports searching by address. :contentReference[oaicite:2]{index=2}
  const data = await rentcastGet<any[]>("/properties", apiKey, { address, limit: "1" }).catch(() => null);
  if (!data || data.length === 0) return null;

  const p = data[0];
  const facts: PropertyFacts = {
    address,
    normalizedAddress: p.formattedAddress || p.address || address,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    squareFootage: p.squareFootage,
    lotSize: p.lotSize,
    yearBuilt: p.yearBuilt,
    price: p.lastSalePrice ?? p.assessedValue ?? undefined,
    features: p.features ? Object.keys(p.features).filter((k) => p.features?.[k]) : undefined,
    sourceNotes: ["Property facts from RentCast /properties (best-effort)."],
  };
  return facts;
}

export async function fetchRentEstimateAndComps(address: string, apiKey: string): Promise<{ rent?: number; comps: RentComp[]; raw: RentcastRentEstimateResponse }> {
  // /avm/rent/long-term returns rent estimate + comparables. :contentReference[oaicite:3]{index=3}
  const raw = await rentcastGet<RentcastRentEstimateResponse>("/avm/rent/long-term", apiKey, {
    address,
    compCount: "3",
    maxRadius: "1", // miles (best-effort)
  });

  const compsRaw = (raw as any).comparables ?? [];
  const comps: RentComp[] = compsRaw.slice(0, 3).map((c: any) => ({
    address: c.formattedAddress || c.address,
    city: c.city,
    state: c.state,
    zipCode: c.zipCode,
    latitude: c.latitude,
    longitude: c.longitude,
    bedrooms: c.bedrooms,
    bathrooms: c.bathrooms,
    squareFootage: c.squareFootage,
    distanceMiles: c.distance,
    rent: c.rent ?? c.price ?? c.listPrice,
    url: c.url,
    source: "RentCast AVM comparable",
  }));

  return { rent: (raw as any).rent, comps, raw };
}
