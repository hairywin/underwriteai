const CENSUS_GEOCODER_ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const DEFAULT_TIMEOUT_MS = 10_000;

type CensusGeocodeJsonpOptions = {
  timeoutMs?: number;
};

type JsonpWindow = Window & Record<string, ((payload: unknown) => void) | undefined>;

export type CensusGeocodeJsonpResult = {
  payload: any;
  requestUrl: string;
};

export function censusGeocodeJsonp(address: string, options: CensusGeocodeJsonpOptions = {}): Promise<CensusGeocodeJsonpResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Geocoder request failed: JSONP is only available in browser contexts."));
  }

  const trimmedAddress = address.trim();
  if (trimmedAddress.length < 5) {
    return Promise.reject(new Error("Please enter a valid address (at least 5 characters) before geocoding."));
  }

  const callbackName = `__census_cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestUrl = `${CENSUS_GEOCODER_ENDPOINT}?address=${encodeURIComponent(trimmedAddress)}&benchmark=Public_AR_Current&format=jsonp&callback=${encodeURIComponent(callbackName)}`;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const jsonpWindow = window as unknown as JsonpWindow;
    let settled = false;

    const cleanup = () => {
      delete jsonpWindow[callbackName];
      script.remove();
    };

    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Geocoder request failed: ${reason}. Request URL: ${requestUrl}`));
    };

    const timeout = window.setTimeout(() => {
      fail(`request timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    jsonpWindow[callbackName] = (payload: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanup();
      resolve({ payload, requestUrl });
    };

    script.src = requestUrl;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      fail("network or script load error");
    };

    document.head.appendChild(script);
  });
}
