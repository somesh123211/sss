import React, { useEffect, useState } from 'react'
import { ArgoMetadata } from '../services/api'
import { useCesium } from '../cesium/CesiumContext'

interface BottomBarProps {
  argoMeta: ArgoMetadata | null
}

const TEMP_COLORBAR =
  'linear-gradient(to right, rgb(4,4,30), rgb(20,60,140), rgb(30,140,170), rgb(45,185,140), rgb(230,190,50), rgb(240,60,40))'
const PSAL_COLORBAR =
  'linear-gradient(to right, rgb(20,30,80), rgb(50,110,140), rgb(100,180,130), rgb(210,210,120), rgb(250,240,200))'
const CURR_COLORBAR =
  'linear-gradient(to right, rgb(10,20,50), rgb(0,160,220), rgb(50,230,140), rgb(250,210,40), rgb(255,50,20))'
const BIAS_COLORBAR =
  'linear-gradient(to right, rgb(20,90,230), rgb(120,180,250), rgb(240,245,250), rgb(250,160,120), rgb(230,40,30))'

export default function BottomBar({ argoMeta }: BottomBarProps) {
  const { controllerRef, state, setTimeIndex } = useCesium()
  const [isPlaying, setIsPlaying] = useState(false)

  // Colorbar gradient selection
  const colorbar = state.layers.model_error
    ? BIAS_COLORBAR
    : state.variable === 'salinity'
    ? PSAL_COLORBAR
    : state.variable === 'current_speed'
    ? CURR_COLORBAR
    : TEMP_COLORBAR

  const varLabel = state.layers.model_error
    ? 'Bias (°C / PSU)'
    : state.variable === 'temperature'
    ? 'Temp (°C)'
    : state.variable === 'salinity'
    ? 'Sal (PSU)'
    : 'Current (m/s)'

  const varMin = state.layers.model_error
    ? '-2.0'
    : state.variable === 'temperature'
    ? '15°C'
    : state.variable === 'salinity'
    ? '32'
    : '0.0'

  const varMax = state.layers.model_error
    ? '+2.0'
    : state.variable === 'temperature'
    ? '32°C'
    : state.variable === 'salinity'
    ? '37'
    : '1.5 m/s'

  // Time-step animation loop
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      setTimeIndex(state.time_index >= 100 ? 0 : state.time_index + 1)
    }, 350)
    return () => clearInterval(timer)
  }, [isPlaying, state.time_index, setTimeIndex])

  // Compute active date string
  const startDate = argoMeta ? new Date(argoMeta.time_range.start).getTime() : new Date('2018-01-01').getTime()
  const endDate = argoMeta ? new Date(argoMeta.time_range.end).getTime() : new Date('2025-04-01').getTime()
  const currentTs = startDate + (endDate - startDate) * (state.time_index / 100)
  const displayDate = new Date(currentTs).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <footer className="bottom-bar">
      {/* Timeline controls */}
      <div className="timeline-controls">
        <button
          id="timeline-prev"
          className="timeline-btn"
          title="Step backward"
          onClick={() => {
            controllerRef.current?.clock?.stepBackward(15)
            setTimeIndex(Math.max(0, state.time_index - 1))
          }}
        >
          ◀
        </button>
        <button
          id="timeline-play"
          className="timeline-btn"
          title={isPlaying ? 'Pause animation' : 'Play time-step animation'}
          onClick={() => {
            setIsPlaying(!isPlaying)
            controllerRef.current?.clock?.togglePlay()
          }}
          style={{
            background: isPlaying ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.1)',
            color: '#00ffff',
          }}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          id="timeline-next"
          className="timeline-btn"
          title="Step forward"
          onClick={() => {
            controllerRef.current?.clock?.stepForward(15)
            setTimeIndex(Math.min(100, state.time_index + 1))
          }}
        >
          ▶▶
        </button>
      </div>

      {/* Timeline slider */}
      <div className="timeline-track">
        <div className="timeline-time" style={{ minWidth: 90, color: '#8ba7bb', fontSize: 10 }}>
          {formatDate(argoMeta?.time_range.start || '2018-01-01')}
        </div>

        {/* Current Active Date Badge */}
        <div
          style={{
            background: 'rgba(0,212,255,0.2)',
            border: '1px solid rgba(0,212,255,0.5)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 700,
            color: '#00ffff',
            minWidth: 100,
            textAlign: 'center',
            fontFamily: 'monospace',
            boxShadow: '0 0 10px rgba(0,212,255,0.3)',
          }}
        >
          {displayDate}
        </div>

        <input
          id="timeline-slider"
          type="range"
          className="timeline-slider"
          min={0}
          max={100}
          value={state.time_index}
          style={{ '--timeline-pct': `${state.time_index}%` } as React.CSSProperties}
          onChange={e => {
            const val = Number(e.target.value)
            setTimeIndex(val)
            controllerRef.current?.clock?.setTimeFraction(val / 100)
          }}
        />

        <div className="timeline-time" style={{ textAlign: 'right', minWidth: 90, color: '#8ba7bb', fontSize: 10 }}>
          {formatDate(argoMeta?.time_range.end || '2025-04-01')}
        </div>
      </div>

      {/* Colorbar */}
      <div className="colorbar">
        <div className="colorbar__title">{varLabel}</div>
        <div className="colorbar__label">{varMin}</div>
        <div className="colorbar__gradient" style={{ background: colorbar }} />
        <div className="colorbar__label">{varMax}</div>
      </div>

      {/* Dataset info */}
      <div className="dataset-info">
        <div className="dataset-info__tag">CESIUM WGS84</div>
        <div
          className="dataset-info__tag"
          style={{
            color: '#00ffff',
            background: 'rgba(0,212,255,0.15)',
            borderColor: 'rgba(0,212,255,0.4)',
          }}
        >
          INCOIS 3D TWIN
        </div>
      </div>
    </footer>
  )
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return isoString
  }
}
