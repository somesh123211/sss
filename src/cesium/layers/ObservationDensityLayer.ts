import * as Cesium from 'cesium'
import { ArgoFloat } from '../../services/api'
import { boundsToRectangle } from '../utils/coordinates'

export class ObservationDensityLayer {
  private viewer: Cesium.Viewer
  private primitive: Cesium.Primitive | null = null
  private visible = false
  private floats: ArgoFloat[] = []

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  public setFloats(floats: ArgoFloat[]): void {
    this.floats = floats
    if (this.visible) {
      this.render()
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (visible && !this.primitive) {
      this.render()
    } else if (this.primitive) {
      this.primitive.show = visible
    }
  }

  private render(): void {
    if (this.floats.length === 0) return

    // Bin floats into a 2° x 2° spatial grid over the Indian Ocean
    const latMin = -30
    const latMax = 30
    const lonMin = 40
    const lonMax = 110
    const resolution = 2.0

    const nLat = Math.ceil((latMax - latMin) / resolution)
    const nLon = Math.ceil((lonMax - lonMin) / resolution)
    const grid: number[][] = Array.from({ length: nLat }, () => new Array(nLon).fill(0))

    let maxDensity = 1
    for (const f of this.floats) {
      if (f.latitude >= latMin && f.latitude <= latMax && f.longitude >= lonMin && f.longitude <= lonMax) {
        const i = Math.min(nLat - 1, Math.floor((f.latitude - latMin) / resolution))
        const j = Math.min(nLon - 1, Math.floor((f.longitude - lonMin) / resolution))
        grid[i][j] += 1
        if (grid[i][j] > maxDensity) maxDensity = grid[i][j]
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = nLon
    canvas.height = nLat
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imgData = ctx.createImageData(nLon, nLat)
    const pixels = imgData.data

    for (let i = 0; i < nLat; i++) {
      const row = nLat - 1 - i
      for (let j = 0; j < nLon; j++) {
        const count = grid[row][j]
        const pixelIdx = (i * nLon + j) * 4
        if (count === 0) {
          pixels[pixelIdx] = 0
          pixels[pixelIdx + 1] = 0
          pixels[pixelIdx + 2] = 0
          pixels[pixelIdx + 3] = 0
        } else {
          const ratio = Math.min(1.0, count / maxDensity)
          // Magenta to cyan density scale
          pixels[pixelIdx] = Math.round(255 * ratio)
          pixels[pixelIdx + 1] = Math.round(180 * (1 - ratio))
          pixels[pixelIdx + 2] = 255
          pixels[pixelIdx + 3] = Math.round(160 * ratio + 40)
        }
      }
    }
    ctx.putImageData(imgData, 0, 0)

    if (this.primitive && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = null
    }

    const rect = boundsToRectangle(latMin, latMax, lonMin, lonMax)
    const instance = new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle: rect,
        height: 10,
      }),
      id: { type: 'density_layer', maxDensity, totalFloats: this.floats.length },
    })

    const material = new Cesium.Material({
      fabric: {
        type: 'Image',
        uniforms: {
          image: canvas.toDataURL(),
          alpha: 0.8,
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

  public destroy(): void {
    if (this.primitive && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.primitive)
      this.primitive = null
    }
  }
}
