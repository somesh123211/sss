/**
 * API service for Ocean Digital Twin backend
 * Connects to FastAPI at http://localhost:8000 (proxied via Vite /api)
 */

export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api'

export interface HealthStatus {
  status: string
  timestamp: string
  service?: string
  sih_ps?: string
  argo_ready: boolean
  hycom_ready: boolean
  hycom_stub: boolean
  glider_ready?: boolean
  gebco_ready?: boolean
  components: Record<string, string>
}

export interface ArgoMetadata {
  source: string
  data_type: string
  status: string
  total_profiles: number
  unique_platforms: number
  time_range: { start: string; end: string }
  geographic_coverage: {
    lat_min: number
    lat_max: number
    lon_min: number
    lon_max: number
  }
  variables: string[]
  qc_note: string
}

export interface ArgoFloat {
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
  has_suspect_data?: boolean
}

export interface ArgoFloatsResponse {
  count: number
  floats: ArgoFloat[]
  source: string
  filtered?: boolean
}

export interface ArgoProfileData {
  pres: number[]
  temp: number[]
  psal: number[]
  qc_flag: string[]
}

export interface ArgoProfile {
  platform_number: number
  cycle_number: number
  latitude: number
  longitude: number
  time: string
  n_levels: number
  pressure_range_dbar: { min: number; max: number }
  source: string
  qc_note: string
  data: ArgoProfileData
}

export interface ModelMetadata {
  status: string
  source: string
  file?: string
  file_size_mb?: number
  variables: string[]
  lat_range: [number, number]
  lon_range: [number, number]
  depth_levels_m: number[]
  n_depth_levels: number
  grid_lat: number
  grid_lon: number
  time?: string | string[]
  n_time_steps?: number
  dataset_title?: string
  comment?: string
  [key: string]: unknown
}

export interface ComparisonData {
  status: string
  variable: string
  platform_number: number
  cycle_number: number
  argo: {
    lat: number
    lon: number
    time: string
    depths: number[]
    [key: string]: unknown
  }
  model: {
    actual_lat: number
    actual_lon: number
    dist_km: number
    time_index?: number
    model_time?: string
    depths: number[]
    interpolated_at_argo_depths: (number | null)[]
    [key: string]: unknown
  } | null
  bias: {
    depths: number[]
    values: (number | null)[]
  } | null
  stats: {
    n_levels?: number
    mean_bias?: number
    rmse?: number
    std_bias?: number
    max_abs_bias?: number
    correlation?: number | null
  }
}

export interface HYCOMModelSurface {
  variable: string
  units: string
  depth_m?: number
  requested_depth_m?: number
  actual_depth_m?: number
  time_index?: number
  time_utc?: string
  model_time?: string
  lat: number[]
  lon: number[]
  values: (number | null)[][]
  vmin: number
  vmax: number
  shape?: number[]
  provenance_type?: string
}

export interface HYCOMModelCurrentSlice {
  variable?: string
  units?: string
  requested_depth_m?: number
  actual_depth_m?: number
  time_index?: number
  time_utc?: string
  model_time?: string
  lat: number[]
  lon: number[]
  u: (number | null)[][]
  v: (number | null)[][]
  speed: (number | null)[][]
  vmin: number
  vmax: number
  surface?: {
    variable: string
    units: string
    actual_depth_m: number
    requested_depth_m: number
    lat: number[]
    lon: number[]
    values: (number | null)[][]
    vmin: number
    vmax: number
  }
  provenance_type?: string
}

export interface OceanPointFactors {
  status: string
  query: {
    lat: number
    lon: number
    depth_m: number
    time_index: number
  }
  grid_location: {
    actual_lat: number
    actual_lon: number
    dist_km: number
    grid_index: [number, number]
  }
  factors: {
    temperature: number | null
    salinity: number | null
    u_current: number
    v_current: number
    current_speed: number
    current_direction_deg: number
    ssh: number | null
    density_kg_m3: number | null
    sound_speed_m_s: number | null
    layer_name: string
    layer_desc: string
  }
  profile: {
    depth_levels_m: number[]
    temperature: (number | null)[]
    salinity: (number | null)[]
    u_current: (number | null)[]
    v_current: (number | null)[]
    current_speed: (number | null)[]
  }
  source: string
}

export interface GEBCODepthResponse {
  requested_lat: number
  requested_lon: number
  actual_lat: number
  actual_lon: number
  elevation_m: number
  ocean_depth_m: number
  is_land: boolean
  lat?: number
  lon?: number
  depth_m?: number
  is_ocean?: boolean
  provenance_type?: string
  source?: string
}

export interface GEBCOGridResponse {
  lat: number[]
  lon: number[]
  elevation: number[][]
  vmin: number
  vmax: number
  shape: number[]
}

export interface GliderWaypoint {
  point_id: number
  lat: number
  lon: number
  time: string
  temp_surface: number | null
  sal_surface: number | null
  chla_surface: number | null
}

export interface GliderTrajectoryResponse {
  mission_id: string
  platform_code: string
  wmo_code: string
  title: string
  provenance_type?: string
  authenticity_classification?: string
  total_points: number
  depth_levels_m: number[]
  waypoints: GliderWaypoint[]
}

export interface GliderProfileResponse {
  mission_id: string
  point_id: number
  lat: number
  lon: number
  time: string
  depth_m: number[]
  temp: (number | null)[]
  sal: (number | null)[]
  chlorophyll: (number | null)[]
}

export interface GliderMission {
  mission_id: string
  platform_code: string
  wmo_code?: string
  title?: string
  region?: string
  start_time?: string
  end_time?: string
  time_start?: string
  time_end?: string
  total_points?: number
  n_points?: number
  n_depth_levels?: number
  max_depth_m?: number
  variables?: string[]
  has_real_data?: boolean
}

async function apiFetch<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const isAbsolute = API_BASE.startsWith('http://') || API_BASE.startsWith('https://')
  const baseUrl = isAbsolute ? API_BASE : `${window.location.origin}${API_BASE.startsWith('/') ? '' : '/'}${API_BASE}`
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${baseUrl}${normalizedPath}`)

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })
  }

  const response = await fetch(url.toString())
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error ${response.status}: ${errorText}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  async health(): Promise<HealthStatus> {
    return apiFetch<HealthStatus>('/health')
  },

  async argoMetadata(): Promise<ArgoMetadata> {
    return apiFetch<ArgoMetadata>('/argo/metadata')
  },

  async argoFloats(params?: {
    lat_min?: number
    lat_max?: number
    lon_min?: number
    lon_max?: number
    time_start?: string
    time_end?: string
    max_profiles?: number
  }): Promise<ArgoFloatsResponse> {
    return apiFetch<ArgoFloatsResponse>('/argo/floats', params as Record<string, number | string>)
  },

  async argoProfile(platformNumber: number, cycleNumber: number): Promise<ArgoProfile> {
    return apiFetch<ArgoProfile>(`/argo/profile/${platformNumber}/${cycleNumber}`)
  },

  async argoCycles(platformNumber: number): Promise<{ platform_number: number; cycles: number[]; n_cycles: number }> {
    return apiFetch(`/argo/cycles/${platformNumber}`)
  },

  async modelStatus(): Promise<ModelMetadata> {
    return apiFetch<ModelMetadata>('/model/metadata')
  },

  async modelMetadata(): Promise<ModelMetadata> {
    return apiFetch<ModelMetadata>('/model/metadata')
  },

  async modelSurface(variable = 'temperature', time_index = 0): Promise<HYCOMModelSurface> {
    return apiFetch<HYCOMModelSurface>('/model/surface', { variable, time_index })
  },

  async modelDepthSlice(variable = 'temperature', depth_m = 0, time_index = 0): Promise<HYCOMModelSurface> {
    return apiFetch<HYCOMModelSurface>('/model/depth-slice', { variable, depth_m, time_index })
  },

  async modelCurrentSlice(depth_m = 0, time_index = 0): Promise<HYCOMModelCurrentSlice> {
    return apiFetch<HYCOMModelCurrentSlice>('/model/current-slice', { depth_m, time_index })
  },

  async modelPoint(lat: number, lon: number, depth_m = 0, time_index = 0): Promise<OceanPointFactors> {
    return apiFetch<OceanPointFactors>('/model/point', { lat, lon, depth_m, time_index })
  },

  async comparisonProfile(
    platformNumber: number,
    cycleNumber: number,
    variable = 'temperature',
    time_index?: number
  ): Promise<ComparisonData> {
    return apiFetch<ComparisonData>('/comparison/profile', {
      platform_number: platformNumber,
      cycle_number: cycleNumber,
      variable,
      time_index,
    })
  },

  async comparisonAnomalies(params?: {
    lat_min?: number
    lat_max?: number
    lon_min?: number
    lon_max?: number
    variable?: string
    depth_m?: number
  }): Promise<{
    status: string
    variable: string
    depth_m: number
    n_floats: number
    anomalies: Array<{
      platform_number: number
      cycle_number: number
      latitude: number
      longitude: number
      time: string
      time_index?: number
      model_time?: string
      argo_value: number
      model_value: number
      bias: number
      units: string
    }>
    stats: {
      n?: number
      mean_bias?: number
      rmse?: number
      std_bias?: number
      max_abs_bias?: number
    }
  }> {
    return apiFetch('/comparison/anomalies', params as Record<string, number | string>)
  },

  async aiStatus(): Promise<{ status: string; model: string; api_key_set: boolean }> {
    return apiFetch('/ai/status')
  },

  async aiChat(messages: Array<{ role: string; content: string }>, context?: string): Promise<{ status: string; reply: string; model: string }> {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`AI Chat error: ${err}`)
    }
    return res.json()
  },

  async aiAnalyzeProfile(params: {
    float_id: string
    platform_type: string
    lat: number
    lon: number
    date: string
    temp_profile: Array<{ depth: number; temp: number }>
    sal_profile?: Array<{ depth: number; sal: number }>
    user_query?: string
  }): Promise<{ status: string; analysis: string; model: string }> {
    const res = await fetch(`${API_BASE}/ai/analyze-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`AI Analysis error: ${err}`)
    }
    return res.json()
  },

  async gliderMissions(): Promise<{ missions: GliderMission[] }> {
    const res = await apiFetch<any>('/glider/missions')
    if (Array.isArray(res)) return { missions: res }
    return res?.missions ? res : { missions: [] }
  },

  async gliderTrajectory(missionId = 'sea057_20220128'): Promise<GliderTrajectoryResponse> {
    return apiFetch<GliderTrajectoryResponse>(`/glider/trajectory/${missionId}`)
  },

  async gliderProfile(missionId: string, pointId: number): Promise<GliderProfileResponse> {
    return apiFetch<GliderProfileResponse>(`/glider/profile/${missionId}/${pointId}`)
  },

  async gebcoGrid(sample_step = 1): Promise<GEBCOGridResponse> {
    return apiFetch<GEBCOGridResponse>('/bathymetry/grid', { sample_step })
  },

  async gebcoDepth(lat: number, lon: number): Promise<GEBCODepthResponse> {
    const res = await apiFetch<GEBCODepthResponse>('/bathymetry/depth', { lat, lon })
    return {
      ...res,
      lat: res.actual_lat ?? lat,
      lon: res.actual_lon ?? lon,
      depth_m: res.ocean_depth_m,
      is_ocean: !res.is_land,
    }
  },
}
