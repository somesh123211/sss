/**
 * Depth utilities for ocean digital twin depth levels
 */

export const STANDARD_DEPTH_LEVELS: number[] = [
  0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000,
  1200, 1400, 1600, 1800, 2000, 2500, 3000, 3500, 4000, 5000
]

export function findNearestDepthLevel(targetDepth: number, availableDepths: number[]): number {
  if (!availableDepths || availableDepths.length === 0) return targetDepth
  let closest = availableDepths[0]
  let minDiff = Math.abs(targetDepth - closest)
  for (const d of availableDepths) {
    const diff = Math.abs(targetDepth - d)
    if (diff < minDiff) {
      minDiff = diff
      closest = d
    }
  }
  return closest
}

export function formatDepth(depth_m: number): string {
  if (depth_m === 0) return 'Surface (0m)'
  return `${Math.round(depth_m)} m`
}
