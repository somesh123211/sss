/**
 * TypeScript types for the Ocean Digital Twin platform
 */

export interface GeoBBox {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

export interface DatasetStatus {
  argo: 'ready' | 'not_ready' | 'loading' | 'error'
  hycom: 'ready' | 'stub' | 'loading' | 'error'
}

export type OceanVariable = 'temperature' | 'salinity' | 'current_speed'

export interface SceneState {
  variable: OceanVariable
  depth_m: number          // display depth in meters (pressure dbar ≈ depth m for prototype)
  time_index: number
  show_argo: boolean
  show_currents: boolean
  show_model: boolean
  vertical_exaggeration: number
  opacity: number
}

export interface SelectedFloat {
  platform_number: number
  cycle_number: number
  latitude: number
  longitude: number
  time: string
}
