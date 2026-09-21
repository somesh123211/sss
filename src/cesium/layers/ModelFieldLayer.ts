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

    // ── Step 1: Bilinear-interpolate raw data → float buffer at canvas resolution ──
    const floatBuf = new Float32Array(CANVAS_W * CANVAS_H)
    const maskBuf  = new Uint8Array(CANVAS_W * CANVAS_H)   // 0=land/missing, 1=ocean

    for (let py = 0; py < CANVAS_H; py++) {
      for (let px = 0; px < CANVAS_W; px++) {
        const fi = (CANVAS_H - 1 - py) / (CANVAS_H - 1) * (nLat - 1)
        const fj = px / (CANVAS_W - 1) * (nLon - 1)
        const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, nLat - 1)
        const j0 = Math.floor(fj), j1 = Math.min(j0 + 1, nLon - 1)
        const ti = fi - i0, tj = fj - j0

        const v00 = data.values[i0]?.[j0]
        const v01 = data.values[i0]?.[j1]
        const v10 = data.values[i1]?.[j0]
        const v11 = data.values[i1]?.[j1]

        const vals = [v00, v01, v10, v11]
        const valid = vals.filter(v => v !== null && v !== undefined && !isNaN(v as number)) as number[]
        const idx = py * CANVAS_W + px

        if (valid.length === 0) {
          floatBuf[idx] = NaN
          maskBuf[idx] = 0
          continue
        }
        maskBuf[idx] = 1
        if (valid.length === 4) {
          floatBuf[idx] = (v00 as number) * (1 - ti) * (1 - tj) +
                          (v01 as number) * (1 - ti) * tj +
                          (v10 as number) * ti * (1 - tj) +
                          (v11 as number) * ti * tj
        } else {
          floatBuf[idx] = valid.reduce((a, b) => a + b, 0) / valid.length
        }
      }
    }

    // ── Step 2: Heavy box-blur on float buffer (salinity only) ──
    // Blur at 512×384 resolution is FAR more effective than the old 31×46 grid smooth.
    // radius=20 across 4 passes spreads the AS/BoB front over ~160 pixels.
    const blurRadius = this.variable === 'salinity' ? 20 : 0
    const blurPasses = this.variable === 'salinity' ? 4 : 0

    let src = floatBuf
    for (let pass = 0; pass < blurPasses; pass++) {
      const dst = new Float32Array(CANVAS_W * CANVAS_H)
      // Horizontal pass
      for (let y = 0; y < CANVAS_H; y++) {
        let sum = 0, count = 0
        // seed the window
        for (let x = 0; x <= blurRadius && x < CANVAS_W; x++) {
          const i = y * CANVAS_W + x
          if (maskBuf[i]) { sum += src[i]; count++ }
        }
        for (let x = 0; x < CANVAS_W; x++) {
          const i = y * CANVAS_W + x
          if (maskBuf[i] && count > 0) {
            dst[i] = sum / count
          } else {
            dst[i] = src[i]
          }
          // slide window right
          const addX = x + blurRadius + 1
          if (addX < CANVAS_W) {
            const ai = y * CANVAS_W + addX
            if (maskBuf[ai]) { sum += src[ai]; count++ }
          }
          const remX = x - blurRadius
          if (remX >= 0) {
            const ri = y * CANVAS_W + remX
            if (maskBuf[ri]) { sum -= src[ri]; count-- }
          }
        }
      }
      // Vertical pass
      const dst2 = new Float32Array(CANVAS_W * CANVAS_H)
      for (let x = 0; x < CANVAS_W; x++) {
        let sum = 0, count = 0
        for (let y = 0; y <= blurRadius && y < CANVAS_H; y++) {
          const i = y * CANVAS_W + x
          if (maskBuf[i]) { sum += dst[i]; count++ }
        }
        for (let y = 0; y < CANVAS_H; y++) {
          const i = y * CANVAS_W + x
          if (maskBuf[i] && count > 0) {
            dst2[i] = sum / count
          } else {
            dst2[i] = dst[i]
          }
          const addY = y + blurRadius + 1
          if (addY < CANVAS_H) {
            const ai = addY * CANVAS_W + x
            if (maskBuf[ai]) { sum += dst[ai]; count++ }
          }
          const remY = y - blurRadius
          if (remY >= 0) {
            const ri = remY * CANVAS_W + x
            if (maskBuf[ri]) { sum -= dst[ri]; count-- }
          }
        }
      }
      src = dst2
    }

    // ── Step 3: Colormap the smoothed float buffer ──
    const imgData = ctx.createImageData(CANVAS_W, CANVAS_H)
    const pixels = imgData.data
    for (let i = 0; i < CANVAS_W * CANVAS_H; i++) {
      const pixelIdx = i * 4
      if (!maskBuf[i]) {
        pixels[pixelIdx + 3] = 0
        continue
      }
      const [r, g, b, a] = sampleColormap(src[i], vmin, vmax, palette)
      pixels[pixelIdx]     = r
      pixels[pixelIdx + 1] = g
      pixels[pixelIdx + 2] = b
      pixels[pixelIdx + 3] = Math.round(a * 0.85)
    }
    ctx.putImageData(imgData, 0, 0)

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
