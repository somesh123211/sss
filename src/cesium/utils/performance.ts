import * as Cesium from 'cesium'

/**
 * Safely dispose Cesium primitives and collections
 */
export function safelyRemoveCollection(
  scene: Cesium.Scene,
  collection: Cesium.PrimitiveCollection | Cesium.PointPrimitiveCollection | Cesium.PolylineCollection | null
): void {
  if (!collection || !scene || scene.isDestroyed()) return
  try {
    if (scene.primitives.contains(collection)) {
      scene.primitives.remove(collection)
    }
    if (!collection.isDestroyed()) {
      collection.destroy()
    }
  } catch (err) {
    console.warn('Primitive cleanup warning:', err)
  }
}

/**
 * Downsample grid data when resolution exceeds performance threshold
 */
export function downsampleGrid2D<T>(
  grid: T[][],
  lats: number[],
  lons: number[],
  maxDim = 120
): { grid: T[][]; lats: number[]; lons: number[] } {
  const nLat = lats.length
  const nLon = lons.length
  if (nLat <= maxDim && nLon <= maxDim) {
    return { grid, lats, lons }
  }

  const stepLat = Math.max(1, Math.ceil(nLat / maxDim))
  const stepLon = Math.max(1, Math.ceil(nLon / maxDim))

  const subLats: number[] = []
  for (let i = 0; i < nLat; i += stepLat) subLats.push(lats[i])

  const subLons: number[] = []
  for (let j = 0; j < nLon; j += stepLon) subLons.push(lons[j])

  const subGrid: T[][] = []
  for (let i = 0; i < nLat; i += stepLat) {
    const row: T[] = []
    for (let j = 0; j < nLon; j += stepLon) {
      row.push(grid[i][j])
    }
    subGrid.push(row)
  }

  return { grid: subGrid, lats: subLats, lons: subLons }
}
