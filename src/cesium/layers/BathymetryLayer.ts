import * as Cesium from 'cesium'
import { api } from '../../services/api'
import { BATHYMETRY_SCALE, sampleColormap } from '../utils/colors'
import { boundsToRectangle } from '../utils/coordinates'

export class BathymetryLayer {
  private viewer: Cesium.Viewer
  private primitive: Cesium.Primitive | null = null
  private visible = true
  private loaded = false

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  public async load(): Promise<void> {
    if (this.loaded) return

    try {
      const data = await api.gebcoGrid()
      if (!data || !data.lat || !data.lon || !data.elevation) return

      const nLat = data.lat.length
      const nLon = data.lon.length
      const latMin = data.lat[0]
      const latMax = data.lat[nLat - 1]
      const lonMin = data.lon[0]
      const lonMax = data.lon[nLon - 1]

      // Render elevation into an offscreen canvas
      const canvas = document.createElement('canvas')
      canvas.width = nLon
      canvas.height = nLat
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const imgData = ctx.createImageData(nLon, nLat)
      const pixels = imgData.data

      // Elevation ranges: vmin ~ -6000m (trench) to vmax ~ 0m (shelf/coast)
      const vmin = Math.min(-6000, data.vmin)
      const vmax = 0

      for (let i = 0; i < nLat; i++) {
        // Cesium canvas Y=0 is top (latMax)
        const row = nLat - 1 - i
        for (let j = 0; j < nLon; j++) {
          const elev = data.elevation[row]?.[j] ?? 0
          const pixelIdx = (i * nLon + j) * 4
          if (elev > 50) {
            // Land area: transparent or dark land tint
            pixels[pixelIdx] = 12
            pixels[pixelIdx + 1] = 20
            pixels[pixelIdx + 2] = 24
            pixels[pixelIdx + 3] = 40
          } else {
            const [r, g, b, a] = sampleColormap(elev, vmin, vmax, BATHYMETRY_SCALE)
            pixels[pixelIdx] = r
            pixels[pixelIdx + 1] = g
            pixels[pixelIdx + 2] = b
            pixels[pixelIdx + 3] = Math.round(a * 0.88)
          }
        }
      }
      ctx.putImageData(imgData, 0, 0)

      // Create Cesium GroundPrimitive with Rectangle
      const rect = boundsToRectangle(latMin, latMax, lonMin, lonMax)
      const instance = new Cesium.GeometryInstance({
        geometry: new Cesium.RectangleGeometry({
          rectangle: rect,
          height: -20, // slightly below surface
        }),
        id: { type: 'bathymetry', name: 'GEBCO Indian Ocean Bathymetry' },
      })

      const material = new Cesium.Material({
        fabric: {
          type: 'Image',
          uniforms: {
            image: canvas.toDataURL(),
            alpha: 0.88,
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
      this.loaded = true
    } catch (err) {
      console.warn('BathymetryLayer load warning (using base globe):', err)
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (this.primitive) {
      this.primitive.show = visible
    }
  }

  public destroy(): void {
    if (this.primitive && !this.viewer.scene.isDestroyed()) {
      try {
        this.viewer.scene.primitives.remove(this.primitive)
        this.primitive = null
      } catch (e) {
        console.warn('Error removing bathymetry primitive:', e)
      }
    }
    this.loaded = false
  }
}
