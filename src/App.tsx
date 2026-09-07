import { useState, useEffect, useCallback } from 'react'
import { api, HealthStatus, ArgoMetadata, ArgoFloat, ArgoProfile } from './services/api'
import { SceneState, SelectedFloat, OceanVariable } from './types'

interface BBox { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
import TopBar from './components/TopBar'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import BottomBar from './components/BottomBar'
import OceanScene from './components/OceanScene'
import OceanWorld3D from './components/OceanWorld3D'
import OceanMapView from './components/OceanMapView'
import AIChatModal from './components/AIChatModal'

// Default scene state
const DEFAULT_SCENE: SceneState = {
  variable: 'temperature',
  depth_m: 0,
  time_index: 0,
  show_argo: true,
  show_currents: false,
  show_model: false,
  show_glider: true,
  show_bathymetry: true,
  vertical_exaggeration: 5,
  opacity: 0.85,
}

export default function App() {
  // ── Backend health ──────────────────────────────────────────────
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthError, setHealthError] = useState(false)

  // ── AI Assistant Drawer ─────────────────────────────────────────
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)

  // ── Dataset metadata ────────────────────────────────────────────
  const [argoMeta, setArgoMeta] = useState<ArgoMetadata | null>(null)
  const [argoFloats, setArgoFloats] = useState<ArgoFloat[]>([])
  const [floatsLoaded, setFloatsLoaded] = useState(false)

  // ── View mode: '3d' = 3D Ocean (OceanCubeScene), 'map' = 2D Map, 'globe' = Globe ──
  const [viewMode, setViewMode] = useState<'3d' | 'map' | 'globe'>('map')

  // ── Selected ocean region (drives OceanCubeScene data fetch) ────────────
  const [region, setRegion] = useState({ lat_min: 0, lat_max: 30, lon_min: 55, lon_max: 100 })

  // Switch to cube view for the selected region
  const handleRegionSelect = useCallback((bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }) => {
    setRegion(bbox)
    setViewMode('3d')
  }, [])

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
        onToggleAI={() => setIsAIChatOpen(!isAIChatOpen)}
      />
      <LeftPanel
        scene={scene}
        onSceneChange={updateScene}
        argoMeta={argoMeta}
        selectedBBox={selectedBBox}
        onManualBBox={setSelectedBBox}
      />
      <main className="main-scene" style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(0,212,255,0.4)', boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
        }}>
          {(['3d', 'map', 'globe'] as const).map(mode => (
            <button
              key={mode}
              id={`view-mode-${mode}`}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '7px 20px',
                background: viewMode === mode ? 'rgba(0,212,255,0.22)' : 'rgba(6,12,26,0.92)',
                border: 'none',
                color: viewMode === mode ? '#00d4ff' : '#8ba7bb',
                fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.8px', transition: 'all 0.2s',
              }}
            >
              {mode === '3d' ? '🌊 3D OCEAN' : mode === 'map' ? '🗺️ MAP VIEW' : '🌍 GLOBE VIEW'}
            </button>
          ))}
        </div>

        {viewMode === '3d' ? (
          <OceanWorld3D
            scene={scene}
            floats={argoFloats}
            filteredFloats={filteredFloats}
            onFloatSelect={handleFloatSelect}
            selectedFloat={selectedFloat}
            region={region}
            onRegionSelect={handleRegionSelect}
          />
        ) : viewMode === 'map' ? (
          <OceanMapView
            scene={scene}
            floats={argoFloats}
            filteredFloats={filteredFloats}
            onFloatSelect={handleFloatSelect}
            selectedFloat={selectedFloat}
            onRegionSelect={handleRegionSelect}
          />
        ) : (
          <OceanScene
            scene={scene}
            floats={argoFloats}
            filteredFloats={filteredFloats}
            onFloatSelect={handleFloatSelect}
            selectedFloat={selectedFloat}
            onBBoxSelect={setSelectedBBox}
            selectedBBox={selectedBBox}
            onRegionSelect={handleRegionSelect}
          />
        )}
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

      {/* GPT-6 Astra Chat Drawer */}
      <AIChatModal
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        selectedFloat={selectedFloat}
      />
    </div>
  )
}

