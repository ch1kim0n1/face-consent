import { MATCH_MAX_DISTANCE, MATCH_MIN_GAP } from "./config.js";

export function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export type MatchCandidate = { userId: string; distance: number };

export function findBestMatch(
  descriptor: number[],
  enrolled: MatchCandidate[],
): MatchCandidate | null {
  if (enrolled.length === 0) return null;
  const sorted = [...enrolled].sort((x, y) => x.distance - y.distance);
  const best = sorted[0];
  if (best.distance > MATCH_MAX_DISTANCE) return null;
  if (sorted.length > 1) {
    const second = sorted[1];
    if (second.distance - best.distance < MATCH_MIN_GAP) return null;
  }
  return best;
}

export function distanceForUser(
  descriptor: number[],
  vector: number[] | null,
): number | null {
  if (!vector) return null;
  return euclidean(descriptor, vector);
}
