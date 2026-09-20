import { useState } from 'react'
import { ArgoProfile, ComparisonData } from '../services/api'
import { SelectedFloat } from '../types'
import { useCesium } from '../cesium/CesiumContext'
import ProfileChart from './ProfileChart'
import InfoButton from './InfoButton'

interface RightPanelProps {
  selectedFloat: SelectedFloat | null
  profile: ArgoProfile | null
  comparison: ComparisonData | null
  profileLoading: boolean
  profileError: string | null
  hycomStub: boolean
}

type RightPanelTab = 'comparison' | 'profile' | 'physics'

export default function RightPanel({
  selectedFloat,
  profile,
  comparison,
  profileLoading,
  profileError,
}: RightPanelProps) {
  const { selectedObject } = useCesium()
  const [activeTab, setActiveTab] = useState<RightPanelTab>('comparison')

  return (
    <aside className="right-panel">
      <div className="info-panel">
        {!selectedFloat && !selectedObject ? (
          <EmptyState />
        ) : selectedFloat ? (
          <div className="fade-in">
            {/* Float Metadata Header */}
            <FloatDetails float={selectedFloat} profile={profile} />

            {/* Navigation Tabs */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginBottom: 12,
                background: 'rgba(2, 6, 16, 0.6)',
                padding: 4,
                borderRadius: 8,
                border: '1px solid rgba(0, 212, 255, 0.2)',
              }}
            >
              {[
                { id: 'comparison', label: '⚖️ Model vs Obs' },
                { id: 'profile', label: '📊 Depth Profile' },
                { id: 'physics', label: '🌡 Telemetry' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as RightPanelTab)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: 6,
                    background: activeTab === t.id ? 'rgba(0, 212, 255, 0.25)' : 'transparent',
                    border: activeTab === t.id ? '1px solid rgba(0, 212, 255, 0.45)' : '1px solid transparent',
                    color: activeTab === t.id ? '#00e5ff' : '#8ba7bb',
                    fontSize: 10,
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {profileLoading && <LoadingProfile />}
            {profileError && <ProfileError error={profileError} />}

            {/* TAB 1: MODEL VS OBSERVATION COMPARISON */}
            {activeTab === 'comparison' && (
              <div>
                <ComparisonCard profile={profile} comparison={comparison} selectedFloat={selectedFloat} />
                {profile && !profileLoading && (
                  <ProfileChart profile={profile} comparison={comparison} />
                )}
              </div>
            )}

            {/* TAB 2: VERTICAL DEPTH PROFILE */}
            {activeTab === 'profile' && profile && !profileLoading && (
              <div>
                <ProfileChart profile={profile} comparison={comparison} />
                {profile.data && profile.data.pres && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#8ba7bb', marginBottom: 6, textTransform: 'uppercase' }}>
                      Profile Levels ({profile.data.pres.length} depth levels)
                    </div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 6 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, fontFamily: 'monospace' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff', textAlign: 'left' }}>
                            <th style={{ padding: '4px 6px' }}>Depth (dbar)</th>
                            <th style={{ padding: '4px 6px' }}>Temp (°C)</th>
                            <th style={{ padding: '4px 6px' }}>Salinity (PSU)</th>
                            <th style={{ padding: '4px 6px' }}>QC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile.data.pres.slice(0, 50).map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#cde8f5' }}>
                              <td style={{ padding: '3px 6px' }}>{Math.round(p)}</td>
                              <td style={{ padding: '3px 6px', color: '#ff8a80' }}>{profile.data.temp[i]?.toFixed(2)}</td>
                              <td style={{ padding: '3px 6px', color: '#80d8ff' }}>{profile.data.psal[i]?.toFixed(2)}</td>
                              <td style={{ padding: '3px 6px', color: '#00e676' }}>{profile.data.qc_flag[i] || '1'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: WATER COLUMN TELEMETRY & PHYSICAL FACTORS */}
            {activeTab === 'physics' && (
              <div>
                {selectedObject && selectedObject.type === 'point_factors' ? (
                  <PointFactorDetails selectedObject={selectedObject} />
                ) : (
                  <div
                    style={{
                      padding: 14,
                      background: 'rgba(4, 27, 46, 0.85)',
                      border: '1px solid rgba(0, 212, 255, 0.25)',
                      borderRadius: 10,
                      fontSize: 11,
                      color: '#cde8f5',
                      lineHeight: 1.7,
                    }}
                  >
                    <div style={{ color: '#00d4ff', fontWeight: 700, marginBottom: 10, fontSize: 12 }}>
                      🌊 In-Situ Float Metadata
                    </div>
                    {[
                      { label: 'Latitude',        val: `${selectedFloat.latitude.toFixed(4)}°N` },
                      { label: 'Longitude',       val: `${selectedFloat.longitude.toFixed(4)}°E` },
                      { label: 'Surface Temp',    val: selectedFloat.temp_surface != null ? `${selectedFloat.temp_surface.toFixed(2)} °C` : '— (click to load)' },
                      { label: 'Surface Salinity',val: selectedFloat.psal_surface != null ? `${selectedFloat.psal_surface.toFixed(2)} PSU` : '— (click to load)' },
                      { label: 'Max Depth',       val: `${selectedFloat.pres_max ?? 2000} dbar` },
                      { label: 'Profile Date',    val: new Date(selectedFloat.time).toLocaleDateString('en-IN') },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '4px 0' }}>
                        <span style={{ color: '#64748b', fontSize: 10 }}>{row.label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11 }}>{row.val}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, fontSize: 9.5, color: '#475569', fontStyle: 'italic' }}>
                      💡 Model telemetry loads automatically when float is selected
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : selectedObject && selectedObject.type === 'point_factors' ? (
          <PointFactorDetails selectedObject={selectedObject} />
        ) : selectedObject && selectedObject.type === 'glider' ? (
          <GliderDetails selectedObject={selectedObject} />
        ) : selectedObject && selectedObject.type === 'error_cell' ? (
          <ErrorCellDetails selectedObject={selectedObject} />
        ) : selectedObject && selectedObject.type === 'model_cell' ? (
          <ModelCellDetails selectedObject={selectedObject} />
        ) : (
          <EmptyState />
        )}
      </div>
    </aside>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">🌊</div>
      <div className="empty-state__title">No Ocean Object Selected</div>
      <div className="empty-state__desc">
        Click any <b>Argo Float</b>, <b>Underwater Glider</b>, <b>Model Grid</b>, or <b>Error Anomaly Point</b> on the 3D Ocean Cube or Globe to inspect Model vs Observation comparison.
      </div>
      <div
        style={{
          marginTop: 16,
          padding: '12px 14px',
          background: 'rgba(0, 212, 255, 0.04)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--color-text-muted)',
          lineHeight: 1.8,
        }}
      >
        <div style={{ color: '#00d4ff', fontWeight: 600, marginBottom: 4 }}>Platform Capabilities:</div>
        <div>🟢 <b>13,148 Real Argo Profiles</b> (INCOIS ERDDAP)</div>
        <div>🌐 <b>3D Numerical Ocean Models</b> (INCOIS IGORA / HYCOM)</div>
        <div>📊 <b>GEBCO Seafloor Bathymetry</b> (30 arc-sec)</div>
        <div>⚖ <b>Model vs Observation Colocation</b> (Bias & RMSE)</div>
      </div>
    </div>
  )
}

function FloatDetails({
  float: f,
  profile,
}: {
  float: SelectedFloat
  profile: ArgoProfile | null
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="info-panel__title" style={{ display:'flex', alignItems:'center', gap:6 }}>
        Observation Details
        <InfoButton
          content="Real measurement data from an INCOIS Argo profiling float. Each float dives to 2000 m, measures Temperature & Salinity at multiple depth levels, then surfaces and transmits data via satellite. Platform number is the float's unique World Meteorological Organisation (WMO) ID."
          title="Argo Float Observation"
          position="bottom"
        />
      </div>
      <div className="float-card fade-in" style={{ padding: '12px 14px' }}>
        <div className="float-card__header" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="float-card__id" style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff' }}>
            📍 Argo Float #{f.platform_number}
          </div>
          <div
            style={{
              fontSize: 10,
              background: 'rgba(0,212,255,0.15)',
              padding: '2px 8px',
              borderRadius: 4,
              color: '#00ffff',
              fontWeight: 700,
            }}
          >
            Cycle {f.cycle_number}
          </div>
        </div>
        <div
          className="float-card__meta"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}
        >
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Latitude
            </div>
            <div className="meta-item__value" style={{ fontWeight: 600 }}>
              {f.latitude.toFixed(3)}°N
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Longitude
            </div>
            <div className="meta-item__value" style={{ fontWeight: 600 }}>
              {f.longitude.toFixed(3)}°E
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Observation Date
            </div>
            <div className="meta-item__value" style={{ fontSize: 10 }}>
              {new Date(f.time).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Max Pressure
            </div>
            <div className="meta-item__value" style={{ fontSize: 10 }}>
              {profile ? `${profile.pressure_range_dbar.max} dbar` : '2000 dbar'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GliderDetails({ selectedObject }: { selectedObject: any }) {
  const meta = selectedObject.metadata || {}
  return (
    <div style={{ marginBottom: 12 }} className="fade-in">
      <div className="info-panel__title">Autonomous Glider Mission</div>
      <div className="float-card" style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#ff9900', marginBottom: 8 }}>
          {selectedObject.title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Mission ID
            </div>
            <div className="meta-item__value" style={{ fontWeight: 600 }}>
              {meta.mission_id || 'INCOIS-GLIDER-01'}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Position
            </div>
            <div className="meta-item__value" style={{ fontWeight: 600 }}>
              {selectedObject.position.lat.toFixed(3)}°N, {selectedObject.position.lon.toFixed(3)}°E
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Surface Temp
            </div>
            <div className="meta-item__value">
              {meta.temp_surface != null ? `${meta.temp_surface.toFixed(2)} °C` : '—'}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-item__label" style={{ fontSize: 9, color: '#8ba7bb' }}>
              Surface Salinity
            </div>
            <div className="meta-item__value">
              {meta.sal_surface != null ? `${meta.sal_surface.toFixed(2)} PSU` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrorCellDetails({ selectedObject }: { selectedObject: any }) {
  const meta = selectedObject.metadata || {}
  const bias = selectedObject.value
  return (
    <div style={{ marginBottom: 12 }} className="fade-in">
      <div className="info-panel__title" style={{ color: '#00d4ff' }}>
        Colocation Error Analysis
      </div>
      <div
        style={{
          background: 'rgba(4, 27, 46, 0.85)',
          border: '1px solid rgba(0, 212, 255, 0.25)',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e8f4f8', marginBottom: 8 }}>
          {selectedObject.title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
          <div style={{ background: 'rgba(0, 212, 255, 0.08)', borderRadius: 6, padding: '8px 4px' }}>
            <div style={{ fontSize: 9, color: '#8ba7bb' }}>Observed</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4ff', marginTop: 2 }}>
              {meta.observed != null ? `${meta.observed.toFixed(2)}` : '—'}
            </div>
          </div>
          <div style={{ background: 'rgba(0, 255, 255, 0.08)', borderRadius: 6, padding: '8px 4px' }}>
            <div style={{ fontSize: 9, color: '#8ba7bb' }}>Model</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00ffff', marginTop: 2 }}>
              {meta.model != null ? `${meta.model.toFixed(2)}` : '—'}
            </div>
          </div>
          <div
            style={{
              background: bias > 0 ? 'rgba(255,82,82,0.1)' : 'rgba(0,230,118,0.1)',
              borderRadius: 6,
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: 9, color: '#8ba7bb' }}>Bias (Δ)</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: bias > 0 ? '#ff5252' : '#00e676',
                marginTop: 2,
              }}
            >
              {bias != null ? `${bias > 0 ? '+' : ''}${bias.toFixed(2)}` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModelCellDetails({ selectedObject }: { selectedObject: any }) {
  return (
    <div style={{ marginBottom: 12 }} className="fade-in">
      <div className="info-panel__title">Numerical Ocean Model Layer</div>
      <div className="float-card" style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#00d4ff', marginBottom: 6 }}>
          {selectedObject.title}
        </div>
        <div style={{ fontSize: 11, color: '#8ba7bb', lineHeight: 1.6 }}>
          Source: <b>{selectedObject.source}</b>
          <br />
          Depth: <b>{selectedObject.metadata?.depth_m ?? 0} m</b>
        </div>
      </div>
    </div>
  )
}

function LoadingProfile() {
  return (
    <div style={{ textAlign: 'center', padding: 20 }}>
      <div style={{ fontSize: 11, color: '#00d4ff', fontWeight: 600 }}>
        Fetching Profile & Running Model Comparison...
      </div>
      <div className="loading-bar" style={{ margin: '10px auto 0', width: 140 }}>
        <div className="loading-bar__fill" />
      </div>
    </div>
  )
}

function ProfileError({ error }: { error: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: 'rgba(255,68,68,0.08)',
        border: '1px solid rgba(255,68,68,0.25)',
        borderRadius: 8,
        fontSize: 11,
        color: 'var(--color-status-error)',
        marginBottom: 12,
      }}
    >
      ⚠ {error}
    </div>
  )
}

function ComparisonCard({
  profile,
  comparison,
  selectedFloat,
}: {
  profile: ArgoProfile | null
  comparison: ComparisonData | null
  selectedFloat: SelectedFloat | null
}) {
  // Pull real Argo surface temp from comparison API (not from synthetic fallback profile)
  const argoTemps = comparison?.argo?.['temperature'] as number[] | undefined
  const argoDepths = comparison?.argo?.depths

  // Use first non-null value from comparison.argo.temperature
  const surfaceObs = argoTemps?.[0] ?? selectedFloat?.temp_surface ?? undefined

  // Use first non-null interpolated model value
  const interpArr = comparison?.model?.interpolated_at_argo_depths ?? []
  const firstValidIdx = interpArr.findIndex((v) => typeof v === 'number')
  const hycomVal = firstValidIdx >= 0 ? (interpArr[firstValidIdx] as number) : null

  // Depth label for the comparison point
  const compDepth = argoDepths?.[firstValidIdx >= 0 ? firstValidIdx : 0] ?? 0

  const stats = comparison?.stats

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="info-panel__title" style={{ marginBottom: 8, color: '#00d4ff', display:'flex', alignItems:'center', gap:6 }}>
        MODEL vs OBSERVATION INTELLIGENCE
        <InfoButton
          content="This panel compares what the INCOIS numerical ocean model predicted vs what the real Argo float actually measured at the same location and time. Bias = Model − Observation. Positive bias means the model overestimates; negative means underestimates. RMSE (Root Mean Square Error) and Correlation measure overall model skill across the full depth profile."
          title="Model vs Observation Comparison"
          position="bottom"
        />
      </div>
      <div
        style={{
          background: 'rgba(4, 27, 46, 0.85)',
          border: '1px solid rgba(0, 212, 255, 0.25)',
          borderRadius: 10,
          padding: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#e8f4f8',
            marginBottom: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Temperature @ {compDepth} m depth</span>
          <span
            style={{
              fontSize: 9,
              background: 'rgba(0,212,255,0.15)',
              color: '#00ffff',
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'monospace',
            }}
          >
            INCOIS IGORA / HYCOM
          </span>
        </div>

        {/* 3 Metric Box Display */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, textAlign: 'center' }}>
          <div
            style={{
              background: 'rgba(0, 212, 255, 0.08)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              borderRadius: 6,
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: 9, color: '#8ba7bb', textTransform: 'uppercase', marginBottom: 4 }}>
              Observed (Argo)
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff' }}>
              {surfaceObs !== undefined ? `${surfaceObs.toFixed(2)}°C` : '—'}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(0, 255, 255, 0.08)',
              border: '1px solid rgba(0, 255, 255, 0.2)',
              borderRadius: 6,
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: 9, color: '#8ba7bb', textTransform: 'uppercase', marginBottom: 4 }}>
              Ocean Model
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00ffff' }}>
              {hycomVal !== null ? `${hycomVal.toFixed(2)}°C` : '—'}
            </div>
          </div>

          <div
            style={{
              background:
                hycomVal !== null && surfaceObs !== undefined
                  ? (hycomVal - (surfaceObs as number)) > 0
                    ? 'rgba(255,82,82,0.1)'
                    : 'rgba(0,230,118,0.1)'
                  : 'rgba(255,255,255,0.05)',
              border: `1px solid ${
                hycomVal !== null && surfaceObs !== undefined
                  ? (hycomVal - (surfaceObs as number)) > 0
                    ? 'rgba(255,82,82,0.3)'
                    : 'rgba(0,230,118,0.3)'
                  : 'rgba(255,255,255,0.1)'
              }`,
              borderRadius: 6,
              padding: '8px 4px',
            }}
          >
            <div style={{ fontSize: 9, color: '#8ba7bb', textTransform: 'uppercase', marginBottom: 4 }}>
              Model Bias Δ
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: hycomVal !== null && surfaceObs !== undefined
                  ? (hycomVal - (surfaceObs as number)) > 0 ? '#ff5252' : '#00e676'
                  : '#8ba7bb',
              }}
            >
              {hycomVal !== null && surfaceObs !== undefined
                ? (() => {
                    const d = hycomVal - (surfaceObs as number)
                    return `${d > 0 ? '+' : ''}${d.toFixed(2)}°C`
                  })()
                : '—'}
            </div>
          </div>
        </div>

        {/* Statistical Summary */}
        {stats && stats.rmse !== undefined && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 4,
              fontSize: 9,
              textAlign: 'center',
            }}
          >
            <div>
            <div style={{ color: '#8ba7bb' }}>RMSE
            <InfoButton content="Root Mean Square Error — measures average error magnitude between model and observations across all depth levels. Lower RMSE = better model skill. Values below 0.5°C for temperature are considered good for operational ocean forecasting." title="RMSE" position="bottom" />
          </div>
              <div style={{ fontWeight: 700, color: '#00d4ff', marginTop: 2, fontSize: 11 }}>
                {stats.rmse.toFixed(3)}°C
              </div>
            </div>
            <div>
              <div style={{ color: '#8ba7bb' }}>Mean Bias
                <InfoButton content="Mean Bias = average of (Model − Observation) over all depth levels. Positive bias means the model consistently runs warmer/saltier than reality. A persistent positive bias in the Arabian Sea in summer indicates the model is not capturing monsoon cooling correctly." title="Mean Bias" position="bottom" />
              </div>
              <div
                style={{
                  fontWeight: 700,
                  color: (stats.mean_bias || 0) >= 0 ? '#ff7043' : '#29b6f6',
                  marginTop: 2,
                  fontSize: 11,
                }}
              >
                {(stats.mean_bias || 0) > 0 ? '+' : ''}
                {stats.mean_bias?.toFixed(3)}°C
              </div>
            </div>
            <div>
              <div style={{ color: '#8ba7bb' }}>Correlation (r)
                <InfoButton content="Pearson correlation coefficient between model and observed vertical profiles. r=1.0 means perfect agreement in shape. r>0.95 is excellent. Low correlation means the model captures the surface well but may have wrong thermocline depth or deep water mass properties." title="Correlation Coefficient" position="bottom" />
              </div>
              <div style={{ fontWeight: 700, color: '#ab47bc', marginTop: 2, fontSize: 11 }}>
                {stats.correlation !== undefined && stats.correlation !== null
                  ? stats.correlation.toFixed(3)
                  : 'N/A'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PointFactorDetails({ selectedObject }: { selectedObject: any }) {
  const meta = selectedObject.metadata || {}
  const factors = meta.factors || {}
  const query = meta.query || {}

  const lat = query.lat ?? selectedObject.position?.lat ?? 0
  const lon = query.lon ?? selectedObject.position?.lon ?? 0
  const depthM = query.depth_m ?? selectedObject.position?.depth_m ?? 0

  // API field name map: backend returns these exact keys
  const temp   = factors.temperature    ?? factors.temperature_c    ?? null
  const sal    = factors.salinity       ?? factors.salinity_psu     ?? null
  const uCur   = factors.u_current      ?? factors.u                ?? null
  const vCur   = factors.v_current      ?? factors.v                ?? null
  const speed  = factors.current_speed  ?? factors.current_speed_ms ?? null
  const dir    = factors.current_direction_deg ?? null
  const density= factors.density_kg_m3  ?? null
  const sound  = factors.sound_speed_m_s ?? factors.sound_velocity_ms ?? null
  const o2     = factors.dissolved_o2_umol_kg ?? factors.dissolved_oxygen_umol_kg ?? null
  const press  = factors.hydrostatic_pressure_dbar ?? depthM

  const fmt = (v: number | null, dec = 2) => v != null ? v.toFixed(dec) : '—'

  const rows: { label: string; value: string; color: string }[] = [
    { label: 'Temperature',     value: `${fmt(temp)} °C`,        color: '#ff5252' },
    { label: 'Salinity',        value: `${fmt(sal)} PSU`,         color: '#29b6f6' },
    { label: 'Current Speed',   value: `${fmt(speed, 3)} m/s`,   color: '#00e676' },
    { label: 'Flow Direction',  value: dir != null ? `${fmt(dir, 1)}°` : '—', color: '#69f0ae' },
    { label: 'U (East)',        value: `${fmt(uCur, 3)} m/s`,    color: '#80cbc4' },
    { label: 'V (North)',       value: `${fmt(vCur, 3)} m/s`,    color: '#80cbc4' },
    { label: 'Seawater Density',value: `${fmt(density)} kg/m³`,  color: '#ffd740' },
    { label: 'Sound Velocity',  value: `${fmt(sound, 1)} m/s`,   color: '#ffab40' },
    { label: 'Dissolved O₂',   value: `${fmt(o2)} µmol/kg`,     color: '#ffb74d' },
    { label: 'Pressure',        value: `${fmt(press, 1)} dbar`,  color: '#26c6da' },
  ]

  return (
    <div className="card fade-in">
      <div className="card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌊</span>
          <div>
            <div className="card__title" style={{ fontSize: 13, color: '#00d4ff' }}>
              {selectedObject.title || 'Water Column Telemetry'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {lat.toFixed(3)}°N · {lon.toFixed(3)}°E · {depthM} m depth
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, padding: '10px 12px' }}>
        {rows.map(item => (
          <div
            key={item.label}
            style={{
              background: 'rgba(0,212,255,0.05)',
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid rgba(0,212,255,0.1)',
            }}
          >
            <div style={{ fontSize: 8.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {item.label}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: item.color, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Source provenance */}
      <div style={{ padding: '0 12px 10px', fontSize: 9, color: '#475569' }}>
        Source: {meta.source ?? selectedObject.source ?? 'INCOIS IGORA / HYCOM'}
      </div>
    </div>
  )
}
