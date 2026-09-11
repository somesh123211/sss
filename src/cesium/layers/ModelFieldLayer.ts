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
      vmin = data.vmin ?? 32
      vmax = data.vmax ?? 37
    } else if (this.variable === 'current_speed') {
      palette = SPEED_SCALE
      vmin = data.vmin ?? 0
      vmax = data.vmax ?? 1.5
    }

    const canvas = document.createElement('canvas')
    canvas.width = nLon
    canvas.height = nLat
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imgData = ctx.createImageData(nLon, nLat)
    const pixels = imgData.data

    for (let i = 0; i < nLat; i++) {
      const row = nLat - 1 - i // Invert Y for canvas
      for (let j = 0; j < nLon; j++) {
        const val = data.values[row]?.[j]
        const pixelIdx = (i * nLon + j) * 4
        if (val === null || val === undefined || isNaN(val)) {
          // Land or missing value
          pixels[pixelIdx] = 0
          pixels[pixelIdx + 1] = 0
          pixels[pixelIdx + 2] = 0
          pixels[pixelIdx + 3] = 0
        } else {
          const [r, g, b, a] = sampleColormap(val, vmin, vmax, palette)
          pixels[pixelIdx] = r
          pixels[pixelIdx + 1] = g
          pixels[pixelIdx + 2] = b
          pixels[pixelIdx + 3] = Math.round(a * 0.85)
        }
      }
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
