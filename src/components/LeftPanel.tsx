import { useState } from 'react'
import { SceneState, OceanVariable } from '../types'
import { ArgoMetadata } from '../services/api'

interface BBox { lat_min: number; lat_max: number; lon_min: number; lon_max: number }

interface LeftPanelProps {
  scene: SceneState
  onSceneChange: (partial: Partial<SceneState>) => void
  argoMeta: ArgoMetadata | null
  selectedBBox?: BBox | null
  onManualBBox?: (bbox: BBox) => void
}

const DEPTHS = [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000]

export default function LeftPanel({ scene, onSceneChange, argoMeta, selectedBBox, onManualBBox }: LeftPanelProps) {
  const [manLat0, setManLat0] = useState('')
  const [manLat1, setManLat1] = useState('')
  const [manLon0, setManLon0] = useState('')
  const [manLon1, setManLon1] = useState('')
  return (
    <aside className="left-panel">
      {/* Data Source */}
      <div className="panel-section">
        <div className="panel-section__title">Data Sources</div>
        <div className="panel-section__content">
          <div className="toggle-group">
            <button
              id="toggle-argo"
              className={`toggle-btn ${scene.show_argo ? 'toggle-btn--active' : ''}`}
              onClick={() => onSceneChange({ show_argo: !scene.show_argo })}
            >
              <span>INCOIS Argo Floats</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-model"
              className={`toggle-btn ${scene.show_model ? 'toggle-btn--active' : ''}`}
              onClick={() => onSceneChange({ show_model: !scene.show_model })}
            >
              <span>HYCOM Model</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-currents"
              className={`toggle-btn ${scene.show_currents ? 'toggle-btn--active' : ''}`}
              onClick={() => onSceneChange({ show_currents: !scene.show_currents })}
            >
              <span>Current Vectors</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-glider"
              className={`toggle-btn ${scene.show_glider ? 'toggle-btn--active' : ''}`}
              onClick={() => onSceneChange({ show_glider: !scene.show_glider })}
            >
              <span>IFREMER Glider</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-bathymetry"
              className={`toggle-btn ${scene.show_bathymetry ? 'toggle-btn--active' : ''}`}
              onClick={() => onSceneChange({ show_bathymetry: !scene.show_bathymetry })}
            >
              <span>GEBCO Seafloor</span>
              <div className="toggle-dot" />
            </button>
          </div>
        </div>
      </div>

      {/* Variable Selection */}
      <div className="panel-section">
        <div className="panel-section__title">Variable</div>
        <div className="panel-section__content">
          <div className="control-group">
            <select
              id="variable-select"
              className="control-select"
              value={scene.variable}
              onChange={e => onSceneChange({ variable: e.target.value as OceanVariable })}
            >
              <option value="temperature">Temperature (°C)</option>
              <option value="salinity">Salinity (PSU)</option>
              <option value="current_speed">Current Speed (m/s)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Depth */}
      <div className="panel-section">
        <div className="panel-section__title">Depth</div>
        <div className="panel-section__content">
          <div className="control-group">
            <div className="control-label">Pressure / Depth Level</div>
            <select
              id="depth-select"
              className="control-select"
              value={scene.depth_m}
              onChange={e => onSceneChange({ depth_m: Number(e.target.value) })}
            >
              {DEPTHS.map(d => (
                <option key={d} value={d}>
                  {d === 0 ? '0 m (Surface)' : `${d} m`}
                </option>
              ))}
            </select>
            <div className="control-value" style={{ color: '#00d4ff', fontWeight: 700, fontSize: 12 }}>
              {scene.depth_m === 0 ? '🌊 Surface (0 dbar)' : `⬇ ${scene.depth_m} m depth`}
            </div>
            {/* Visual depth bar */}
            <div style={{ marginTop: 8, position: 'relative', height: 80, background: 'rgba(0,0,0,0.3)', borderRadius: 4, border: '1px solid rgba(0,212,255,0.2)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to bottom, rgba(0,180,220,0.5) 0%, rgba(0,80,160,0.7) 40%, rgba(0,30,80,0.9) 100%)' }} />
              {/* Active depth marker */}
              <div style={{
                position: 'absolute',
                left: 0, right: 0,
                top: `${Math.min(95, (Math.log1p(scene.depth_m) / Math.log1p(2000)) * 100)}%`,
                height: 2,
                background: '#00ffff',
                boxShadow: '0 0 6px #00ffff',
              }} />
              <div style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>0 m Surface</div>
              <div style={{ position: 'absolute', top: '40%', left: 4, fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>500 m</div>
              <div style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>2000 m Deep</div>
              <div style={{
                position: 'absolute',
                right: 4,
                top: `calc(${Math.min(91, (Math.log1p(scene.depth_m) / Math.log1p(2000)) * 100)}% - 1px)`,
                fontSize: 9, color: '#00ffff', fontWeight: 700, fontFamily: 'monospace'
              }}>{scene.depth_m}m ◀</div>
            </div>
            <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 4 }}>
              IGORA renders the 3D slice at selected depth
            </div>
          </div>
        </div>
      </div>

      {/* Vertical Exaggeration */}
      <div className="panel-section">
        <div className="panel-section__title">3D Settings</div>
        <div className="panel-section__content">
          <div className="control-group">
            <div className="control-label">Vertical Exaggeration</div>
            <input
              id="vert-exag-slider"
              type="range"
              className="control-slider"
              min={1} max={20} step={1}
              value={scene.vertical_exaggeration}
              style={{ '--slider-pct': `${((scene.vertical_exaggeration - 1) / 19) * 100}%` } as React.CSSProperties}
              onChange={e => onSceneChange({ vertical_exaggeration: Number(e.target.value) })}
            />
            <div className="control-value">{scene.vertical_exaggeration}×</div>
          </div>
          <div className="control-group">
            <div className="control-label">Marker Opacity</div>
            <input
              id="opacity-slider"
              type="range"
              className="control-slider"
              min={0.1} max={1.0} step={0.05}
              value={scene.opacity}
              style={{ '--slider-pct': `${scene.opacity * 100}%` } as React.CSSProperties}
              onChange={e => onSceneChange({ opacity: Number(e.target.value) })}
            />
            <div className="control-value">{Math.round(scene.opacity * 100)}%</div>
          </div>
        </div>
      </div>

      {/* Dataset Info */}
      {argoMeta && (
        <div className="panel-section">
          <div className="panel-section__title">Argo Dataset</div>
          <div className="panel-section__content">
            <MetaRow label="Platforms" value={String(argoMeta.unique_platforms)} />
            <MetaRow label="Profiles" value={argoMeta.total_profiles.toLocaleString()} />
            <MetaRow
              label="Start"
              value={new Date(argoMeta.time_range.start).toLocaleDateString()}
            />
            <MetaRow
              label="End"
              value={new Date(argoMeta.time_range.end).toLocaleDateString()}
            />
            <MetaRow
              label="Region"
              value={`${argoMeta.geographic_coverage.lat_min.toFixed(1)}–${argoMeta.geographic_coverage.lat_max.toFixed(1)}°N`}
            />
            <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              Source: INCOIS ERDDAP<br/>Indian_ARGO_Floats
            </div>
          </div>
        </div>
      )}

      {/* Selected Region */}
      <div className="panel-section">
        <div className="panel-section__title">Selected Region</div>
        <div className="panel-section__content">
          {selectedBBox ? (
            <div style={{ fontSize: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ padding: '6px 8px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 5 }}>
                <MetaRow label="Lat" value={`${selectedBBox.lat_min.toFixed(2)}° – ${selectedBBox.lat_max.toFixed(2)}°N`} />
                <MetaRow label="Lon" value={`${selectedBBox.lon_min.toFixed(2)}° – ${selectedBBox.lon_max.toFixed(2)}°E`} />
                <MetaRow label="Δ Lat" value={`${(selectedBBox.lat_max - selectedBBox.lat_min).toFixed(2)}°`} />
                <MetaRow label="Δ Lon" value={`${(selectedBBox.lon_max - selectedBBox.lon_min).toFixed(2)}°`} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Use <strong style={{ color: 'var(--color-accent-cyan)' }}>⬚ Select Region</strong> button in the 3D scene to draw a lat/lon bounding box.
            </div>
          )}
          {/* Manual coordinate input */}
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              { label: 'Lat Min', val: manLat0, set: setManLat0, ph: '0' },
              { label: 'Lat Max', val: manLat1, set: setManLat1, ph: '25' },
              { label: 'Lon Min', val: manLon0, set: setManLon0, ph: '60' },
              { label: 'Lon Max', val: manLon1, set: setManLon1, ph: '100' },
            ].map(({ label, val, set, ph }) => (
              <div key={label} className="control-group">
                <div className="control-label">{label}</div>
                <input
                  type="number"
                  className="control-select"
                  value={val}
                  placeholder={ph}
                  onChange={e => set(e.target.value)}
                  style={{ padding: '3px 6px', fontSize: 11 }}
                />
              </div>
            ))}
          </div>
          <button
            style={{
              width: '100%', marginTop: 6,
              padding: '5px 0', borderRadius: 4,
              background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
              color: 'var(--color-accent-cyan)', fontSize: 11, fontFamily: 'var(--font-sans)',
              cursor: 'pointer', fontWeight: 600,
            }}
            onClick={() => {
              const bbox = {
                lat_min: parseFloat(manLat0) || 0,
                lat_max: parseFloat(manLat1) || 25,
                lon_min: parseFloat(manLon0) || 60,
                lon_max: parseFloat(manLon1) || 100,
              }
              onManualBBox?.(bbox)
            }}
          >
            Apply Coordinates
          </button>
        </div>
      </div>

      {/* HYCOM Status — Live */}
      <div className="panel-section">
        <div className="panel-section__title">Model Status</div>
        <div className="panel-section__content">
          <div style={{
            padding: '8px 10px',
            background: 'rgba(0,212,255,0.06)',
            border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: 6,
            fontSize: 10,
            color: '#00d4ff',
            lineHeight: 1.7,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>✓ INCOIS HYCOM MODEL ACTIVE</div>
            <div style={{ color: '#8ba7bb' }}>Grid: 121 × 181 (0.25°)</div>
            <div style={{ color: '#8ba7bb' }}>Depth Levels: 0 → 2000 m (14 layers)</div>
            <div style={{ color: '#8ba7bb' }}>Coverage: 0°–30°N | 55°–100°E</div>
            <div style={{ color: '#8ba7bb' }}>Variables: T, S, u, v, SSH</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 8 }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontSize: 10 }}>
        {value}
      </span>
    </div>
  )
}
