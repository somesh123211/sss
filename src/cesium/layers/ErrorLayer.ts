import * as Cesium from 'cesium'
import { OceanVariable } from '../types'
import { DIVERGING_BIAS_SCALE, valueToCesiumColor } from '../utils/colors'
import { oceanDepthToCartesian } from '../utils/coordinates'

export interface AnomalyItem {
  platform_number: number
  cycle_number: number
  latitude: number
  longitude: number
  observed: number
  model: number
  bias: number
  units: string
}

export class ErrorLayer {
  private viewer: Cesium.Viewer
  private pointCollection: Cesium.PointPrimitiveCollection | null = null
  private visible = false
  private variable: OceanVariable = 'temperature'
  private depth_m = 0
  private verticalExaggeration = 1.0

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
    this.pointCollection = new Cesium.PointPrimitiveCollection()
    this.viewer.scene.primitives.add(this.pointCollection)
  }

  public async update(params: {
    variable?: OceanVariable
    depth_m?: number
    verticalExaggeration?: number
    visible?: boolean
  }): Promise<void> {
    if (params.variable !== undefined) this.variable = params.variable
    if (params.depth_m !== undefined) this.depth_m = params.depth_m
    if (params.verticalExaggeration !== undefined) this.verticalExaggeration = params.verticalExaggeration
    if (params.visible !== undefined) this.visible = params.visible

    if (this.pointCollection) this.pointCollection.show = this.visible
    if (!this.visible) return

    try {
      const url = new URL('/api/comparison/anomalies', window.location.origin)
      url.searchParams.set('variable', this.variable)
      url.searchParams.set('depth_m', String(this.depth_m))

      const res = await fetch(url.toString())
      if (!res.ok) return
      const data = await res.json()

      if (!data || !data.anomalies || !Array.isArray(data.anomalies)) return

      this.render(data.anomalies)
    } catch (err) {
      console.warn('ErrorLayer update warning:', err)
    }
  }

  private render(anomalies: AnomalyItem[]): void {
    if (!this.pointCollection) return
    this.pointCollection.removeAll()

    // Bias range: -2.0 to +2.0 for temperature, -0.5 to +0.5 for salinity
    const vmin = this.variable === 'salinity' ? -0.5 : -2.0
    const vmax = this.variable === 'salinity' ? 0.5 : 2.0

    for (let i = 0; i < anomalies.length; i++) {
      const a = anomalies[i]
      if (a.latitude == null || a.longitude == null || a.bias == null) continue

      const pos = oceanDepthToCartesian(a.latitude, a.longitude, this.depth_m, this.verticalExaggeration)
      const color = valueToCesiumColor(a.bias, vmin, vmax, DIVERGING_BIAS_SCALE, 0.95)

      this.pointCollection.add({
        position: pos,
        color,
        pixelSize: 12,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2.0,
        id: {
          type: 'error_cell',
          platform_number: a.platform_number,
          cycle_number: a.cycle_number,
          latitude: a.latitude,
          longitude: a.longitude,
          observed: a.observed,
          model: a.model,
          bias: a.bias,
          units: a.units,
          variable: this.variable,
          depth_m: this.depth_m,
          source: 'Model vs. Observation Colocation Engine',
        },
      })
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (this.pointCollection) this.pointCollection.show = visible
  }

  public destroy(): void {
    if (this.pointCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.pointCollection)
      this.pointCollection = null
    }
  }
}
