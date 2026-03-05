import { localCache, stableHash } from "./cache.js";

const GEOCODE_BASE = "https://geocoding.geo.census.gov/geocoder";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type GeocodeResult = {
  rawAddress: string;
  normalizedAddress?: string;
  lat?: number;
  lng?: number;
  matchQuality?: string;
  isMatchFound: boolean;
  unresolvedMessage?: string;
  stateFips?: string;
  countyFips?: string;
  tract?: string;
  blockGroup?: string;
  countyName?: string;
  state?: string;
};

async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Census Geocoder error ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function buildGeoKey(rawAddress: string, normalizedAddress?: string) {
  return `uw:geo:${stableHash(`${rawAddress.trim().toLowerCase()}|${(normalizedAddress || "").trim().toLowerCase()}`)}`;
}

export async function normalizeAndGeocodeAddress(rawAddress: string): Promise<GeocodeResult> {
  const baseKey = buildGeoKey(rawAddress);
  const cached = localCache.get<GeocodeResult>(baseKey);
  if (cached) return cached;

  const geocodeUrl = new URL(`${GEOCODE_BASE}/locations/onelineaddress`);
  geocodeUrl.searchParams.set("address", rawAddress);
  geocodeUrl.searchParams.set("benchmark", "Public_AR_Current");
  geocodeUrl.searchParams.set("format", "json");

  const geocodeData = await fetchWithRetry(geocodeUrl.toString());
  const firstMatch = geocodeData?.result?.addressMatches?.[0];

  if (!firstMatch) {
    const unresolved: GeocodeResult = {
      rawAddress,
      isMatchFound: false,
      unresolvedMessage: "We couldn't resolve this address with the US Census Geocoder. Please check spelling and try again.",
    };
    localCache.set(baseKey, unresolved, THIRTY_DAYS_MS);
    return unresolved;
  }

  const normalizedAddress = String(firstMatch.matchedAddress || rawAddress);
  const lat = Number(firstMatch.coordinates?.y);
  const lng = Number(firstMatch.coordinates?.x);

  const result: GeocodeResult = {
    rawAddress,
    normalizedAddress,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    matchQuality: firstMatch.tigerLine?.side || firstMatch.matchType,
    isMatchFound: true,
  };

  const geoKey = buildGeoKey(rawAddress, normalizedAddress);
  const geoCached = localCache.get<GeocodeResult>(geoKey);
  if (geoCached) return geoCached;

  if (result.lat != null && result.lng != null) {
    const geographiesUrl = new URL(`${GEOCODE_BASE}/geographies/coordinates`);
    geographiesUrl.searchParams.set("x", String(result.lng));
    geographiesUrl.searchParams.set("y", String(result.lat));
    geographiesUrl.searchParams.set("benchmark", "Public_AR_Current");
    geographiesUrl.searchParams.set("vintage", "Current_Current");
    geographiesUrl.searchParams.set("format", "json");

    try {
      const geoData = await fetchWithRetry(geographiesUrl.toString());
      const tracts = geoData?.result?.geographies?.["Census Tracts"]?.[0];
      const counties = geoData?.result?.geographies?.Counties?.[0];
      if (tracts) {
        result.stateFips = tracts.STATE;
        result.countyFips = tracts.COUNTY;
        result.tract = tracts.TRACT;
        result.blockGroup = tracts.BLKGRP;
      }
      if (counties) {
        result.countyName = counties.NAME;
        result.state = counties.STATE;
      }
    } catch {
      // non-fatal geographic metadata lookup failure
    }
  }

  localCache.set(baseKey, result, THIRTY_DAYS_MS);
  localCache.set(geoKey, result, THIRTY_DAYS_MS);
  return result;
}
