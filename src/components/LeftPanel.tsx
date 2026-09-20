import React, { useState } from 'react'
import { OceanVariable } from '../cesium/types'
import { ArgoMetadata } from '../services/api'
import { useCesium } from '../cesium/CesiumContext'
import InfoButton from './InfoButton'

interface BBox { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
interface LeftPanelProps {
  argoMeta: ArgoMetadata | null
  selectedBBox?: BBox | null
  onManualBBox?: (bbox: BBox) => void
}

const DEPTHS = [0, 10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000]

const VARIABLES: { value: OceanVariable; label: string; icon: string; info: string }[] = [
  {
    value: 'temperature', label: 'Temperature (°C)', icon: '🌡',
    info: 'Sea water temperature in °C at the selected depth level. Surface temperature (SST) is critical for understanding cyclone intensification, monsoon strength, and marine heat waves. INCOIS IGORA/HYCOM model outputs this field across all 14 depth layers.'
  },
  {
    value: 'salinity', label: 'Salinity (PSU)', icon: '🧂',
    info: 'Salinity in Practical Salinity Units (PSU). The Bay of Bengal has lower salinity (~32 PSU) due to river runoff & monsoon rainfall, while the Arabian Sea is saltier (~36 PSU). Salinity difference drives ocean stratification and current systems.'
  },
  {
    value: 'current_speed', label: 'Current Speed (m/s)', icon: '🌊',
    info: 'Horizontal current speed in metres per second, derived from u (east-west) and v (north-south) velocity components in the HYCOM model. The Somali Current can reach 2+ m/s during SW Monsoon, affecting shipping lanes and search & rescue.'
  },
  {
    value: 'ssh', label: 'Sea Surface Height (m)', icon: '📏',
    info: 'Sea Surface Height (SSH) anomaly in metres relative to a mean sea level. High SSH indicates warm-core eddies (potential cyclone fuel). Low SSH indicates cold upwelling (good fishery zones). Measured by satellite altimeters, modelled by IGORA.'
  },
]

// ── Info texts for each section / control ──────────────────────────────
const INFO = {
  modelSource:
    'The Numerical Ocean Model is a supercomputer simulation of the Indian Ocean. INCOIS IGORA is India\'s own model. HYCOM (Hybrid Coordinate Ocean Model) is US Navy\'s global model. Copernicus GLORYS12V1 is the EU reanalysis. These models solve ocean physics equations on a 3D grid every few hours.',
  depthSlice:
    'The ocean is divided into depth layers — Surface (0 m), mixed layer (~0–100 m), thermocline (~100–500 m), and deep water (>500 m). Selecting a depth "slices" the 3D model field at that level, like a CT-scan of the ocean. This is the core 3D visualization capability of SamudraTech.',
  argoFloats:
    'Argo profiling floats are autonomous underwater robots deployed by INCOIS and partner agencies. Each float sinks to 2000 m, drifts with currents, then rises while measuring Temperature and Salinity — transmitting data via satellite. INCOIS has 13,148+ real profiles in their ERDDAP database covering 2018–2025.',
  gliders:
    'Underwater Gliders are autonomous vehicles that fly through the ocean in a saw-tooth pattern, measuring Temperature, Salinity, and Chlorophyll over hundreds of km. INCOIS deployed gliders in the Bay of Bengal to study the Indian Ocean Dipole and monsoon preconditioning.',
  modelDepthField:
    'The 3D Model Depth Field renders the numerical ocean model output as a colored surface at the selected depth. Colors represent the variable value (red=hot, blue=cold for temperature). This allows visual detection of warm eddies, cold upwelling, and regional anomalies — impossible to see from tabular data alone.',
  currentVectors:
    'Current vectors show the u (east) and v (north) velocity components from the model as directional arrows. The Somali Current flows northward in summer (SW Monsoon). The East India Coastal Current reverses seasonally. Vectors help predict object drift paths for search-and-rescue and oil spill response.',
  modelBiasMap:
    'The Model Bias Map shows where the model prediction differs from actual Argo float observations. Positive bias (warm colors) = model overestimates temperature. Negative bias = model underestimates. Systematic regional biases indicate areas needing model improvement or data assimilation.',
  vertExag:
    'Vertical Exaggeration scales the depth dimension relative to the horizontal. Since the ocean is ~70 million km² wide but only ~3–4 km deep, 1× scale makes depth features invisible. Higher exaggeration makes thermocline and depth layers visually prominent.',
}

export default function LeftPanel({ argoMeta }: LeftPanelProps) {
  const { state, setVariable, setDepth, setLayerVisibility } = useCesium()

  return (
    <aside className="left-panel">

      {/* ── 1. Numerical Ocean Model ─────────────────────────────── */}
      <Section title="Ocean Model Source" info={INFO.modelSource}>
        <div className="model-badge">
          <span className="model-badge__dot" />
          <span className="model-badge__name">INCOIS IGORA</span>
          <span className="model-badge__status">Live</span>
        </div>
      </Section>

      {/* ── 2. Ocean Variable ────────────────────────────────────── */}
      <Section title="Ocean Variable" info="Select which ocean parameter to visualize in 3D. Each variable comes from the numerical model output (NetCDF) and can be compared against real Argo float observations.">
        <div className="var-grid">
          {VARIABLES.map(v => (
            <button
              key={v.value}
              id={`var-btn-${v.value}`}
              className={`var-btn ${state.variable === v.value ? 'var-btn--active' : ''}`}
              onClick={() => setVariable(v.value as OceanVariable)}
              title={v.info}
            >
              <span className="var-btn__icon">{v.icon}</span>
              <span className="var-btn__label">{v.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <div className="depth-label" style={{ marginTop: 6 }}>
          Active: <b style={{ color: '#38bdf8' }}>{VARIABLES.find(v => v.value === state.variable)?.label}</b>
        </div>
      </Section>

      {/* ── 3. Depth Slice Navigation ────────────────────────────── */}
      <Section title="Depth Slice" info={INFO.depthSlice}>
        <select
          id="depth-select"
          className="control-select"
          value={state.depth_m}
          onChange={e => setDepth(Number(e.target.value))}
        >
          {DEPTHS.map(d => (
            <option key={d} value={d}>{d === 0 ? 'Surface (0 m)' : `${d} m`}</option>
          ))}
        </select>
        {/* Visual depth bar */}
        <div className="depth-bar">
          <div className="depth-bar__fill" />
          <div
            className="depth-bar__marker"
            style={{ top: `${Math.min(92, (Math.log1p(state.depth_m) / Math.log1p(2000)) * 100)}%` }}
          />
          <span className="depth-bar__label depth-bar__label--top">0 m — Surface</span>
          <span className="depth-bar__label depth-bar__label--mid">500 m</span>
          <span className="depth-bar__label depth-bar__label--bot">2000 m</span>
          <span
            className="depth-bar__cur"
            style={{ top: `calc(${Math.min(88, (Math.log1p(state.depth_m) / Math.log1p(2000)) * 100)}% - 2px)` }}
          >
            {state.depth_m} m ◀
          </span>
        </div>
      </Section>

      {/* ── 4. Observation Layers ────────────────────────────────── */}
      <Section title="Observation Layers" info="Real in-situ observations from autonomous instruments deployed in the Indian Ocean. Toggle to overlay them on the 3D globe alongside model predictions.">
        <LayerToggle
          id="toggle-argo"
          label="Argo Floats"
          sub={`${argoMeta?.total_profiles?.toLocaleString() ?? '—'} profiles`}
          icon="🟡"
          active={state.layers.argo}
          onToggle={() => setLayerVisibility('argo', !state.layers.argo)}
          info={INFO.argoFloats}
        />
        <LayerToggle
          id="toggle-glider"
          label="Underwater Gliders"
          sub="Bay of Bengal tracks"
          icon="🔶"
          active={state.layers.glider}
          onToggle={() => setLayerVisibility('glider', !state.layers.glider)}
          info={INFO.gliders}
        />
      </Section>

      {/* ── 5. Model Layers ─────────────────────────────────────── */}
      <Section title="Model Layers" info="Outputs from the INCOIS numerical ocean model. These are predictions/simulations that can be compared against real observation data to assess model accuracy.">
        <LayerToggle
          id="toggle-model-slice"
          label="Model Depth Field"
          sub="3D volumetric slice"
          icon="🌐"
          active={state.layers.model_slice}
          onToggle={() => setLayerVisibility('model_slice', !state.layers.model_slice)}
          info={INFO.modelDepthField}
        />
        <LayerToggle
          id="toggle-currents"
          label="Current Vectors (u,v)"
          sub="Directional flow arrows"
          icon="➡"
          active={state.layers.current_vectors}
          onToggle={() => setLayerVisibility('current_vectors', !state.layers.current_vectors)}
          info={INFO.currentVectors}
        />
        <LayerToggle
          id="toggle-error-map"
          label="Model Bias Map"
          sub="HYCOM − Argo error"
          icon="⚖"
          active={state.layers.model_error}
          onToggle={() => setLayerVisibility('model_error', !state.layers.model_error)}
          info={INFO.modelBiasMap}
        />
      </Section>

    </aside>
  )
}

/* ── Sub-components ──────────────────────────────────────────────── */

function Section({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-section__title">
        {title}
        {info && <InfoButton content={info} title={title} position="right" />}
      </div>
      <div className="panel-section__content">{children}</div>
    </div>
  )
}

function LayerToggle({
  id, label, sub, icon, active, onToggle, info,
}: {
  id: string; label: string; sub: string; icon: string
  active: boolean; onToggle: () => void; info?: string
}) {
  return (
    <button id={id} className={`layer-row ${active ? 'layer-row--on' : ''}`} onClick={onToggle}>
      <span className="layer-row__icon">{icon}</span>
      <div className="layer-row__text">
        <div className="layer-row__label">{label}</div>
        <div className="layer-row__sub">{sub}</div>
      </div>
      {info && (
        <span onClick={e => e.stopPropagation()}>
          <InfoButton content={info} title={label} position="left" />
        </span>
      )}
      <div className={`layer-row__toggle ${active ? 'layer-row__toggle--on' : ''}`} />
    </button>
  )
}
