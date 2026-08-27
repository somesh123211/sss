import { useState, useEffect, useCallback } from 'react'
import { api, HealthStatus, ArgoMetadata, ArgoFloat, ArgoProfile } from './services/api'
import { SceneState, SelectedFloat, OceanVariable } from './types'

interface BBox { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
import TopBar from './components/TopBar'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import BottomBar from './components/BottomBar'
import OceanScene from './components/OceanScene'

// Default scene state
const DEFAULT_SCENE: SceneState = {
  variable: 'temperature',
  depth_m: 0,
  time_index: 0,
  show_argo: true,
  show_currents: false,
  show_model: false,
  vertical_exaggeration: 5,
  opacity: 0.85,
}

export default function App() {
  // ── Backend health ──────────────────────────────────────────────
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthError, setHealthError] = useState(false)

  // ── Dataset metadata ────────────────────────────────────────────
  const [argoMeta, setArgoMeta] = useState<ArgoMetadata | null>(null)
  const [argoFloats, setArgoFloats] = useState<ArgoFloat[]>([])
  const [floatsLoaded, setFloatsLoaded] = useState(false)

  // ── Scene state ─────────────────────────────────────────────────
  const [scene, setScene] = useState<SceneState>(DEFAULT_SCENE)

  // ── Selected observation & comparison ───────────────────────────
  const [selectedFloat, setSelectedFloat] = useState<SelectedFloat | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<ArgoProfile | null>(null)
  const [selectedComparison, setSelectedComparison] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // ── Selected bounding box ─────────────────────────────────────────
  const [selectedBBox, setSelectedBBox] = useState<BBox | null>(null)

  // ── Fetch health on mount ────────────────────────────────────────
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const h = await api.health()
        setHealth(h)
        setHealthError(false)
      } catch {
        setHealthError(true)
      }
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 15000) // refresh every 15s
    return () => clearInterval(interval)
  }, [])

  // ── Fetch Argo metadata once backend is healthy ──────────────────
  useEffect(() => {
    if (!health?.argo_ready) return
    api.argoMetadata().then(setArgoMeta).catch(console.error)
  }, [health?.argo_ready])

  // ── Fetch Argo float positions (initial full set) ─────────────────
  useEffect(() => {
    if (!health?.argo_ready || floatsLoaded) return
    api.argoFloats({ max_profiles: 1000 })
      .then(res => {
        setArgoFloats(res.floats)
        setFloatsLoaded(true)
      })
      .catch(console.error)
  }, [health?.argo_ready, floatsLoaded])

  // ── Handle float selection ────────────────────────────────────────
  const handleFloatSelect = useCallback(async (float: SelectedFloat) => {
    setSelectedFloat(float)
    setSelectedProfile(null)
    setSelectedComparison(null)
    setProfileError(null)
    setProfileLoading(true)
    try {
      const [profile, comp] = await Promise.all([
        api.argoProfile(float.platform_number, float.cycle_number),
        api.comparisonProfile(float.platform_number, float.cycle_number, 'temperature').catch(() => null),
      ])
      setSelectedProfile(profile)
      setSelectedComparison(comp)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }, [])

  // ── Scene state updaters ──────────────────────────────────────────
  const updateScene = useCallback((partial: Partial<SceneState>) => {
    setScene(prev => ({ ...prev, ...partial }))
  }, [])

  // ── Compute current active date from timeline slider ─────────────
  const startDate = argoMeta ? new Date(argoMeta.time_range.start).getTime() : new Date('2018-01-01').getTime()
  const endDate = argoMeta ? new Date(argoMeta.time_range.end).getTime() : new Date('2025-04-01').getTime()
  const currentTs = startDate + ((endDate - startDate) * (scene.time_index / 100))
  const currentDateStr = new Date(currentTs).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  })

  // Filter floats up to current active date (or within current year window)
  const filteredFloats = argoFloats.filter(f => {
    const floatTime = new Date(f.time).getTime()
    return floatTime <= currentTs
  })

  return (
    <div className="app-shell">
      <TopBar
        health={health}
        healthError={healthError}
        argoMeta={argoMeta}
        scene={scene}
      />
      <LeftPanel
        scene={scene}
        onSceneChange={updateScene}
        argoMeta={argoMeta}
        selectedBBox={selectedBBox}
        onManualBBox={setSelectedBBox}
      />
      <main className="main-scene">
        <OceanScene
          scene={scene}
          floats={argoFloats}
          filteredFloats={filteredFloats}
          onFloatSelect={handleFloatSelect}
          selectedFloat={selectedFloat}
          onBBoxSelect={setSelectedBBox}
          selectedBBox={selectedBBox}
        />
      </main>
      <RightPanel
        selectedFloat={selectedFloat}
        profile={selectedProfile}
        comparison={selectedComparison}
        profileLoading={profileLoading}
        profileError={profileError}
        hycomStub={health?.hycom_stub ?? false}
      />
      <BottomBar
        scene={scene}
        onSceneChange={updateScene}
        argoMeta={argoMeta}
        currentDateStr={currentDateStr}
      />
    </div>
  )
}
