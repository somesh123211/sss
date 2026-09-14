import { HealthStatus, ArgoMetadata } from '../services/api'
import { useCesium } from '../cesium/CesiumContext'
import { ViewMode } from '../types'

interface TopBarProps {
  health: HealthStatus | null
  healthError: boolean
  argoMeta: ArgoMetadata | null
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export default function TopBar({ health, healthError, argoMeta, viewMode, onViewModeChange }: TopBarProps) {
  const argoReady = health?.argo_ready
  const hycomStub = health?.hycom_stub ?? false

  const views: { id: ViewMode; icon: string; label: string }[] = [
    { id: 'ocean3d', icon: '🌊', label: '3D Globe' },
    { id: 'map2d',   icon: '🗺️', label: '2D Map'  },
    { id: 'cube',    icon: '🧊', label: 'Ocean Cube' },
  ]

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="topbar__brand">
        <div className="topbar__logo">🌊</div>
        <div>
          <div className="topbar__title">SamuraTech</div>
          <div className="topbar__subtitle">INCOIS · SIH 2026 · PS 26067</div>
        </div>
      </div>

      <div className="topbar__divider" />

      {/* View Mode Switcher */}
      <div className="view-switcher">
        {views.map(v => (
          <button
            key={v.id}
            className={`view-switcher__btn ${viewMode === v.id ? 'view-switcher__btn--active' : ''}`}
            onClick={() => onViewModeChange(v.id)}
          >
            <span>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      <div className="topbar__divider" />

      {/* Data Source Status Pills */}
      <div className="topbar__pills">
        <StatusPill
          dot={healthError ? 'error' : health ? 'ok' : 'warn'}
          label="API"
          value={healthError ? 'Offline' : health ? 'Online' : '…'}
        />
        <StatusPill
          dot={argoReady ? 'ok' : 'warn'}
          label="Argo Floats"
          value={argoReady ? `${argoMeta?.total_profiles?.toLocaleString() ?? '—'} profiles` : 'Loading'}
        />
        <StatusPill
          dot={hycomStub ? 'warn' : 'ok'}
          label="Ocean Model"
          value={hycomStub ? 'HYCOM (Stub)' : 'IGORA Active'}
        />
        <StatusPill
          dot={health?.glider_ready ? 'ok' : 'warn'}
          label="Gliders"
          value={health?.glider_ready ? 'Bay of Bengal' : 'Not Ready'}
        />
      </div>

      <div className="topbar__spacer" />

      {/* MoES Badge */}
      <div className="topbar__badge">
        <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 10 }}>MoES / INCOIS</div>
        <div style={{ color: '#64748b', fontSize: 9 }}>Ministry of Earth Sciences</div>
      </div>
    </header>
  )
}

function StatusPill({ dot, label, value }: { dot: 'ok' | 'warn' | 'error'; label: string; value: string }) {
  const colors: Record<string, string> = { ok: '#10b981', warn: '#f59e0b', error: '#ef4444' }
  return (
    <div className="status-pill">
      <span className="status-pill__dot" style={{ background: colors[dot] }} />
      <span className="status-pill__label">{label}</span>
      <span className="status-pill__value">{value}</span>
    </div>
  )
}
