import { HealthStatus, ArgoMetadata } from '../services/api'
import { SceneState } from '../types'

interface TopBarProps {
  health: HealthStatus | null
  healthError: boolean
  argoMeta: ArgoMetadata | null
  scene: SceneState
  onToggleAI?: () => void
}

const VARIABLE_LABELS: Record<string, string> = {
  temperature: 'Temperature',
  salinity: 'Salinity',
  current_speed: 'Currents',
}

export default function TopBar({ health, healthError, argoMeta, scene, onToggleAI }: TopBarProps) {
  const argoReady = health?.argo_ready
  const hycomStub = health?.hycom_stub ?? true

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
          value={argoReady
            ? `${argoMeta?.total_profiles?.toLocaleString() ?? '—'} profiles`
            : 'Not Ready'}
          status={argoReady ? 'ok' : 'warn'}
        />

        {/* HYCOM */}
        <StatusIndicator
          label="INCOIS HYCOM"
          value={hycomStub ? 'NetCDF Required' : 'Ready'}
          status={hycomStub ? 'stub' : 'ok'}
        />

        <div className="topbar__divider" />

        {/* Current view state */}
        <StatusIndicator
          label="VARIABLE"
          value={VARIABLE_LABELS[scene.variable] ?? scene.variable}
          status="ok"
        />
        <StatusIndicator
          label="DEPTH"
          value={scene.depth_m === 0 ? 'Surface' : `${scene.depth_m} m`}
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
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginRight: '16px',
            boxShadow: '0 0 12px rgba(2, 132, 199, 0.4)'
          }}
        >
          ✨ Ask GPT-6 Astra
        </button>
      )}

      {/* Platform info */}
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'right' }}>
        <div style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Ministry of Earth Sciences</div>
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
