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
      // Use fixed oceanographic range for Indian Ocean salinity (PSU).
      // Dynamic per-tile min/max stretches the full palette over tiny variations,
      // causing jarring colour jumps. Fixed bounds give a stable, comparable view.
      vmin = 31.5
      vmax = 37.5
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

    const imgData = ctx.createImageData(CANVAS_W, CANVAS_H)
    const pixels = imgData.data

    for (let py = 0; py < CANVAS_H; py++) {
      for (let px = 0; px < CANVAS_W; px++) {
        // Map canvas pixel to fractional grid coordinates
        const fi = (CANVAS_H - 1 - py) / (CANVAS_H - 1) * (nLat - 1)  // lat axis (flip Y)
        const fj = px / (CANVAS_W - 1) * (nLon - 1)                     // lon axis

        // Bilinear interpolation corners
        const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, nLat - 1)
        const j0 = Math.floor(fj), j1 = Math.min(j0 + 1, nLon - 1)
        const ti = fi - i0,        tj = fj - j0

        const v00 = data.values[i0]?.[j0]
        const v01 = data.values[i0]?.[j1]
        const v10 = data.values[i1]?.[j0]
        const v11 = data.values[i1]?.[j1]

        // Collect valid neighbours for interpolation
        const vals = [v00, v01, v10, v11]
        const valid = vals.filter(v => v !== null && v !== undefined && !isNaN(v as number)) as number[]

        const pixelIdx = (py * CANVAS_W + px) * 4
        if (valid.length === 0) {
          pixels[pixelIdx + 3] = 0  // transparent (land/missing)
          continue
        }

        let val: number
        if (valid.length === 4) {
          // Full bilinear interpolation
          val = (v00 as number) * (1 - ti) * (1 - tj) +
                (v01 as number) * (1 - ti) * tj +
                (v10 as number) * ti * (1 - tj) +
                (v11 as number) * ti * tj
        } else {
          // Partial — use mean of valid neighbours
          val = valid.reduce((a, b) => a + b, 0) / valid.length
        }

        const [r, g, b, a] = sampleColormap(val, vmin, vmax, palette)
        pixels[pixelIdx]     = r
        pixels[pixelIdx + 1] = g
        pixels[pixelIdx + 2] = b
        pixels[pixelIdx + 3] = Math.round(a * 0.85)
      }
    }

    // Draw raw data to an intermediate canvas, then composite with blur
    // onto the final canvas to smooth sharp ocean fronts / data boundaries.
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = CANVAS_W
    rawCanvas.height = CANVAS_H
    const rawCtx = rawCanvas.getContext('2d')!
    rawCtx.putImageData(imgData, 0, 0)

    // Apply blur on final canvas using CSS filter (works with drawImage)
    ctx.filter = 'blur(12px)'
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
