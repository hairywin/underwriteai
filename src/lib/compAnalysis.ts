import type { PropertyFacts, RentComp } from "../types";

function closeness(a?: number, b?: number, maxDelta = 1): number {
  if (a == null || b == null) return 0.5;
  const delta = Math.abs(a - b);
  return Math.max(0, 1 - delta / maxDelta);
}

function sqftSimilarity(a?: number, b?: number): number {
  if (!a || !b) return 0.5;
  return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
}

export function scoreRentComp(subject: PropertyFacts, comp: RentComp): { score: number; reason: string } {
  const distanceScore = comp.distanceMiles == null ? 0.5 : Math.max(0, 1 - comp.distanceMiles / 2);
  const bedScore = closeness(subject.bedrooms, comp.bedrooms, 3);
  const bathScore = closeness(subject.bathrooms, comp.bathrooms, 2);
  const sqftScore = sqftSimilarity(subject.squareFootage, comp.squareFootage);
  const hasRent = comp.rent && comp.rent > 0 ? 1 : 0;

  const score =
    distanceScore * 0.3 +
    bedScore * 0.2 +
    bathScore * 0.15 +
    sqftScore * 0.2 +
    hasRent * 0.15;

  return {
    score,
    reason: `distance=${distanceScore.toFixed(2)}, beds=${bedScore.toFixed(
      2
    )}, baths=${bathScore.toFixed(2)}, sqft=${sqftScore.toFixed(2)}, rent=${hasRent.toFixed(2)}`,
  };
}

export function rankRentComps(subject: PropertyFacts, comps: RentComp[], limit = 6): RentComp[] {
  return comps
    .map((comp) => {
      const { score, reason } = scoreRentComp(subject, comp);
      return { ...comp, score, scoreReason: reason };
    })
    .filter((comp) => (comp.score ?? 0) >= 0.4)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export function weightedRentEstimate(comps: RentComp[]): number | undefined {
  const valid = comps.filter((c) => c.rent && c.rent > 0 && c.score && c.score > 0);
  if (!valid.length) return undefined;
  const weighted = valid.reduce(
    (acc, c) => {
      acc.sum += (c.rent as number) * (c.score as number);
      acc.weight += c.score as number;
      return acc;
    },
    { sum: 0, weight: 0 }
  );
  return weighted.weight > 0 ? weighted.sum / weighted.weight : undefined;
}
