import { useState, useEffect, useCallback } from 'react'
import { api, HealthStatus, ArgoMetadata, ArgoFloat, ArgoProfile } from './services/api'
import { SelectedFloat, ViewMode } from './types'

import TopBar from './components/TopBar'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import BottomBar from './components/BottomBar'
import AIChatModal from './components/AIChatModal'
import OceanWorld3D from './components/OceanWorld3D'
import OceanMapView from './components/OceanMapView'
import OceanCubeScene from './components/OceanCubeScene'
import { CesiumProvider, useCesium } from './cesium/CesiumContext'
import { CesiumViewer } from './cesium/CesiumViewer'
import { SceneState } from './types'

interface BBox {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

function MainApp() {
  const { state, setDepth, setVariable, setTimeIndex } = useCesium()
  const [viewMode, setViewMode] = useState<ViewMode>('ocean3d')

  // ── Backend health ──────────────────────────────────────────────
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [healthError, setHealthError] = useState(false)

  // ── AI Assistant Drawer ─────────────────────────────────────────
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)

  // ── Dataset metadata ────────────────────────────────────────────
  const [argoMeta, setArgoMeta] = useState<ArgoMetadata | null>(null)
  const [argoFloats, setArgoFloats] = useState<ArgoFloat[]>([])
  const [floatsLoaded, setFloatsLoaded] = useState(false)

  // ── Selected observation & comparison ───────────────────────────
  const [selectedFloat, setSelectedFloat] = useState<SelectedFloat | null>(null)
  const [selectedGlider, setSelectedGlider] = useState<any>(null)
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
    const interval = setInterval(fetchHealth, 15000)
    return () => clearInterval(interval)
  }, [])

  // ── Fetch Argo metadata once backend is healthy ──────────────────
  useEffect(() => {
    if (!health?.argo_ready) return
    api.argoMetadata().then(setArgoMeta).catch(console.error)
  }, [health?.argo_ready])

  // ── Fetch Argo float positions ────────────────────────────────────
  useEffect(() => {
    if (!health?.argo_ready || floatsLoaded) return
    api.argoFloats({ max_profiles: 2000 })
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
      const currentVar = state.variable === 'salinity' ? 'salinity' : 'temperature'
      const [profile, comp] = await Promise.all([
        api.argoProfile(float.platform_number, float.cycle_number),
        api.comparisonProfile(float.platform_number, float.cycle_number, currentVar).catch(() => null),
      ])
      setSelectedProfile(profile)
      setSelectedComparison(comp)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }, [state.variable])

  // Construct synced 3D Scene state for Three.js/Deck.gl
  const sceneState: SceneState = {
    variable:
      state.variable === 'salinity'
        ? 'salinity'
        : state.variable === 'current_speed'
        ? 'current_speed'
        : 'temperature',
    depth_m: state.depth_m,
    time_index: state.time_index,
    show_argo: state.layers.argo,
    show_currents: state.layers.current_vectors || state.layers.current_particles,
    show_model: state.layers.model_slice,
    show_glider: state.layers.glider,
    show_bathymetry: state.layers.bathymetry,
    vertical_exaggeration: state.vertical_exaggeration,
    opacity: state.volume_opacity,
  }

  const handleSceneChange = useCallback((partial: Partial<SceneState>) => {
    if (partial.depth_m !== undefined) setDepth(partial.depth_m)
    if (partial.variable !== undefined) setVariable(partial.variable)
    if (partial.time_index !== undefined) {
      const pct = partial.time_index <= 11 ? Math.round((partial.time_index / 11) * 100) : partial.time_index
      setTimeIndex(pct)
    }
  }, [setDepth, setVariable, setTimeIndex])

  return (
    <div className="app-shell">
      <TopBar
        health={health}
        healthError={healthError}
        argoMeta={argoMeta}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onToggleAI={() => setIsAIChatOpen(!isAIChatOpen)}
      />
      <LeftPanel
        argoMeta={argoMeta}
        selectedBBox={selectedBBox}
        onManualBBox={setSelectedBBox}
      />
      <main className="main-scene" style={{ position: 'relative', width: '100%', height: '100%' }}>
        {viewMode === 'ocean3d' && (
          <OceanWorld3D
            scene={sceneState}
            floats={argoFloats}
            onFloatSelect={handleFloatSelect}
            selectedFloat={selectedFloat}
            region={selectedBBox ?? undefined}
            onRegionSelect={setSelectedBBox}
            onDepthChange={setDepth}
            onVariableChange={setVariable}
          />
        )}
        {viewMode === 'cesium' && (
          <CesiumViewer
            floats={argoFloats}
            onSelectFloat={handleFloatSelect}
            selectedFloat={selectedFloat}
          />
        )}
        {viewMode === 'map2d' && (
          <OceanMapView
            scene={sceneState}
            onSceneChange={handleSceneChange}
            floats={argoFloats}
            onFloatSelect={handleFloatSelect}
            selectedFloat={selectedFloat}
            onGliderSelect={setSelectedGlider}
            selectedGliderPoint={selectedGlider}
            onRegionSelect={setSelectedBBox}
            availableDepths={[0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000]}
            onViewModeChange={(m: string) => {
              if (m === '3d' || m === 'ocean3d') setViewMode('ocean3d')
              else if (m === 'map' || m === 'map2d') setViewMode('map2d')
              else if (m === 'globe' || m === 'cesium') setViewMode('cesium')
              else if (m === 'cube') setViewMode('cube')
              else if (m === 'split') setViewMode('split')
            }}
          />
        )}
        {viewMode === 'cube' && (
          <OceanCubeScene
            scene={sceneState}
            floats={argoFloats}
            onFloatSelect={handleFloatSelect}
            selectedFloat={selectedFloat}
            region={selectedBBox ?? { lat_min: 0, lat_max: 30, lon_min: 55, lon_max: 100 }}
            onRegionSelect={setSelectedBBox}
          />
        )}
        {viewMode === 'split' && (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            <div style={{ flex: 1, position: 'relative', borderRight: '1px solid rgba(0, 212, 255, 0.3)' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  zIndex: 30,
                  backgroundColor: 'rgba(2, 6, 23, 0.85)',
                  border: '1px solid rgba(0, 212, 255, 0.4)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  color: '#38bdf8',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                3D Volumetric Digital Twin
              </div>
              <OceanWorld3D
                scene={sceneState}
                floats={argoFloats}
                onFloatSelect={handleFloatSelect}
                selectedFloat={selectedFloat}
                region={selectedBBox ?? undefined}
                onRegionSelect={setSelectedBBox}
                onDepthChange={setDepth}
                onVariableChange={setVariable}
              />
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  zIndex: 30,
                  backgroundColor: 'rgba(2, 6, 23, 0.85)',
                  border: '1px solid rgba(0, 212, 255, 0.4)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  color: '#38bdf8',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                2D High-Resolution Raster / Vector Map
              </div>
              <OceanMapView
                scene={sceneState}
                onSceneChange={handleSceneChange}
                floats={argoFloats}
                onFloatSelect={handleFloatSelect}
                selectedFloat={selectedFloat}
                onGliderSelect={setSelectedGlider}
                selectedGliderPoint={selectedGlider}
                onRegionSelect={setSelectedBBox}
                availableDepths={[0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000]}
                onViewModeChange={(m: string) => {
                  if (m === '3d' || m === 'ocean3d') setViewMode('ocean3d')
                  else if (m === 'map' || m === 'map2d') setViewMode('map2d')
                  else if (m === 'globe' || m === 'cesium') setViewMode('cesium')
                  else if (m === 'cube') setViewMode('cube')
                  else if (m === 'split') setViewMode('split')
                }}
              />
            </div>
          </div>
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
      <BottomBar argoMeta={argoMeta} />

      {/* GPT-6 Astra Chat Drawer */}
      <AIChatModal
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        selectedFloat={selectedFloat}
      />
    </div>
  )
}

export default function App() {
  return (
    <CesiumProvider>
      <MainApp />
    </CesiumProvider>
  )
}
