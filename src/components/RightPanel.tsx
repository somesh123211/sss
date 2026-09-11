import { ArgoProfile, ComparisonData } from '../services/api'
import { SelectedFloat } from '../types'
import { useCesium } from '../cesium/CesiumContext'
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
  const { selectedObject } = useCesium()

  return (
    <aside className="right-panel">
      <div className="info-panel">
        {!selectedFloat && !selectedObject ? (
          <EmptyState />
        ) : selectedObject && selectedObject.type === 'point_factors' ? (
          <PointFactorDetails selectedObject={selectedObject} />
        ) : selectedObject && selectedObject.type === 'glider' ? (
          <GliderDetails selectedObject={selectedObject} />
        ) : selectedObject && selectedObject.type === 'error_cell' ? (
          <ErrorCellDetails selectedObject={selectedObject} />
        ) : selectedObject && selectedObject.type === 'model_cell' ? (
          <ModelCellDetails selectedObject={selectedObject} />
        ) : selectedFloat ? (
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
        Click any <b>Argo Float</b>, <b>Underwater Glider</b>, <b>Model Grid</b>, or <b>Error Anomaly Point</b> on the 3D Cesium Ocean Globe to inspect scientific profiles and colocation intelligence.
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
        <div>🌐 <b>3D Numerical Ocean Models</b> (INCOIS IGORA / Copernicus)</div>
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
      <div className="info-panel__title">Observation Details</div>
      <div className="float-card fade-in" style={{ padding: '12px 14px' }}>
        <div className="float-card__header" style={{ marginBottom: 8 }}>
          <div className="float-card__id" style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff' }}>
            Float #{f.platform_number}
          </div>
          <div
            className="float-card__cycle"
            style={{
              fontSize: 10,
              background: 'rgba(0,212,255,0.15)',
              padding: '2px 8px',
              borderRadius: 4,
              color: '#00ffff',
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
              {profile ? `${profile.pressure_range_dbar.max} dbar` : '—'}
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
}: {
  profile: ArgoProfile
  comparison: ComparisonData | null
}) {
  const surfaceObs = profile.data.temp[0]
  const modelInterp = comparison?.model?.interpolated_at_argo_depths?.[0]
  const hycomVal = typeof modelInterp === 'number' ? modelInterp : null
  const diff = surfaceObs !== undefined && hycomVal !== null ? hycomVal - surfaceObs : null

  const stats = comparison?.stats

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="info-panel__title" style={{ marginBottom: 8, color: '#00d4ff' }}>
        MODEL vs OBSERVATION INTELLIGENCE
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
          <span>Surface Water Temperature</span>
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
                diff !== null
                  ? diff > 0
                    ? 'rgba(255,82,82,0.1)'
                    : 'rgba(0,230,118,0.1)'
                  : 'rgba(255,255,255,0.05)',
              border: `1px solid ${
                diff !== null
                  ? diff > 0
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
                color: diff !== null ? (diff > 0 ? '#ff5252' : '#00e676') : '#8ba7bb',
              }}
            >
              {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}°C` : '—'}
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
              <div style={{ color: '#8ba7bb' }}>RMSE</div>
              <div style={{ fontWeight: 700, color: '#00d4ff', marginTop: 2, fontSize: 11 }}>
                {stats.rmse.toFixed(3)}°C
              </div>
            </div>
            <div>
              <div style={{ color: '#8ba7bb' }}>Mean Bias</div>
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
              <div style={{ color: '#8ba7bb' }}>Correlation (r)</div>
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
  const profile = meta.profile || {}
  const query = meta.query || {}
  const gridLoc = meta.grid_location || {}

  const lat = query.lat ?? selectedObject.position?.lat ?? 0
  const lon = query.lon ?? selectedObject.position?.lon ?? 0
  const depthM = query.depth_m ?? selectedObject.position?.depth_m ?? 0

  return (
    <div className="card">
      <div className="card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🌊</span>
          <div>
            <div className="card__title">Ocean Multi-Factor Telemetry</div>
            <div className="card__subtitle" style={{ color: '#00d4ff', fontFamily: 'monospace' }}>
              {lat.toFixed(3)}°N, {lon.toFixed(3)}°E · Depth: {depthM} m
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            background: 'rgba(0,212,255,0.15)',
            border: '1px solid rgba(0,212,255,0.3)',
            color: '#00ffff',
            padding: '2px 8px',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          {meta.source || 'INCOIS Model'}
        </span>
      </div>

      <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Layer Zone Banner */}
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(0,212,255,0.12), rgba(2,8,20,0.4))',
            borderLeft: '3px solid #00d4ff',
            padding: '8px 12px',
            borderRadius: '0 6px 6px 0',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00e5ff' }}>
            🏷️ {factors.layer_name || 'Ocean Depth Layer'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {factors.layer_desc || 'Hydrodynamic ocean water mass at target depth level.'}
          </div>
        </div>

        {/* 6 Metric Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {/* Temperature */}
          <div
            style={{
              background: 'rgba(2,16,38,0.7)',
              border: '1px solid rgba(255,100,100,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 9, color: '#ff8a80', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🌡️</span> Temperature
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ff5252', marginTop: 3 }}>
              {factors.temperature !== null && factors.temperature !== undefined
                ? `${factors.temperature.toFixed(2)} °C`
                : '—'}
            </div>
          </div>

          {/* Salinity */}
          <div
            style={{
              background: 'rgba(2,16,38,0.7)',
              border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 9, color: '#80d8ff', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🧂</span> Salinity
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#00e5ff', marginTop: 3 }}>
              {factors.salinity !== null && factors.salinity !== undefined
                ? `${factors.salinity.toFixed(2)} PSU`
                : '—'}
            </div>
          </div>

          {/* Current Speed */}
          <div
            style={{
              background: 'rgba(2,16,38,0.7)',
              border: '1px solid rgba(0,230,118,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 9, color: '#b9f6ca', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>💨</span> Current Speed
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#00e676', marginTop: 3 }}>
              {factors.current_speed !== null && factors.current_speed !== undefined
                ? `${factors.current_speed.toFixed(3)} m/s`
                : '—'}
            </div>
            <div style={{ fontSize: 9, color: '#8ba7bb', marginTop: 2, fontFamily: 'monospace' }}>
              U: {factors.u_current ?? 0} · V: {factors.v_current ?? 0} · {factors.current_direction_deg ?? 0}°
            </div>
          </div>

          {/* Sea Surface Height */}
          <div
            style={{
              background: 'rgba(2,16,38,0.7)',
              border: '1px solid rgba(179,136,255,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 9, color: '#d1c4e9', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🌊</span> Sea Surface Height
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#b388ff', marginTop: 3 }}>
              {factors.ssh !== null && factors.ssh !== undefined
                ? `${factors.ssh > 0 ? '+' : ''}${factors.ssh.toFixed(3)} m`
                : '—'}
            </div>
          </div>

          {/* Density */}
          <div
            style={{
              background: 'rgba(2,16,38,0.7)',
              border: '1px solid rgba(255,215,64,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 9, color: '#ffe57f', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⚖️</span> Seawater Density
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffd740', marginTop: 3 }}>
              {factors.density_kg_m3 !== null && factors.density_kg_m3 !== undefined
                ? `${factors.density_kg_m3.toFixed(2)} kg/m³`
                : '—'}
            </div>
          </div>

          {/* Sound Speed */}
          <div
            style={{
              background: 'rgba(2,16,38,0.7)',
              border: '1px solid rgba(255,171,64,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: 9, color: '#ffd180', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🔊</span> Sound Velocity
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffab40', marginTop: 3 }}>
              {factors.sound_speed_m_s !== null && factors.sound_speed_m_s !== undefined
                ? `${factors.sound_speed_m_s.toFixed(1)} m/s`
                : '—'}
            </div>
          </div>
        </div>

        {/* Model Grid Resolution Metadata */}
        <div
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 10,
            color: '#8ba7bb',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Grid Point: [{gridLoc.grid_index?.[0] ?? '—'}, {gridLoc.grid_index?.[1] ?? '—'}]</span>
          <span>Distance to Node: {gridLoc.dist_km ?? 0} km</span>
        </div>

        {/* Vertical Profile Depth Table / Chart */}
        {profile.depth_levels_m && profile.depth_levels_m.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#e0f2fe', marginBottom: 6 }}>
              📊 Vertical Water Column Profile
            </div>
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                border: '1px solid rgba(0,212,255,0.15)',
                borderRadius: 6,
                background: 'rgba(2,8,20,0.6)',
              }}
            >
              <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,212,255,0.08)', color: '#8ba7bb' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Depth (m)</th>
                    <th style={{ padding: '4px 6px', color: '#ff5252' }}>Temp (°C)</th>
                    <th style={{ padding: '4px 6px', color: '#00e5ff' }}>Sal (PSU)</th>
                    <th style={{ padding: '4px 6px', color: '#00e676' }}>Speed (m/s)</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.depth_levels_m.map((d: number, i: number) => (
                    <tr
                      key={d}
                      style={{
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        background: Math.abs(d - depthM) < 15 ? 'rgba(0,212,255,0.15)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '3px 6px', textAlign: 'left', fontWeight: Math.abs(d - depthM) < 15 ? 700 : 400, color: Math.abs(d - depthM) < 15 ? '#00ffff' : '#8ba7bb' }}>
                        {d} m
                      </td>
                      <td style={{ padding: '3px 6px', color: '#ff8a80' }}>
                        {profile.temperature?.[i] !== null && profile.temperature?.[i] !== undefined
                          ? profile.temperature[i].toFixed(2)
                          : '—'}
                      </td>
                      <td style={{ padding: '3px 6px', color: '#80d8ff' }}>
                        {profile.salinity?.[i] !== null && profile.salinity?.[i] !== undefined
                          ? profile.salinity[i].toFixed(2)
                          : '—'}
                      </td>
                      <td style={{ padding: '3px 6px', color: '#b9f6ca' }}>
                        {profile.current_speed?.[i] !== null && profile.current_speed?.[i] !== undefined
                          ? profile.current_speed[i].toFixed(3)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

