import * as Cesium from 'cesium'
import { OceanRegionPreset } from '../types'
import { INDIAN_OCEAN_REGIONS } from '../utils/coordinates'

export class CameraController {
  private viewer: Cesium.Viewer

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  public flyToDefaultIndianOcean(duration = 2.5): void {
    const defaultRegion = INDIAN_OCEAN_REGIONS.INDIAN_OCEAN
    this.flyToRegion(defaultRegion, duration)
  }

  public flyToRegion(region: OceanRegionPreset, duration = 2.0): void {
    const centerLon = (region.lon_min + region.lon_max) / 2
    const centerLat = (region.lat_min + region.lat_max) / 2
    const range = region.range ?? 4500000

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, range),
      orientation: {
        heading: Cesium.Math.toRadians(region.heading ?? 0),
        pitch: Cesium.Math.toRadians(region.pitch ?? -45),
        roll: 0.0,
      },
      duration,
    })
  }

  public flyToCoordinates(lat: number, lon: number, altitude = 800000, duration = 1.5): void {
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-50),
        roll: 0.0,
      },
      duration,
    })
  }

  public resetView(): void {
    this.flyToDefaultIndianOcean(1.8)
  }

  public zoomIn(): void {
    this.viewer.camera.zoomIn(this.viewer.camera.positionCartographic.height * 0.3)
  }

  public zoomOut(): void {
    this.viewer.camera.zoomOut(this.viewer.camera.positionCartographic.height * 0.3)
  }
}
