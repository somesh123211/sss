import { useEffect, useState } from 'react'
import { SceneState } from '../types'
import { ArgoMetadata } from '../services/api'

interface BottomBarProps {
  scene: SceneState
  onSceneChange: (partial: Partial<SceneState>) => void
  argoMeta: ArgoMetadata | null
  currentDateStr?: string
}

const TEMP_COLORBAR = 'linear-gradient(to right, #313695, #4575b4, #74add1, #abd9e9, #e0f3f8, #ffffbf, #fee090, #fdae61, #f46d43, #d73027, #a50026)'
const PSAL_COLORBAR = 'linear-gradient(to right, #00897b, #26c6da, #80deea, #e0f7fa, #fff9c4, #fff176, #ffd54f, #ff8f00)'
const CURR_COLORBAR = 'linear-gradient(to right, #0d47a1, #1976d2, #42a5f5, #80d8ff, #a7ffeb, #64ffda, #1de9b6, #00bfa5)'

export default function BottomBar({ scene, onSceneChange, argoMeta, currentDateStr }: BottomBarProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  // Colorbar gradient selection
  const colorbar = scene.variable === 'salinity' ? PSAL_COLORBAR :
                   scene.variable === 'current_speed' ? CURR_COLORBAR : TEMP_COLORBAR

  const varLabel = scene.variable === 'temperature' ? 'Temp (°C)' :
                   scene.variable === 'salinity' ? 'Sal (PSU)' : 'Current (m/s)'
  const varMin = scene.variable === 'temperature' ? '2°C' :
                 scene.variable === 'salinity' ? '30' : '0.0'
  const varMax = scene.variable === 'temperature' ? '32°C' :
                 scene.variable === 'salinity' ? '38' : '1.5 m/s'

  // Time-step animation loop
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      onSceneChange({
        time_index: scene.time_index >= 100 ? 0 : scene.time_index + 1
      })
    }, 350)
    return () => clearInterval(timer)
  }, [isPlaying, scene.time_index, onSceneChange])

  // Calculate current interpolated date
  const startDate = argoMeta ? new Date(argoMeta.time_range.start).getTime() : new Date('2018-01-01').getTime()
  const endDate = argoMeta ? new Date(argoMeta.time_range.end).getTime() : new Date('2025-04-01').getTime()
  const currentTs = startDate + ((endDate - startDate) * (scene.time_index / 100))
  const displayDate = currentDateStr || new Date(currentTs).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  })

  return (
    <footer className="bottom-bar">
      {/* Timeline controls */}
      <div className="timeline-controls">
        <button
          id="timeline-prev"
          className="timeline-btn"
          title="Step backward"
          onClick={() => onSceneChange({ time_index: Math.max(0, scene.time_index - 1) })}
        >
          ◀
        </button>
        <button
          id="timeline-play"
          className="timeline-btn"
          title={isPlaying ? 'Pause animation' : 'Play time-step animation'}
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ background: isPlaying ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.1)', color: '#00ffff' }}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          id="timeline-next"
          className="timeline-btn"
          title="Step forward"
          onClick={() => onSceneChange({ time_index: Math.min(100, scene.time_index + 1) })}
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
        <div style={{
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
        }}>
          {displayDate}
        </div>

        <input
          id="timeline-slider"
          type="range"
          className="timeline-slider"
          min={0}
          max={100}
          value={scene.time_index}
          style={{ '--timeline-pct': `${scene.time_index}%` } as React.CSSProperties}
          onChange={e => onSceneChange({ time_index: Number(e.target.value) })}
        />

        <div className="timeline-time" style={{ textAlign: 'right', minWidth: 90, color: '#8ba7bb', fontSize: 10 }}>
          {formatDate(argoMeta?.time_range.end || '2025-04-01')}
        </div>
      </div>

      {/* Colorbar */}
      <div className="colorbar">
        <div className="colorbar__title">{varLabel}</div>
        <div className="colorbar__label">{varMin}</div>
        <div
          className="colorbar__gradient"
          style={{ background: colorbar }}
        />
        <div className="colorbar__label">{varMax}</div>
      </div>

      {/* Dataset info */}
      <div className="dataset-info">
        <div className="dataset-info__tag">INCOIS ARGO</div>
        <div className="dataset-info__tag" style={{ color: '#00ffff', background: 'rgba(0,212,255,0.15)', borderColor: 'rgba(0,212,255,0.4)' }}>
          HYCOM MODEL 3D
        </div>
      </div>
    </footer>
  )
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    })
  } catch {
    return isoString
  }
}
