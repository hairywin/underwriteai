# UnderwriteAI (Frontend-Only)

A Vite + React + TypeScript + Tailwind underwriting app for single-family and multifamily deals (2-4 and 5+). Built as a static site for GitHub Pages.

## Setup
1. Install deps: `npm install`
2. Run local app: `npm run dev`
3. Open **Settings** and save:
   - OpenAI API key
   - RentCast API key
   - FRED API key
   - Default model (safe default: `gpt-4.1-mini`)

> Keys are stored in browser localStorage only. They are never committed.

## Data sources
- **RentCast** official APIs only:
  - `/properties`
  - `/avm/rent/long-term`
  - `/avm/value`
- **FRED** for market references:
  - 30-year fixed mortgage rate (`MORTGAGE30US`)
  - CPI (`CPIAUCSL`) reference
- **OpenAI** for deep-dive memo + deal chat over in-app context only.

## Limitations
- Static frontend only (no backend/serverless).
- No scraping Zillow/Redfin/etc and no listing URL fetch pipeline.
- OpenAI does not browse internet; it only uses fetched/entered deal context.
- Multifamily comps can be sparse from AVM endpoints; app prompts for manual rent/unit assumptions when needed.

## Roadmap
- Backend proxy for key protection + stronger rate limit handling.
- Additional data providers (CoStar, Census, crime/school APIs).
- Auth and persisted/saved deals with collaboration.
