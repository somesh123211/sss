import React, { useState } from 'react'
import { OceanVariable, ModelSourceId } from '../cesium/types'
import { ArgoMetadata } from '../services/api'
import { useCesium } from '../cesium/CesiumContext'

interface BBox {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

interface LeftPanelProps {
  argoMeta: ArgoMetadata | null
  selectedBBox?: BBox | null
  onManualBBox?: (bbox: BBox) => void
}

const DEPTHS = [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000]

export default function LeftPanel({ argoMeta, selectedBBox, onManualBBox }: LeftPanelProps) {
  const { state, setVariable, setDepth, setLayerVisibility, updateState } = useCesium()

  const [manLat0, setManLat0] = useState('')
  const [manLat1, setManLat1] = useState('')
  const [manLon0, setManLon0] = useState('')
  const [manLon1, setManLon1] = useState('')

  return (
    <aside className="left-panel">
      {/* Model Selection */}
      <div className="panel-section">
        <div className="panel-section__title">Numerical Ocean Model</div>
        <div className="panel-section__content">
          <div className="control-group">
            <select
              id="model-source-select"
              className="control-select"
              value={state.model_id}
              onChange={e => updateState({ model_id: e.target.value as ModelSourceId })}
            >
              <option value="igora">INCOIS IGORA (Active Model)</option>
              <option value="hycom">INCOIS RSMC HYCOM (NetCDF)</option>
              <option value="copernicus">Copernicus GLORYS12V1 (Reanalysis)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="panel-section">
        <div className="panel-section__title">Visualization Layers</div>
        <div className="panel-section__content">
          <div className="toggle-group">
            <button
              id="toggle-argo"
              className={`toggle-btn ${state.layers.argo ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('argo', !state.layers.argo)}
            >
              <span>INCOIS Argo Floats</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-model-slice"
              className={`toggle-btn ${state.layers.model_slice ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('model_slice', !state.layers.model_slice)}
            >
              <span>Model Depth Field</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-currents"
              className={`toggle-btn ${state.layers.current_vectors ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('current_vectors', !state.layers.current_vectors)}
            >
              <span>Current Vectors (u,v)</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-particles"
              className={`toggle-btn ${state.layers.current_particles ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('current_particles', !state.layers.current_particles)}
            >
              <span>Current Flow Particles</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-glider"
              className={`toggle-btn ${state.layers.glider ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('glider', !state.layers.glider)}
            >
              <span>IFREMER OceanGliders</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-bathymetry"
              className={`toggle-btn ${state.layers.bathymetry ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('bathymetry', !state.layers.bathymetry)}
            >
              <span>GEBCO Bathymetry Grid</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-error-map"
              className={`toggle-btn ${state.layers.model_error ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('model_error', !state.layers.model_error)}
            >
              <span>Model Error (Obs Bias)</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-density"
              className={`toggle-btn ${state.layers.observation_density ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('observation_density', !state.layers.observation_density)}
            >
              <span>Observation Density</span>
              <div className="toggle-dot" />
            </button>
            <button
              id="toggle-boundaries"
              className={`toggle-btn ${state.layers.boundaries ? 'toggle-btn--active' : ''}`}
              onClick={() => setLayerVisibility('boundaries', !state.layers.boundaries)}
            >
              <span>Regional Boundaries</span>
              <div className="toggle-dot" />
            </button>
          </div>
        </div>
      </div>

      {/* Variable Selection */}
      <div className="panel-section">
        <div className="panel-section__title">Ocean Variable</div>
        <div className="panel-section__content">
          <div className="control-group">
            <select
              id="variable-select"
              className="control-select"
              value={state.variable}
              onChange={e => setVariable(e.target.value as OceanVariable)}
            >
              <option value="temperature">Temperature (°C)</option>
              <option value="salinity">Salinity (PSU)</option>
              <option value="current_speed">Current Speed (m/s)</option>
              <option value="ssh">Sea Surface Height (m)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Depth Slider */}
      <div className="panel-section">
        <div className="panel-section__title">Depth Level</div>
        <div className="panel-section__content">
          <div className="control-group">
            <div className="control-label">Target Depth (m)</div>
            <select
              id="depth-select"
              className="control-select"
              value={state.depth_m}
              onChange={e => setDepth(Number(e.target.value))}
            >
              {DEPTHS.map(d => (
                <option key={d} value={d}>
                  {d === 0 ? 'Surface (0 m)' : `${d} m`}
                </option>
              ))}
            </select>
            <div className="control-value" style={{ color: '#00d4ff', fontWeight: 700, fontSize: 12 }}>
              {state.depth_m === 0 ? '🌊 Surface (0m)' : `⬇ ${state.depth_m} m depth`}
            </div>
            {/* Visual depth bar */}
            <div
              style={{
                marginTop: 8,
                position: 'relative',
                height: 70,
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 4,
                border: '1px solid rgba(0,212,255,0.2)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background:
                    'linear-gradient(to bottom, rgba(0,180,220,0.5) 0%, rgba(0,80,160,0.7) 40%, rgba(0,30,80,0.9) 100%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${Math.min(95, (Math.log1p(state.depth_m) / Math.log1p(2000)) * 100)}%`,
                  height: 2,
                  background: '#00ffff',
                  boxShadow: '0 0 6px #00ffff',
                }}
              />
              <div style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                0 m Surface
              </div>
              <div style={{ position: 'absolute', top: '40%', left: 4, fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>
                500 m
              </div>
              <div style={{ position: 'absolute', bottom: 2, left: 4, fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>
                2000 m Deep
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: 4,
                  top: `calc(${Math.min(91, (Math.log1p(state.depth_m) / Math.log1p(2000)) * 100)}% - 1px)`,
                  fontSize: 9,
                  color: '#00ffff',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                }}
              >
                {state.depth_m}m ◀
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Settings */}
      <div className="panel-section">
        <div className="panel-section__title">Geospatial 3D Controls</div>
        <div className="panel-section__content">
          <div className="control-group">
            <div className="control-label">Vertical Exaggeration</div>
            <input
              id="vert-exag-slider"
              type="range"
              className="control-slider"
              min={1}
              max={10}
              step={1}
              value={state.vertical_exaggeration}
              style={
                {
                  '--slider-pct': `${((state.vertical_exaggeration - 1) / 9) * 100}%`,
                } as React.CSSProperties
              }
              onChange={e => updateState({ vertical_exaggeration: Number(e.target.value) })}
            />
            <div className="control-value">{state.vertical_exaggeration}× (Cesium WGS84)</div>
          </div>
        </div>
      </div>

      {/* Dataset Info */}
      {argoMeta && (
        <div className="panel-section">
          <div className="panel-section__title">Argo Dataset Metadata</div>
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
              Source: INCOIS ERDDAP
              <br />
              Indian_ARGO_Floats
            </div>
          </div>
        </div>
      )}

      {/* Manual Coordinates Input */}
      <div className="panel-section">
        <div className="panel-section__title">Spatial Bounding Box</div>
        <div className="panel-section__content">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
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
              width: '100%',
              marginTop: 6,
              padding: '5px 0',
              borderRadius: 4,
              background: 'rgba(0,212,255,0.1)',
              border: '1px solid rgba(0,212,255,0.3)',
              color: 'var(--color-accent-cyan)',
              fontSize: 11,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              fontWeight: 600,
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
            Apply Bounding Box
          </button>
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
