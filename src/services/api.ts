/**
 * API service for Ocean Digital Twin backend
 * Connects to FastAPI at http://localhost:8000 (proxied via Vite)
 */

export const API_BASE = '/api'

export interface HealthStatus {
  status: string
  timestamp: string
  argo_ready: boolean
  hycom_ready: boolean
  hycom_stub: boolean
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
    lat_min: number; lat_max: number;
    lon_min: number; lon_max: number;
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
  pres_min: number
  pres_max: number
  n_levels: number
  temp_surface: number | null
  psal_surface: number | null
}

export interface ArgoFloatsResponse {
  count: number
  floats: ArgoFloat[]
  source: string
  filtered: boolean
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
    max_abs_bias?: number
    correlation?: number
  }
}

export interface HYCOMModelSurface {
  variable: string
  units: string
  depth_m?: number
  requested_depth_m?: number
  actual_depth_m?: number
  lat: number[]
  lon: number[]
  values: (number | null)[][]
  vmin: number
  vmax: number
  shape?: number[]
}

async function apiFetch<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
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
    lat_min?: number; lat_max?: number;
    lon_min?: number; lon_max?: number;
    time_start?: string; time_end?: string;
    max_profiles?: number;
  }): Promise<ArgoFloatsResponse> {
    return apiFetch<ArgoFloatsResponse>('/argo/floats', params as Record<string, number | string>)
  },

  async argoProfile(platformNumber: number, cycleNumber: number): Promise<ArgoProfile> {
    return apiFetch<ArgoProfile>(`/argo/profile/${platformNumber}/${cycleNumber}`)
  },

  async argoCycles(platformNumber: number): Promise<{ platform_number: number; cycles: number[]; n_cycles: number }> {
    return apiFetch(`/argo/cycles/${platformNumber}`)
  },

  async modelStatus(): Promise<Record<string, unknown>> {
    return apiFetch('/model/metadata')
  },

  async modelSurface(variable = 'temperature'): Promise<HYCOMModelSurface> {
    return apiFetch<HYCOMModelSurface>('/model/surface', { variable })
  },

  async modelDepthSlice(variable = 'temperature', depth_m = 0): Promise<HYCOMModelSurface> {
    return apiFetch<HYCOMModelSurface>('/model/depth-slice', { variable, depth_m })
  },

  async comparisonProfile(platformNumber: number, cycleNumber: number, variable = 'temperature'): Promise<ComparisonData> {
    return apiFetch<ComparisonData>('/comparison/profile', { platform_number: platformNumber, cycle_number: cycleNumber, variable })
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
}


