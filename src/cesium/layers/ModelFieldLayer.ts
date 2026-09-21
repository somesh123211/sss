import * as Cesium from 'cesium'
import { api, HYCOMModelSurface } from '../../services/api'
import { OceanVariable } from '../types'
import {
  THERMAL_SCALE,
  HALINE_SCALE,
  SPEED_SCALE,
  sampleColormap,
  ColorStop,
} from '../utils/colors'
import { boundsToRectangle } from '../utils/coordinates'

export class ModelFieldLayer {
  private viewer: Cesium.Viewer
  private primitive: Cesium.Primitive | null = null
  private visible = true
  private variable: OceanVariable = 'temperature'
  private depth_m = 0
  private time_index = 0
  private verticalExaggeration = 1.0
  private currentData: HYCOMModelSurface | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  public async update(params: {
    variable?: OceanVariable
    depth_m?: number
    time_index?: number
    verticalExaggeration?: number
    visible?: boolean
  }): Promise<void> {
    if (params.variable !== undefined) this.variable = params.variable
    if (params.depth_m !== undefined) this.depth_m = params.depth_m
    if (params.time_index !== undefined) this.time_index = params.time_index
    if (params.verticalExaggeration !== undefined) this.verticalExaggeration = params.verticalExaggeration
    if (params.visible !== undefined) this.visible = params.visible

    if (!this.visible) {
      if (this.primitive) this.primitive.show = false
      return
    }

    try {
      const data =
        this.depth_m === 0
          ? await api.modelSurface(this.variable, this.time_index)
          : await api.modelDepthSlice(this.variable, this.depth_m, this.time_index)

      if (!data || !data.lat || !data.lon || !data.values) return
      this.currentData = data
      this.render()
    } catch (err) {
      console.warn('ModelFieldLayer update error:', err)
    }
  }

  private render(): void {
    if (!this.currentData || !this.currentData.lat || !this.currentData.lon) return

    const data = this.currentData
    const nLat = data.lat.length
    const nLon = data.lon.length
    const latMin = data.lat[0]
    const latMax = data.lat[nLat - 1]
    const lonMin = data.lon[0]
    const lonMax = data.lon[nLon - 1]

    let palette: ColorStop[] = THERMAL_SCALE
    let vmin = data.vmin ?? 15
    let vmax = data.vmax ?? 32

    if (this.variable === 'salinity') {
      palette = HALINE_SCALE
      // Fixed bounds: sampleColormap overrides to 28-38 PSU internally
      vmin = 28.0
      vmax = 38.0
    } else if (this.variable === 'current_speed') {
      palette = SPEED_SCALE
      vmin = data.vmin ?? 0
      vmax = data.vmax ?? 1.5
    }

    const CANVAS_W = 512
    const CANVAS_H = 384
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── Step 1: Inpaint land at GRID level (salinity only) ───────────────────
    // At 31×46 grid resolution, India is only ~2-4 cells wide → 20 passes fills it fully.
    // This lets AS values (high PSU) flow through India to meet BoB (low PSU).
    let gridValues = data.values as (number | null)[][]

    if (this.variable === 'salinity') {
      // Copy grid to a mutable float array
      let g: (number | null)[][] = gridValues.map(row => [...row])
      for (let pass = 0; pass < 20; pass++) {
        const next = g.map(row => [...row]) as (number | null)[][]
        for (let i = 0; i < nLat; i++) {
          for (let j = 0; j < nLon; j++) {
            if (g[i][j] !== null && g[i][j] !== undefined) continue  // ocean — skip
            let sum = 0, cnt = 0
            for (let di = -1; di <= 1; di++) {
              for (let dj = -1; dj <= 1; dj++) {
                if (di === 0 && dj === 0) continue
                const ni = i + di, nj = j + dj
                if (ni < 0 || ni >= nLat || nj < 0 || nj >= nLon) continue
                const v = g[ni][nj]
                if (v !== null && v !== undefined) { sum += v as number; cnt++ }
              }
            }
            if (cnt > 0) next[i][j] = sum / cnt
          }
        }
        g = next
      }
      gridValues = g
    }

    // ── Step 2: Interpolate inpainted grid → float buffer at canvas resolution ─
    const floatBuf = new Float32Array(CANVAS_W * CANVAS_H)
    const maskBuf  = new Uint8Array(CANVAS_W * CANVAS_H)

    for (let py = 0; py < CANVAS_H; py++) {
      for (let px = 0; px < CANVAS_W; px++) {
        const fi = (CANVAS_H - 1 - py) / (CANVAS_H - 1) * (nLat - 1)
        const fj = px / (CANVAS_W - 1) * (nLon - 1)
        const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, nLat - 1)
        const j0 = Math.floor(fj), j1 = Math.min(j0 + 1, nLon - 1)
        const ti = fi - i0, tj = fj - j0

        // Use ORIGINAL data for land mask (not inpainted)
        const o00 = data.values[i0]?.[j0]
        const o01 = data.values[i0]?.[j1]
        const o10 = data.values[i1]?.[j0]
        const o11 = data.values[i1]?.[j1]
        const origValid = [o00, o01, o10, o11].filter(v => v !== null && v !== undefined && !isNaN(v as number))

        const idx = py * CANVAS_W + px
        if (origValid.length === 0) {
          maskBuf[idx] = 0  // pure land — stay transparent
        } else {
          maskBuf[idx] = 1  // ocean (even partial)
        }

        // Use INPAINTED grid for actual values (so blur can cross India)
        const v00 = gridValues[i0]?.[j0]
        const v01 = gridValues[i0]?.[j1]
        const v10 = gridValues[i1]?.[j0]
        const v11 = gridValues[i1]?.[j1]
        const vals = [v00, v01, v10, v11].filter(v => v !== null && v !== undefined) as number[]

        if (vals.length === 4) {
          floatBuf[idx] = (v00 as number) * (1-ti)*(1-tj) + (v01 as number) * (1-ti)*tj +
                          (v10 as number) * ti*(1-tj)     + (v11 as number) * ti*tj
        } else if (vals.length > 0) {
          floatBuf[idx] = vals.reduce((a, b) => a + b, 0) / vals.length
        } else {
          floatBuf[idx] = NaN
        }
      }
    }

    // ── Step 3: Box-blur the FULL float buffer (salinity only) ───────────────
    // Since land is now filled, the blur propagates AS↔BoB values freely.
    const blurRadius = this.variable === 'salinity' ? 20 : 0
    const blurPasses = this.variable === 'salinity' ? 4 : 0

    let src = floatBuf
    for (let pass = 0; pass < blurPasses; pass++) {
      const dst = new Float32Array(CANVAS_W * CANVAS_H)
      for (let y = 0; y < CANVAS_H; y++) {
        let sum = 0, count = 0
        for (let x = 0; x <= blurRadius && x < CANVAS_W; x++) {
          const v = src[y * CANVAS_W + x]; if (!isNaN(v)) { sum += v; count++ }
        }
        for (let x = 0; x < CANVAS_W; x++) {
          const i = y * CANVAS_W + x
          dst[i] = count > 0 ? sum / count : (isNaN(src[i]) ? NaN : src[i])
          const ax = x + blurRadius + 1; if (ax < CANVAS_W) { const v = src[y*CANVAS_W+ax]; if(!isNaN(v)){sum+=v;count++} }
          const rx = x - blurRadius;     if (rx >= 0)       { const v = src[y*CANVAS_W+rx]; if(!isNaN(v)){sum-=v;count--} }
        }
      }
      const dst2 = new Float32Array(CANVAS_W * CANVAS_H)
      for (let x = 0; x < CANVAS_W; x++) {
        let sum = 0, count = 0
        for (let y = 0; y <= blurRadius && y < CANVAS_H; y++) {
          const v = dst[y * CANVAS_W + x]; if (!isNaN(v)) { sum += v; count++ }
        }
        for (let y = 0; y < CANVAS_H; y++) {
          const i = y * CANVAS_W + x
          dst2[i] = count > 0 ? sum / count : (isNaN(dst[i]) ? NaN : dst[i])
          const ay = y + blurRadius + 1; if (ay < CANVAS_H) { const v = dst[ay*CANVAS_W+x]; if(!isNaN(v)){sum+=v;count++} }
          const ry = y - blurRadius;     if (ry >= 0)       { const v = dst[ry*CANVAS_W+x]; if(!isNaN(v)){sum-=v;count--} }
        }
      }
      src = dst2
    }

    // ── Step 4: Colormap — restore original land mask ─────────────────────────
    // Render colormap to a temp canvas
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = CANVAS_W; rawCanvas.height = CANVAS_H
    const rawCtx = rawCanvas.getContext('2d')!
    const imgData = rawCtx.createImageData(CANVAS_W, CANVAS_H)
    const pixels = imgData.data
    for (let i = 0; i < CANVAS_W * CANVAS_H; i++) {
      const pixelIdx = i * 4
      if (!maskBuf[i]) { pixels[pixelIdx + 3] = 0; continue }
      const [r, g, b, a] = sampleColormap(src[i], vmin, vmax, palette)
      pixels[pixelIdx] = r; pixels[pixelIdx+1] = g; pixels[pixelIdx+2] = b
      pixels[pixelIdx+3] = Math.round(a * 0.88)
    }
    rawCtx.putImageData(imgData, 0, 0)

    // Composite with blur onto final canvas — smooths coastline edges
    const blurPx = this.variable === 'salinity' ? 25 : 0
    if (blurPx > 0) {
      ctx.filter = `blur(${blurPx}px)`
    }
    ctx.drawImage(rawCanvas, 0, 0)
    ctx.filter = 'none'

    // Dispose old primitive
    if (this.primitive && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = null
    }

    const height = -Math.max(0, this.depth_m) * this.verticalExaggeration
    const rect = boundsToRectangle(latMin, latMax, lonMin, lonMax)

    const instance = new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle: rect,
        height,
      }),
      id: {
        type: 'model_slice',
        variable: this.variable,
        depth_m: this.depth_m,
        actual_depth_m: data.actual_depth_m ?? this.depth_m,
        units: data.units,
        vmin,
        vmax,
        source: 'INCOIS IGORA / Ocean Model NetCDF',
      },
    })

    const material = new Cesium.Material({
      fabric: {
        type: 'Image',
        uniforms: {
          image: canvas.toDataURL(),
          alpha: 0.85,
        },
      },
    })

    this.primitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.MaterialAppearance({
        material,
        translucent: true,
      }),
      show: this.visible,
    })

    this.viewer.scene.primitives.add(this.primitive)
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (this.primitive) {
      this.primitive.show = visible
    }
  }

  public getCurrentData(): HYCOMModelSurface | null {
    return this.currentData
  }

  public destroy(): void {
    if (this.primitive && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = null
    }
  }
}
