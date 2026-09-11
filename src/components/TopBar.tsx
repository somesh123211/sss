import { HealthStatus, ArgoMetadata } from '../services/api'
import { useCesium } from '../cesium/CesiumContext'
import { ViewMode } from '../types'

interface TopBarProps {
  health: HealthStatus | null
  healthError: boolean
  argoMeta: ArgoMetadata | null
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onToggleAI?: () => void
}

const VARIABLE_LABELS: Record<string, string> = {
  temperature: 'Temperature (°C)',
  salinity: 'Salinity (PSU)',
  current_speed: 'Current Speed (m/s)',
  ssh: 'Sea Surface Height (m)',
}

export default function TopBar({ health, healthError, argoMeta, viewMode, onViewModeChange, onToggleAI }: TopBarProps) {
  const { state } = useCesium()
  const argoReady = health?.argo_ready
  const hycomStub = health?.hycom_stub ?? false

  const modelLabel =
    state.model_id === 'copernicus'
      ? 'Copernicus GLORYS12V1'
      : state.model_id === 'hycom'
      ? 'INCOIS RSMC HYCOM'
      : 'INCOIS IGORA'

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="topbar__brand">
        <div className="topbar__logo">🌊</div>
        <div>
          <div className="topbar__title">Ocean Digital Twin</div>
          <div className="topbar__subtitle">INCOIS · SIH 2026 · PS 26067</div>
        </div>
      </div>

      <div className="topbar__divider" />

      {/* View Mode Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'rgba(7, 16, 34, 0.85)',
          border: '1px solid rgba(0, 212, 255, 0.25)',
          borderRadius: '8px',
          padding: '2px',
          gap: '2px',
        }}
      >
        <button
          onClick={() => onViewModeChange('ocean3d')}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: viewMode === 'ocean3d' ? 600 : 400,
            color: viewMode === 'ocean3d' ? '#fff' : '#94a3b8',
            backgroundColor: viewMode === 'ocean3d' ? '#0284c7' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            boxShadow: viewMode === 'ocean3d' ? '0 0 8px rgba(2, 132, 199, 0.5)' : 'none',
          }}
        >
          <span>🌊</span> 3D Ocean World
        </button>

        <button
          onClick={() => onViewModeChange('cesium')}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: viewMode === 'cesium' ? 600 : 400,
            color: viewMode === 'cesium' ? '#fff' : '#94a3b8',
            backgroundColor: viewMode === 'cesium' ? '#0284c7' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            boxShadow: viewMode === 'cesium' ? '0 0 8px rgba(2, 132, 199, 0.5)' : 'none',
          }}
        >
          <span>🌍</span> 3D Geospatial
        </button>

        <button
          onClick={() => onViewModeChange('map2d')}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: viewMode === 'map2d' ? 600 : 400,
            color: viewMode === 'map2d' ? '#fff' : '#94a3b8',
            backgroundColor: viewMode === 'map2d' ? '#0284c7' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            boxShadow: viewMode === 'map2d' ? '0 0 8px rgba(2, 132, 199, 0.5)' : 'none',
          }}
        >
          <span>🗺️</span> 2D Map View
        </button>

        <button
          onClick={() => onViewModeChange('cube')}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: viewMode === 'cube' ? 600 : 400,
            color: viewMode === 'cube' ? '#fff' : '#94a3b8',
            backgroundColor: viewMode === 'cube' ? '#0284c7' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            boxShadow: viewMode === 'cube' ? '0 0 8px rgba(2, 132, 199, 0.5)' : 'none',
          }}
        >
          <span>🧊</span> Ocean Cube
        </button>

        <button
          onClick={() => onViewModeChange('split')}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: viewMode === 'split' ? 600 : 400,
            color: viewMode === 'split' ? '#fff' : '#94a3b8',
            backgroundColor: viewMode === 'split' ? '#0284c7' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease',
            boxShadow: viewMode === 'split' ? '0 0 8px rgba(2, 132, 199, 0.5)' : 'none',
          }}
        >
          <span>◫</span> Split View
        </button>
      </div>

      {/* Status Indicators */}
      <div className="topbar__indicators">
        {/* Backend */}
        <StatusIndicator
          label="API"
          value={healthError ? 'Offline' : health ? 'Online' : 'Connecting...'}
          status={healthError ? 'error' : health ? 'ok' : 'warn'}
        />

        <div className="topbar__divider" />

        {/* Argo */}
        <StatusIndicator
          label="INCOIS ARGO"
          value={
            argoReady
              ? `${argoMeta?.total_profiles?.toLocaleString() ?? '—'} profiles`
              : 'Not Ready'
          }
          status={argoReady ? 'ok' : 'warn'}
        />

        {/* Model */}
        <StatusIndicator
          label="OCEAN MODEL"
          value={hycomStub ? `${modelLabel} (Stub)` : `${modelLabel} (Active)`}
          status={hycomStub ? 'stub' : 'ok'}
        />

        {/* Glider */}
        <StatusIndicator
          label="GLIDERS"
          value={health?.glider_ready ? 'IFREMER / INCOIS (Bay of Bengal)' : 'Not Ready'}
          status={health?.glider_ready ? 'ok' : 'warn'}
        />

        {/* GEBCO */}
        <StatusIndicator
          label="BATHYMETRY"
          value={health?.gebco_ready ? 'GEBCO (30 arc-sec grid)' : 'Not Ready'}
          status={health?.gebco_ready ? 'ok' : 'warn'}
        />

        <div className="topbar__divider" />

        {/* Current view state */}
        <StatusIndicator
          label="VARIABLE"
          value={VARIABLE_LABELS[state.variable] ?? state.variable}
          status="ok"
        />
        <StatusIndicator
          label="DEPTH"
          value={state.depth_m === 0 ? 'Surface' : `${state.depth_m} m`}
          status="ok"
        />
      </div>

      <div className="topbar__spacer" />

      {/* AI Assistant Button */}
      {onToggleAI && (
        <button
          onClick={onToggleAI}
          style={{
            backgroundColor: '#0284c7',
            color: '#fff',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginRight: '16px',
            boxShadow: '0 0 12px rgba(2, 132, 199, 0.4)',
          }}
        >
          ✨ Ask GPT-6 Astra
        </button>
      )}

      {/* Platform info */}
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right' }}>
        <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
          Ministry of Earth Sciences
        </div>
        <div>Indian National Centre for Ocean Information Services</div>
      </div>
    </header>
  )
}

interface StatusIndicatorProps {
  label: string
  value: string
  status: 'ok' | 'warn' | 'error' | 'stub'
}

function StatusIndicator({ label, value, status }: StatusIndicatorProps) {
  return (
    <div className={`status-indicator status-indicator--${status}`}>
      <div className="status-indicator__dot" />
      <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{label}:</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}
