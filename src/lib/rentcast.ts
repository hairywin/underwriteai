import type {
  PropertyFacts,
  RentComp,
  RentcastRentEstimateResponse,
  SaleComp,
} from "../types";

const BASE = "https://api.rentcast.io/v1";

async function rentcastGet<T>(
  path: string,
  apiKey: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RentCast error ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchPropertyFactsFromRentcast(
  address: string,
  apiKey: string
): Promise<PropertyFacts | null> {
  const data = await rentcastGet<any[]>("/properties", apiKey, {
    address,
    limit: "1",
  }).catch(() => null);

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
    features: p.features
      ? Object.keys(p.features).filter((k) => p.features?.[k])
      : undefined,
    sourceNotes: ["Property facts from RentCast /properties (best-effort)."],
  };

  return facts;
}

export async function fetchRentEstimateAndComps(
  address: string,
  apiKey: string
): Promise<{
  rent?: number;
  comps: RentComp[];
  raw: RentcastRentEstimateResponse;
}> {
  const raw = await rentcastGet<RentcastRentEstimateResponse>(
    "/avm/rent/long-term",
    apiKey,
    {
      address,
      compCount: "3",
      maxRadius: "1", // miles (best-effort)
    }
  );

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

/**
 * NEW: Value estimate + sales comps (3) via /avm/value
 * This returns a value estimate and a list of comparable sale properties.
 */
export async function fetchValueEstimateAndSalesComps(
  address: string,
  apiKey: string
): Promise<{
  value?: number;
  comps: SaleComp[];
  raw: any;
}> {
  const raw = await rentcastGet<any>("/avm/value", apiKey, {
    address,
    compCount: "3",
    maxRadius: "1", // miles (best-effort)
  });

  // Value field naming varies slightly; handle best-effort:
  const value =
    raw?.price ??
    raw?.value ??
    raw?.estimate ??
    raw?.valuation ??
    raw?.avm?.value ??
    undefined;

  const compsRaw = raw?.comparables ?? raw?.comparablesSale ?? raw?.comps ?? [];
  const comps: SaleComp[] = (Array.isArray(compsRaw) ? compsRaw : [])
    .slice(0, 3)
    .map((c: any) => ({
      address: c.formattedAddress || c.address || "",
      price: c.price ?? c.soldPrice ?? c.lastSalePrice ?? c.value ?? 0,
      bedrooms: c.bedrooms ?? c.beds ?? null,
      bathrooms: c.bathrooms ?? c.baths ?? null,
      squareFootage: c.squareFootage ?? c.sqft ?? null,
      link: c.url ?? c.listingUrl ?? "",
    }));

  return { value, comps, raw };
}
