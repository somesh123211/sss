import { ArgoProfile, ComparisonData } from '../services/api'
import { SelectedFloat } from '../types'
import ProfileChart from './ProfileChart'

interface RightPanelProps {
  selectedFloat: SelectedFloat | null
  profile: ArgoProfile | null
  comparison: ComparisonData | null
  profileLoading: boolean
  profileError: string | null
  hycomStub: boolean
}

export default function RightPanel({
  selectedFloat,
  profile,
  comparison,
  profileLoading,
  profileError,
}: RightPanelProps) {
  return (
    <aside className="right-panel">
      <div className="info-panel">
        {!selectedFloat ? (
          <EmptyState />
        ) : (
          <>
            <FloatDetails float={selectedFloat} profile={profile} />
            {profileLoading && <LoadingProfile />}
            {profileError && <ProfileError error={profileError} />}
            {profile && !profileLoading && (
              <>
                <ComparisonCard profile={profile} comparison={comparison} />
                <ProfileChart profile={profile} comparison={comparison} />
              </>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">🌊</div>
      <div className="empty-state__title">No Ocean Point Selected</div>
      <div className="empty-state__desc">
        Click any <b>Argo Float marker</b> on the 3D Satellite Earth Globe to inspect its real vertical temperature/salinity profiles and compare against the <b>INCOIS HYCOM Ocean Model</b>.
      </div>
      <div style={{
        marginTop: 16,
        padding: '12px 14px',
        background: 'rgba(0, 212, 255, 0.04)',
        border: '1px solid rgba(0, 212, 255, 0.15)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--color-text-muted)',
        lineHeight: 1.8,
      }}>
        <div style={{ color: '#00d4ff', fontWeight: 600, marginBottom: 4 }}>Platform Capabilities:</div>
        <div>🟢 <b>13,148 Real Argo Observations</b> (INCOIS ERDDAP)</div>
        <div>🌐 <b>3D HYCOM Ocean Model</b> (Temperature & Salinity)</div>
        <div>📊 <b>Vertical Depth Profiles</b> (0 – 2000m)</div>
        <div>⚖ <b>Model vs Observation Intelligence</b> (Bias & RMSE)</div>
      </div>
    </div>
  )
}

function FloatDetails({ float: f, profile }: {
  float: SelectedFloat
  profile: ArgoProfile | null
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="info-panel__title">Observation Details</div>
      <div className="float-card fade-in" style={{ padding: '12px 14px' }}>
        <div className="float-card__header" style={{ marginBottom: 8 }}>
          <div className="float-card__id" style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff' }}>
            Float #{f.platform_number}
          </div>
          <div className="float-card__cycle" style={{ fontSize: 10, background: 'rgba(0,212,255,0.15)', padding: '2px 8px', borderRadius: 4, color: '#00ffff' }}>
            Cycle {f.cycle_number}
          </div>
        </div>
        <div className="float-card__meta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>Latitude</div>
            <div className="meta-item__value" style={{ fontWeight: 600 }}>{f.latitude.toFixed(3)}°N</div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>Longitude</div>
            <div className="meta-item__value" style={{ fontWeight: 600 }}>{f.longitude.toFixed(3)}°E</div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>Observation Date</div>
            <div className="meta-item__value" style={{ fontSize: 10 }}>
              {new Date(f.time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>Max Pressure</div>
            <div className="meta-item__value" style={{ fontSize: 10 }}>
              {profile ? `${profile.pressure_range_dbar.max} dbar` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingProfile() {
  return (
    <div style={{ textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: 11, color: '#00d4ff', fontWeight: 600 }}>Fetching Profile & Running HYCOM Comparison...</div>
      <div className="loading-bar" style={{ margin: '10px auto 0', width: 140 }}>
        <div className="loading-bar__fill" />
      </div>
    </div>
  )
}

function ProfileError({ error }: { error: string }) {
  return (
    <div style={{
      padding: 12,
      background: 'rgba(255,68,68,0.08)',
      border: '1px solid rgba(255,68,68,0.25)',
      borderRadius: 8,
      fontSize: 11,
      color: 'var(--color-status-error)',
      marginBottom: 12,
    }}>
      ⚠ {error}
    </div>
  )
}

function ComparisonCard({ profile, comparison }: {
  profile: ArgoProfile
  comparison: ComparisonData | null
}) {
  const surfaceObs = profile.data.temp[0]
  
  // Model value interpolated at surface
  const modelInterp = comparison?.model?.interpolated_at_argo_depths?.[0]
  const hycomVal = (typeof modelInterp === 'number') ? modelInterp : null
  const diff = (surfaceObs !== undefined && hycomVal !== null) ? (hycomVal - surfaceObs) : null

  const stats = comparison?.stats

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="info-panel__title" style={{ marginBottom: 8, color: '#00d4ff' }}>
        MODEL vs OBSERVATION INTELLIGENCE
      </div>
      <div style={{
        background: 'rgba(4, 27, 46, 0.85)',
        border: '1px solid rgba(0, 212, 255, 0.25)',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#e8f4f8', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Surface Water Temperature</span>
          <span style={{ fontSize: 9, background: 'rgba(0,212,255,0.15)', color: '#00ffff', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
            INCOIS HYCOM
          </span>
        </div>

        {/* 3 Metric Box Display */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
          {/* Observed Box */}
          <div style={{
            background: 'rgba(0, 212, 255, 0.08)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: 6,
            padding: '8px 4px',
          }}>
            <div style={{ fontSize: 9, color: '#8ba7bb', textTransform: 'uppercase', marginBottom: 4 }}>Observed (Argo)</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff' }}>
              {surfaceObs !== undefined ? `${surfaceObs.toFixed(2)}°C` : '—'}
            </div>
          </div>

          {/* HYCOM Model Box */}
          <div style={{
            background: 'rgba(0, 255, 255, 0.08)',
            border: '1px solid rgba(0, 255, 255, 0.2)',
            borderRadius: 6,
            padding: '8px 4px',
          }}>
            <div style={{ fontSize: 9, color: '#8ba7bb', textTransform: 'uppercase', marginBottom: 4 }}>HYCOM Model</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00ffff' }}>
              {hycomVal !== null ? `${hycomVal.toFixed(2)}°C` : '—'}
            </div>
          </div>

          {/* Model Bias Box */}
          <div style={{
            background: diff !== null ? (diff > 0 ? 'rgba(255,82,82,0.1)' : 'rgba(0,230,118,0.1)') : 'rgba(255,255,255,0.05)',
            border: `1px solid ${diff !== null ? (diff > 0 ? 'rgba(255,82,82,0.3)' : 'rgba(0,230,118,0.3)') : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6,
            padding: '8px 4px',
          }}>
            <div style={{ fontSize: 9, color: '#8ba7bb', textTransform: 'uppercase', marginBottom: 4 }}>Model Bias Δ</div>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: diff !== null ? (diff > 0 ? '#ff5252' : '#00e676') : '#8ba7bb'
            }}>
              {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}°C` : '—'}
            </div>
          </div>
        </div>

        {/* Statistical Summary */}
        {stats && stats.rmse !== undefined && (
          <div style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 4,
            fontSize: 9,
            textAlign: 'center',
          }}>
            <div>
              <div style={{ color: '#8ba7bb' }}>RMSE</div>
              <div style={{ fontWeight: 700, color: '#00d4ff', marginTop: 2, fontSize: 11 }}>{stats.rmse.toFixed(3)}°C</div>
            </div>
            <div>
              <div style={{ color: '#8ba7bb' }}>Mean Bias</div>
              <div style={{ fontWeight: 700, color: (stats.mean_bias || 0) >= 0 ? '#ff7043' : '#29b6f6', marginTop: 2, fontSize: 11 }}>
                {(stats.mean_bias || 0) > 0 ? '+' : ''}{stats.mean_bias?.toFixed(3)}°C
              </div>
            </div>
            <div>
              <div style={{ color: '#8ba7bb' }}>Correlation (r)</div>
              <div style={{ fontWeight: 700, color: '#ab47bc', marginTop: 2, fontSize: 11 }}>
                {stats.correlation !== undefined && stats.correlation !== null ? stats.correlation.toFixed(3) : 'N/A'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
