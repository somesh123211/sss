import * as Cesium from 'cesium'
import { ArgoFloat, api } from '../../services/api'
import { SelectedFloat } from '../../types'
import { oceanDepthToCartesian } from '../utils/coordinates'
import { THERMAL_SCALE, valueToCesiumColor } from '../utils/colors'

export class ArgoLayer {
  private viewer: Cesium.Viewer
  private pointCollection: Cesium.PointPrimitiveCollection | null = null
  private trajectoryCollection: Cesium.PolylineCollection | null = null
  private floats: ArgoFloat[] = []
  private visible = true
  private selectedPlatform: number | null = null
  private selectedCycle: number | null = null
  private verticalExaggeration = 1.0
  private currentTimeMs = Date.now()

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
    this.pointCollection = new Cesium.PointPrimitiveCollection()
    this.trajectoryCollection = new Cesium.PolylineCollection()
    this.viewer.scene.primitives.add(this.pointCollection)
    this.viewer.scene.primitives.add(this.trajectoryCollection)
  }

  public setFloats(floats: ArgoFloat[]): void {
    this.floats = floats
    this.render()
  }

  public setVerticalExaggeration(exaggeration: number): void {
    this.verticalExaggeration = exaggeration
    this.render()
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (this.pointCollection) this.pointCollection.show = visible
    if (this.trajectoryCollection) this.trajectoryCollection.show = visible
  }

  public setTime(timeMs: number): void {
    this.currentTimeMs = timeMs
    this.updateVisibilityByTime()
  }

  public async selectFloat(float: SelectedFloat | null): Promise<void> {
    if (!float) {
      this.selectedPlatform = null
      this.selectedCycle = null
      if (this.trajectoryCollection) this.trajectoryCollection.removeAll()
      this.render()
      return
    }

    this.selectedPlatform = float.platform_number
    this.selectedCycle = float.cycle_number
    this.render()

    // Fetch and draw complete trajectory for the selected platform
    try {
      const allPositions = this.floats
        .filter(f => f.platform_number === float.platform_number)
        .sort((a, b) => a.cycle_number - b.cycle_number)

      if (this.trajectoryCollection) {
        this.trajectoryCollection.removeAll()

        if (allPositions.length > 1) {
          const positions = allPositions.map(p =>
            oceanDepthToCartesian(p.latitude, p.longitude, 0, this.verticalExaggeration)
          )

          this.trajectoryCollection.add({
            positions,
            width: 3.5,
            material: Cesium.Material.fromType('Color', {
              color: Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.9),
            }),
            id: {
              type: 'argo_track',
              platform_number: float.platform_number,
              total_cycles: allPositions.length,
            },
          })
        }
      }
    } catch (err) {
      console.warn('Error rendering Argo trajectory:', err)
    }
  }

  public render(): void {
    if (!this.pointCollection) return
    this.pointCollection.removeAll()

    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i]
      if (f.latitude == null || f.longitude == null) continue

      const isSelected =
        f.platform_number === this.selectedPlatform &&
        f.cycle_number === this.selectedCycle

      const isPlatformSelected = f.platform_number === this.selectedPlatform

      const color = isSelected
        ? Cesium.Color.fromCssColorString('#ffffff')
        : isPlatformSelected
        ? Cesium.Color.fromCssColorString('#00ffff')
        : f.temp_surface != null
        ? valueToCesiumColor(f.temp_surface, 15, 32, THERMAL_SCALE, 0.95)
        : Cesium.Color.fromCssColorString('#00d4ff')

      const pixelSize = isSelected ? 14 : isPlatformSelected ? 10 : 7
      const outlineColor = isSelected
        ? Cesium.Color.fromCssColorString('#00d4ff')
        : Cesium.Color.BLACK
      const outlineWidth = isSelected ? 3 : 1.5

      const pos = oceanDepthToCartesian(f.latitude, f.longitude, 0, this.verticalExaggeration)

      this.pointCollection.add({
        position: pos,
        color,
        pixelSize,
        outlineColor,
        outlineWidth,
        id: {
          type: 'argo',
          platform_number: f.platform_number,
          cycle_number: f.cycle_number,
          latitude: f.latitude,
          longitude: f.longitude,
          time: f.time,
          temp_surface: f.temp_surface,
          psal_surface: f.psal_surface,
          n_levels: f.n_levels,
          source: 'INCOIS ERDDAP — Indian_ARGO_Floats',
        },
      })
    }

    this.updateVisibilityByTime()
  }

  private updateVisibilityByTime(): void {
    if (!this.pointCollection) return
    const count = this.pointCollection.length
    for (let i = 0; i < count; i++) {
      const p = this.pointCollection.get(i)
      const floatData = p.id as ArgoFloat
      if (floatData && floatData.time) {
        const t = new Date(floatData.time).getTime()
        p.show = this.visible && t <= this.currentTimeMs
      }
    }
  }

  public destroy(): void {
    if (this.pointCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.pointCollection)
      this.pointCollection = null
    }
    if (this.trajectoryCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.trajectoryCollection)
      this.trajectoryCollection = null
    }
  }
}
