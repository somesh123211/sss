import * as Cesium from 'cesium'
import { INDIAN_OCEAN_REGIONS } from '../utils/coordinates'

export class BoundaryLayer {
  private viewer: Cesium.Viewer
  private polylineCollection: Cesium.PolylineCollection | null = null
  private labelCollection: Cesium.LabelCollection | null = null
  private visible = true

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
    this.polylineCollection = new Cesium.PolylineCollection()
    this.labelCollection = new Cesium.LabelCollection()
    this.viewer.scene.primitives.add(this.polylineCollection)
    this.viewer.scene.primitives.add(this.labelCollection)
    this.render()
  }

  private render(): void {
    if (!this.polylineCollection || !this.labelCollection) return
    this.polylineCollection.removeAll()
    this.labelCollection.removeAll()

    const regions = Object.values(INDIAN_OCEAN_REGIONS)

    for (const r of regions) {
      if (r.id === 'indian_ocean') continue // Skip full overview box

      const corners = [
        Cesium.Cartesian3.fromDegrees(r.lon_min, r.lat_min, 100),
        Cesium.Cartesian3.fromDegrees(r.lon_max, r.lat_min, 100),
        Cesium.Cartesian3.fromDegrees(r.lon_max, r.lat_max, 100),
        Cesium.Cartesian3.fromDegrees(r.lon_min, r.lat_max, 100),
        Cesium.Cartesian3.fromDegrees(r.lon_min, r.lat_min, 100),
      ]

      this.polylineCollection.add({
        positions: corners,
        width: 1.5,
        material: Cesium.Material.fromType('Color', {
          color: Cesium.Color.fromCssColorString('#00d4ff').withAlpha(0.4),
        }),
        id: { type: 'region_boundary', id: r.id, name: r.name },
      })

      const centerLon = (r.lon_min + r.lon_max) / 2
      const centerLat = (r.lat_min + r.lat_max) / 2

      this.labelCollection.add({
        position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 500),
        text: r.name.toUpperCase(),
        font: '12px "Inter", "Segoe UI", sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#8ba7bb').withAlpha(0.85),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(500000, 15000000),
      })
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (this.polylineCollection) this.polylineCollection.show = visible
    if (this.labelCollection) this.labelCollection.show = visible
  }

  public destroy(): void {
    if (this.polylineCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.polylineCollection)
      this.polylineCollection = null
    }
    if (this.labelCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.labelCollection)
      this.labelCollection = null
    }
  }
}
