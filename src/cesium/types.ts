/**
 * Core type definitions for CesiumJS 3D Ocean Digital Twin
 */

import * as Cesium from 'cesium'

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

export type ModelSourceId = 'igora' | 'hycom' | 'copernicus'

export interface OceanRegionPreset {
  id: string
  name: string
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
  heading?: number
  pitch?: number
  range?: number
}

export interface OceanLayerVisibility {
  ocean_surface: boolean
  bathymetry: boolean
  argo: boolean
  argo_tracks: boolean
  glider: boolean
  model_slice: boolean
  current_vectors: boolean
  current_particles: boolean
  model_error: boolean
  observation_density: boolean
  boundaries: boolean
  volume_3d: boolean
}

export interface OceanVisualizationState {
  model_id: ModelSourceId
  variable: OceanVariable
  depth_m: number
  time_index: number
  time_iso: string
  vertical_exaggeration: number
  layers: OceanLayerVisibility
  selected_region: OceanRegionPreset
  particle_density: 'low' | 'medium' | 'high'
  particle_speed: number
  volume_quality: 'low' | 'medium' | 'high'
  volume_opacity: number
}

export type SelectedObjectType = 'argo' | 'glider' | 'model_cell' | 'error_cell' | 'region' | 'point_factors'

export interface SelectedObject {
  type: SelectedObjectType
  id: string | number
  title: string
  position: { lat: number; lon: number; depth_m?: number }
  time?: string
  variable?: string
  value?: number | null
  unit?: string
  source?: string
  metadata?: Record<string, unknown>
  provenance?: Record<string, unknown>
  stats?: {
    bias?: number | null
    rmse?: number | null
    mae?: number | null
    count?: number
    confidence?: string
  }
}

export type VisualizationActionType =
  | 'SET_REGION'
  | 'SET_VARIABLE'
  | 'SET_DEPTH'
  | 'SET_TIME'
  | 'SET_MODEL'
  | 'SHOW_LAYER'
  | 'HIDE_LAYER'
  | 'SELECT_PLATFORM'
  | 'SHOW_ERROR_MAP'
  | 'FLY_TO'
  | 'RESET_VIEW'

export interface VisualizationAction {
  action: VisualizationActionType
  payload?: {
    region_id?: string
    variable?: OceanVariable
    depth_m?: number
    time_index?: number
    time_iso?: string
    model_id?: ModelSourceId
    layer_id?: keyof OceanLayerVisibility
    platform_number?: number
    cycle_number?: number
    lat?: number
    lon?: number
    range?: number
    heading?: number
    pitch?: number
  }
}
