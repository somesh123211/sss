/**
 * TypeScript types for the Ocean Digital Twin platform
 */

export interface GeoBBox {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

export type ViewMode = 'ocean3d' | 'cesium' | 'map2d' | 'cube' | 'split' | '3d' | 'map' | 'globe'

export type OceanVariable =
  | 'temperature'
  | 'salinity'
  | 'current'
  | 'current_speed'
  | 'u'
  | 'v'
  | 'u_current'
  | 'v_current'
  | 'sound_velocity'
  | 'density'
  | 'oxygen'
  | 'ssh'

export interface ProvenanceInfo {
  source: string
  type: 'real' | 'synthetic' | 'fallback' | 'demo'
  dataset?: string
  fallbackUsed?: boolean
  timestamp?: string
  spatial_extent?: string
  resolution?: string
  units?: string
}

export interface DatasetStatus {
  argo: 'ready' | 'not_ready' | 'loading' | 'error'
  hycom: 'ready' | 'stub' | 'loading' | 'error'
  glider?: 'ready' | 'not_ready' | 'loading' | 'error'
  gebco?: 'ready' | 'not_ready' | 'loading' | 'error'
}

export interface SceneState {
  variable: OceanVariable
  depth_m: number
  time_index: number
  show_argo: boolean
  show_currents: boolean
  show_model: boolean
  show_glider: boolean
  show_bathymetry: boolean
  vertical_exaggeration: number
  opacity: number
}

export interface SelectedFloat {
  platform_number: number
  cycle_number: number
  latitude: number
  longitude: number
  time: string
  pres_min?: number
  pres_max?: number
  n_levels?: number
  temp_surface?: number | null
  psal_surface?: number | null
  profiler_type?: string
  data_centre?: string
  provenance_type?: string
}

export interface SelectedGliderPoint {
  mission_id: string
  point_id: number
  lat: number
  lon: number
  latitude?: number
  longitude?: number
  depth_m?: number
  time: string
  temp?: number
  sal?: number
  chla?: number
  temp_surface?: number | null
  sal_surface?: number | null
  chla_surface?: number | null
}

export interface SelectedObservationObject {
  type: 'argo' | 'glider' | 'buoy'
  id: string
  lat: number
  lon: number
  depth_m: number
  time: string
  temp?: number
  sal?: number
}

export type SelectedObservation =
  | SelectedObservationObject
  | { type: 'argo'; data: SelectedFloat }
  | { type: 'glider'; data: SelectedGliderPoint }

export interface OceanPointFactors {
  lat: number
  lon: number
  depth_m: number
  temperature_c: number
  salinity_psu: number
  u_ms?: number
  v_ms?: number
  current_speed_ms?: number
  current_direction_deg?: number
  density_kg_m3?: number
  sound_velocity_ms?: number
  dissolved_oxygen_umol_kg?: number
  pressure_dbar?: number
  seafloor_depth_m?: number
  provenance?: ProvenanceInfo
}

export interface OceanVisualizationState {
  modelSource: string
  variable: OceanVariable
  time: string
  depth: number
  latitude: number
  longitude: number
  bbox?: GeoBBox
  selectedFloat?: SelectedFloat | null
  selectedGlider?: SelectedGliderPoint | null
  selectedObservation?: SelectedObservation | null
  comparisonEnabled: boolean
  viewMode: ViewMode
  provenance?: ProvenanceInfo
}
