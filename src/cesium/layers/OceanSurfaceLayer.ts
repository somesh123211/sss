import * as Cesium from 'cesium'

export class OceanSurfaceLayer {
  private viewer: Cesium.Viewer

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
  }

  public initialize(): void {
    const scene = this.viewer.scene
    const globe = scene.globe

    // Enable high quality atmospheric lighting
    globe.enableLighting = true
    globe.atmosphereBrightnessShift = 0.1
    globe.oceanNormalMapUrl = Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg')

    // Base ocean color
    globe.baseColor = Cesium.Color.fromCssColorString('#021226')

    // Depth test against terrain / bathymetry
    globe.depthTestAgainstTerrain = true
  }

  public setVisible(_visible: boolean): void {
    // Ocean surface is intrinsic to Cesium globe
  }

  public destroy(): void {
    // Cleanup if any custom post-processes added
  }
}
