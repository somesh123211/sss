import * as Cesium from 'cesium'
import { SelectedObject } from '../types'

export class EntityPicker {
  private viewer: Cesium.Viewer
  private handler: Cesium.ScreenSpaceEventHandler | null = null
  private onSelectCallback: (obj: SelectedObject | null) => void

  constructor(viewer: Cesium.Viewer, onSelect: (obj: SelectedObject | null) => void) {
    this.viewer = viewer
    this.onSelectCallback = onSelect
    this.initialize()
  }

  private initialize(): void {
    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas)

    this.handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = this.viewer.scene.pick(click.position)

      if (!Cesium.defined(pickedObject) || !pickedObject.id) {
        // Sample ocean surface coordinates on blank click
        const ray = this.viewer.camera.getPickRay(click.position)
        if (ray) {
          const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene)
          if (cartesian) {
            const carto = Cesium.Cartographic.fromCartesian(cartesian)
            const lat = Cesium.Math.toDegrees(carto.latitude)
            const lon = Cesium.Math.toDegrees(carto.longitude)

            this.onSelectCallback({
              type: 'region',
              id: `coord_${lat.toFixed(2)}_${lon.toFixed(2)}`,
              title: `Indian Ocean Coordinates (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
              position: { lat, lon, depth_m: 0 },
              source: 'Cesium Geospatial WGS84',
            })
            return
          }
        }
        this.onSelectCallback(null)
        return
      }

      const id = pickedObject.id as Record<string, unknown>
      const type = id.type as string

      if (type === 'argo') {
        this.onSelectCallback({
          type: 'argo',
          id: `${id.platform_number}_${id.cycle_number}`,
          title: `Argo Float #${id.platform_number} (Cycle ${id.cycle_number})`,
          position: {
            lat: Number(id.latitude),
            lon: Number(id.longitude),
            depth_m: 0,
          },
          time: String(id.time),
          source: String(id.source ?? 'INCOIS ERDDAP'),
          metadata: {
            platform_number: id.platform_number,
            cycle_number: id.cycle_number,
            temp_surface: id.temp_surface,
            psal_surface: id.psal_surface,
            n_levels: id.n_levels,
          },
        })
      } else if (type === 'glider') {
        this.onSelectCallback({
          type: 'glider',
          id: `${id.mission_id}_${id.point_id}`,
          title: `Glider ${id.mission_id} (Point #${id.point_id})`,
          position: {
            lat: Number(id.latitude),
            lon: Number(id.longitude),
            depth_m: 0,
          },
          time: String(id.time),
          source: String(id.source ?? 'IFREMER OceanGliders'),
          metadata: {
            mission_id: id.mission_id,
            point_id: id.point_id,
            temp_surface: id.temp_surface,
            sal_surface: id.sal_surface,
            chla_surface: id.chla_surface,
          },
        })
      } else if (type === 'error_cell') {
        this.onSelectCallback({
          type: 'error_cell',
          id: `bias_${id.platform_number}_${id.cycle_number}`,
          title: `Model Bias at Float #${id.platform_number}`,
          position: {
            lat: Number(id.latitude),
            lon: Number(id.longitude),
            depth_m: Number(id.depth_m ?? 0),
          },
          variable: String(id.variable),
          value: Number(id.bias),
          unit: String(id.units ?? '°C'),
          source: String(id.source ?? 'Co-location Engine'),
          stats: {
            bias: Number(id.bias),
          },
          metadata: {
            observed: id.observed,
            model: id.model,
            depth_m: id.depth_m,
          },
        })
      } else if (type === 'model_slice') {
        this.onSelectCallback({
          type: 'model_cell',
          id: `model_${id.variable}_${id.depth_m}m`,
          title: `Ocean Model ${String(id.variable).toUpperCase()} at ${id.actual_depth_m ?? id.depth_m}m`,
          position: { lat: 15, lon: 75, depth_m: Number(id.depth_m) },
          variable: String(id.variable),
          unit: String(id.units),
          source: String(id.source ?? 'INCOIS IGORA'),
          metadata: {
            depth_m: id.depth_m,
            actual_depth_m: id.actual_depth_m,
            vmin: id.vmin,
            vmax: id.vmax,
          },
        })
      } else if (type === 'region_boundary') {
        this.onSelectCallback({
          type: 'region',
          id: String(id.id),
          title: String(id.name),
          position: { lat: 15, lon: 75 },
          source: 'Indian Ocean Regional Domain',
        })
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }

  public destroy(): void {
    if (this.handler && !this.handler.isDestroyed()) {
      this.handler.destroy()
      this.handler = null
    }
  }
}
