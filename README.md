# UnderwriteAI (Frontend-Only)

A Vite + React + TypeScript + Tailwind underwriting app for single-family and multifamily deals.

## Setup
1. Install deps: `npm install`
2. Copy env template: `cp .env.example .env`
3. Set `VITE_CENSUS_API_KEY` (or `CENSUS_API_KEY`) for Census Data API calls.
4. Run local app: `npm run dev`
5. Open **Settings** and save:
   - OpenAI API key
   - RentCast API key
   - FRED API key
   - Census Data API key (optional here; overrides env in this browser)
   - Default model (safe default: `gpt-4.1-mini`)

> Keys in Settings are stored in browser localStorage. Census API key can be set in Settings, or read from env at build/runtime.

## Underwriting workflow (optimized)
1. **Mandatory US Census Geocoder normalization + coordinate lookup**
2. **RentCast** property/rent/valuation using normalized address (with AVM rural fallbacks)
3. **Census Data API (ACS 5-year)** using tract FIPS, with county fallback
4. **FRED** macro references (if key provided)
5. **OpenAI** narrative only from structured data (not numeric source of truth)

Parallelization: after geocode, RentCast + Census + FRED run concurrently for faster response.

## Required env vars
- `VITE_CENSUS_API_KEY` (preferred in Vite)
- `CENSUS_API_KEY` (optional alias)

If Census key is missing, underwriting continues and neighborhood metrics are marked unavailable with warnings.

## Data sources
- **RentCast** official APIs only:
  - `/properties`
  - `/avm/rent/long-term`
  - `/avm/value`
- **US Census Geocoder** (no key)
- **US Census Data API** ACS 5-year
- **FRED** for market references
- **OpenAI** for memo/chat narrative over in-app context only

## Rural / low-comp resilience notes
- AVM can fail with insufficient comparables.
- Tool retries with broader search params.
- If still unavailable, tool falls back to listing price, then comps-derived median $/sqft when possible.
- If valuation remains unavailable, underwriting still runs with rent-side assumptions and surfaces warnings.
