import * as Cesium from 'cesium'

export interface ColorStop {
  stop: number // 0.0 to 1.0
  color: [number, number, number, number] // r, g, b, a (0-255)
}

/**
 * Standard cmocean thermal colormap for ocean temperature
 */
export const THERMAL_SCALE: ColorStop[] = [
  { stop: 0.0, color: [4, 4, 30, 255] },
  { stop: 0.2, color: [20, 60, 140, 255] },
  { stop: 0.4, color: [30, 140, 170, 255] },
  { stop: 0.6, color: [45, 185, 140, 255] },
  { stop: 0.8, color: [230, 190, 50, 255] },
  { stop: 1.0, color: [240, 60, 40, 255] },
]

/**
 * Perceptual teal-to-indigo salinity colormap tuned for real Indian Ocean HYCOM data.
 * Real data range: 33.4–37.1 PSU. Bounds set to 33–37.5 PSU.
 * Uses full colormap width → more color variation, smooth gradient, no jarring jump.
 */
export const HALINE_SCALE: ColorStop[] = [
  { stop: 0.00, color: [140, 230, 240, 255] },  // 33.0 PSU — fresh coastal, bright sky-cyan
  { stop: 0.15, color: [90,  210, 225, 255] },  // 33.7 PSU
  { stop: 0.28, color: [55,  190, 210, 255] },  // 34.3 PSU — central Indian Ocean
  { stop: 0.42, color: [30,  170, 190, 255] },  // 34.9 PSU
  { stop: 0.55, color: [20,  148, 168, 255] },  // 35.5 PSU — transition zone
  { stop: 0.67, color: [18,  120, 145, 255] },  // 36.0 PSU
  { stop: 0.78, color: [20,   95, 125, 255] },  // 36.5 PSU — Arabian Sea
  { stop: 0.88, color: [25,   70, 108, 255] },  // 37.0 PSU — high salinity AS
  { stop: 0.95, color: [30,   50,  95, 255] },  // 37.3 PSU
  { stop: 1.00, color: [35,   35,  85, 255] },  // 37.5 PSU — hypersaline deep indigo
]

/**
 * Diverging colormap for model-observation bias (Negative = Blue, Zero = White/Grey, Positive = Red)
 */
export const DIVERGING_BIAS_SCALE: ColorStop[] = [
  { stop: 0.0, color: [20, 90, 230, 255] },   // Model Colder / Lower (-2.0)
  { stop: 0.35, color: [120, 180, 250, 230] },
  { stop: 0.5, color: [240, 245, 250, 160] },  // Zero bias
  { stop: 0.65, color: [250, 160, 120, 230] },
  { stop: 1.0, color: [230, 40, 30, 255] },   // Model Warmer / Higher (+2.0)
]

/**
 * Current speed colormap (m/s)
 */
export const SPEED_SCALE: ColorStop[] = [
  { stop: 0.0, color: [10, 20, 50, 180] },
  { stop: 0.25, color: [0, 160, 220, 220] },
  { stop: 0.5, color: [50, 230, 140, 255] },
  { stop: 0.75, color: [250, 210, 40, 255] },
  { stop: 1.0, color: [255, 50, 20, 255] },
]

/**
 * Bathymetry depth colormap (GEBCO ocean floor)
 */
export const BATHYMETRY_SCALE: ColorStop[] = [
  { stop: 0.0, color: [5, 10, 25, 255] },      // Deep ocean trench (>5000m)
  { stop: 0.3, color: [10, 40, 80, 255] },     // Abyssal plain (3000-4000m)
  { stop: 0.7, color: [20, 100, 140, 255] },   // Continental slope (1000m)
  { stop: 0.95, color: [60, 180, 190, 255] },  // Shelf (100m)
  { stop: 1.0, color: [180, 230, 220, 255] },  // Coastline (0m)
]

export function sampleColormap(
  value: number,
  vmin: number,
  vmax: number,
  palette: ColorStop[]
): [number, number, number, number] {
  if (isNaN(value) || value === null) return [0, 0, 0, 0]
  if (palette === HALINE_SCALE) {
    // Tight bounds matching REAL HYCOM Indian Ocean surface salinity: 33.4–37.1 PSU.
    // Using the full colormap width over just 4.5 PSU gives much richer colour variation.
    vmin = 33.0
    vmax = 37.5
  }
  const clamped = Math.max(vmin, Math.min(vmax, value))
  const norm = vmax === vmin ? 0.5 : (clamped - vmin) / (vmax - vmin)

  for (let i = 0; i < palette.length - 1; i++) {
    const s0 = palette[i]
    const s1 = palette[i + 1]
    if (norm >= s0.stop && norm <= s1.stop) {
      const span = s1.stop - s0.stop
      const t = span === 0 ? 0 : (norm - s0.stop) / span
      const r = Math.round(s0.color[0] + (s1.color[0] - s0.color[0]) * t)
      const g = Math.round(s0.color[1] + (s1.color[1] - s0.color[1]) * t)
      const b = Math.round(s0.color[2] + (s1.color[2] - s0.color[2]) * t)
      const a = Math.round(s0.color[3] + (s1.color[3] - s0.color[3]) * t)
      return [r, g, b, a]
    }
  }
  return palette[palette.length - 1].color
}

export function valueToCesiumColor(
  value: number,
  vmin: number,
  vmax: number,
  palette: ColorStop[],
  alphaMultiplier = 1.0
): Cesium.Color {
  const [r, g, b, a] = sampleColormap(value, vmin, vmax, palette)
  return new Cesium.Color(r / 255, g / 255, b / 255, (a / 255) * alphaMultiplier)
}
