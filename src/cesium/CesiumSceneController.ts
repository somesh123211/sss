import * as Cesium from 'cesium'
import {
  OceanVisualizationState,
  VisualizationAction,
  SelectedObject,
} from './types'
import { OceanSurfaceLayer } from './layers/OceanSurfaceLayer'
import { BathymetryLayer } from './layers/BathymetryLayer'
import { ArgoLayer } from './layers/ArgoLayer'
import { GliderLayer } from './layers/GliderLayer'
import { ModelFieldLayer } from './layers/ModelFieldLayer'
import { CurrentLayer } from './layers/CurrentLayer'
import { ErrorLayer } from './layers/ErrorLayer'
import { ObservationDensityLayer } from './layers/ObservationDensityLayer'
import { BoundaryLayer } from './layers/BoundaryLayer'
import { EntityPicker } from './interactions/EntityPicker'
import { CameraController } from './interactions/CameraController'
import { SelectionController } from './interactions/SelectionController'
import { OceanClockController } from './time/OceanClock'
import { ArgoFloat } from '../services/api'
import { INDIAN_OCEAN_REGIONS } from './utils/coordinates'

export class CesiumSceneController {
  public viewer: Cesium.Viewer
  public camera: CameraController
  public selection: SelectionController
  public clock: OceanClockController | null = null

  // Layers
  public oceanSurface: OceanSurfaceLayer
  public bathymetry: BathymetryLayer
  public argo: ArgoLayer
  public glider: GliderLayer
  public modelField: ModelFieldLayer
  public currents: CurrentLayer
  public errorLayer: ErrorLayer
  public densityLayer: ObservationDensityLayer
  public boundaries: BoundaryLayer

  private picker: EntityPicker

  constructor(
    viewer: Cesium.Viewer,
    onSelectObject: (obj: SelectedObject | null) => void,
    onTimeChange: (timeMs: number, timeIso: string, timeIndex: number) => void
  ) {
    this.viewer = viewer

    // Initialize controllers
    this.selection = new SelectionController()
    this.selection.subscribe(onSelectObject)

    this.camera = new CameraController(this.viewer)
    this.picker = new EntityPicker(this.viewer, obj => this.selection.select(obj))

    // Initialize layers
    this.oceanSurface = new OceanSurfaceLayer(this.viewer)
    this.bathymetry = new BathymetryLayer(this.viewer)
    this.argo = new ArgoLayer(this.viewer)
    this.glider = new GliderLayer(this.viewer)
    this.modelField = new ModelFieldLayer(this.viewer)
    this.currents = new CurrentLayer(this.viewer)
    this.errorLayer = new ErrorLayer(this.viewer)
    this.densityLayer = new ObservationDensityLayer(this.viewer)
    this.boundaries = new BoundaryLayer(this.viewer)

    // Setup base atmospheric ocean
    this.oceanSurface.initialize()

    // Initialize Clock
    this.clock = new OceanClockController(
      this.viewer,
      '2018-01-01',
      '2025-04-01',
      onTimeChange
    )

    // Load initial data layers
    this.bathymetry.load()
    this.glider.load()

    // Smooth initial fly-in to Indian Ocean
    this.camera.flyToDefaultIndianOcean()
  }

  public setArgoFloats(floats: ArgoFloat[]): void {
    this.argo.setFloats(floats)
    this.densityLayer.setFloats(floats)
  }

  public updateState(state: OceanVisualizationState): void {
    // 1. Layer Visibilities
    this.bathymetry.setVisible(state.layers.bathymetry)
    this.argo.setVisible(state.layers.argo)
    this.glider.setVisible(state.layers.glider)
    this.boundaries.setVisible(state.layers.boundaries)
    this.densityLayer.setVisible(state.layers.observation_density)

    // 2. Vertical Exaggeration
    this.argo.setVerticalExaggeration(state.vertical_exaggeration)
    this.glider.setVerticalExaggeration(state.vertical_exaggeration)

    // 3. Dynamic Model Slice
    this.modelField.update({
      variable: state.variable,
      depth_m: state.depth_m,
      time_index: state.time_index,
      verticalExaggeration: state.vertical_exaggeration,
      visible: state.layers.model_slice,
    })

    // 4. Current Vectors & Particles
    this.currents.update({
      depth_m: state.depth_m,
      time_index: state.time_index,
      verticalExaggeration: state.vertical_exaggeration,
      visible: state.layers.current_vectors,
      particlesVisible: state.layers.current_particles,
    })

    // 5. Model Error Layer
    this.errorLayer.update({
      variable: state.variable,
      depth_m: state.depth_m,
      verticalExaggeration: state.vertical_exaggeration,
      visible: state.layers.model_error,
    })
  }

  public executeAction(action: VisualizationAction): void {
    const payload = action.payload ?? {}

    switch (action.action) {
      case 'SET_REGION': {
        const regionKey = (payload.region_id ?? 'indian_ocean').toUpperCase()
        const region =
          INDIAN_OCEAN_REGIONS[regionKey as keyof typeof INDIAN_OCEAN_REGIONS] ??
          INDIAN_OCEAN_REGIONS.INDIAN_OCEAN
        this.camera.flyToRegion(region)
        break
      }
      case 'FLY_TO': {
        if (payload.lat !== undefined && payload.lon !== undefined) {
          this.camera.flyToCoordinates(payload.lat, payload.lon, payload.range)
        }
        break
      }
      case 'RESET_VIEW': {
        this.camera.resetView()
        break
      }
      case 'SELECT_PLATFORM': {
        if (payload.platform_number !== undefined) {
          this.argo.selectFloat({
            platform_number: payload.platform_number,
            cycle_number: payload.cycle_number ?? 1,
            latitude: payload.lat ?? 0,
            longitude: payload.lon ?? 0,
            time: payload.time_iso ?? new Date().toISOString(),
          })
        }
        break
      }
      case 'SHOW_LAYER': {
        if (payload.layer_id === 'model_error') {
          this.errorLayer.setVisible(true)
        } else if (payload.layer_id === 'bathymetry') {
          this.bathymetry.setVisible(true)
        } else if (payload.layer_id === 'current_vectors') {
          this.currents.update({ visible: true })
        }
        break
      }
      case 'SHOW_ERROR_MAP': {
        this.errorLayer.setVisible(true)
        if (payload.variable) {
          this.errorLayer.update({ variable: payload.variable, visible: true })
        }
        break
      }
    }
  }

  public destroy(): void {
    this.picker.destroy()
    this.oceanSurface.destroy()
    this.bathymetry.destroy()
    this.argo.destroy()
    this.glider.destroy()
    this.modelField.destroy()
    this.currents.destroy()
    this.errorLayer.destroy()
    this.densityLayer.destroy()
    this.boundaries.destroy()
    if (this.clock) {
      this.clock.destroy()
      this.clock = null
    }
  }
}
