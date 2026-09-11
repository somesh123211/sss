import * as Cesium from 'cesium'
import { api } from '../../services/api'
import { oceanDepthToCartesian } from '../utils/coordinates'

export class GliderLayer {
  private viewer: Cesium.Viewer
  private pointCollection: Cesium.PointPrimitiveCollection | null = null
  private polylineCollection: Cesium.PolylineCollection | null = null
  private visible = true
  private loaded = false
  private verticalExaggeration = 1.0

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
    this.pointCollection = new Cesium.PointPrimitiveCollection()
    this.polylineCollection = new Cesium.PolylineCollection()
    this.viewer.scene.primitives.add(this.pointCollection)
    this.viewer.scene.primitives.add(this.polylineCollection)
  }

  public async load(missionId = 'INCOIS-GLIDER-BOB-01'): Promise<void> {
    if (this.loaded) return

    try {
      const data = await api.gliderTrajectory(missionId)
      if (!data || !data.waypoints || data.waypoints.length === 0) return

      if (this.pointCollection) this.pointCollection.removeAll()
      if (this.polylineCollection) this.polylineCollection.removeAll()

      const positions: Cesium.Cartesian3[] = []

      for (let i = 0; i < data.waypoints.length; i++) {
        const wp = data.waypoints[i]
        const pos = oceanDepthToCartesian(wp.lat, wp.lon, 0, this.verticalExaggeration)
        positions.push(pos)

        const isLatest = i === data.waypoints.length - 1
        const color = isLatest
          ? Cesium.Color.fromCssColorString('#ffd700')
          : Cesium.Color.fromCssColorString('#ff9900')

        if (this.pointCollection) {
          this.pointCollection.add({
            position: pos,
            color,
            pixelSize: isLatest ? 10 : 6,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1.5,
            id: {
              type: 'glider',
              mission_id: data.mission_id,
              point_id: wp.point_id,
              latitude: wp.lat,
              longitude: wp.lon,
              time: wp.time,
              temp_surface: wp.temp_surface,
              sal_surface: wp.sal_surface,
              chla_surface: wp.chla_surface,
              source: 'IFREMER / INCOIS OceanGliders',
            },
          })
        }
      }

      if (this.polylineCollection && positions.length > 1) {
        this.polylineCollection.add({
          positions,
          width: 3.0,
          material: Cesium.Material.fromType('Color', {
            color: Cesium.Color.fromCssColorString('#ff9900').withAlpha(0.85),
          }),
          id: {
            type: 'glider_track',
            mission_id: data.mission_id,
            total_points: data.waypoints.length,
          },
        })
      }

      this.loaded = true
    } catch (err) {
      console.warn('GliderLayer load warning:', err)
    }
  }

  public setVerticalExaggeration(exaggeration: number): void {
    this.verticalExaggeration = exaggeration
    this.loaded = false
    this.load()
  }

  public setVisible(visible: boolean): void {
    this.visible = visible
    if (this.pointCollection) this.pointCollection.show = visible
    if (this.polylineCollection) this.polylineCollection.show = visible
  }

  public destroy(): void {
    if (this.pointCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.pointCollection)
      this.pointCollection = null
    }
    if (this.polylineCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.polylineCollection)
      this.polylineCollection = null
    }
    this.loaded = false
  }
}
