import React, { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useCesium } from './CesiumContext'
import { CesiumSceneController } from './CesiumSceneController'
import { ArgoFloat } from '../services/api'
import { INDIAN_OCEAN_REGIONS } from './utils/coordinates'

interface CesiumViewerProps {
  floats: ArgoFloat[]
  onSelectFloat?: (float: any) => void
  selectedFloat?: any
}

export const CesiumViewer: React.FC<CesiumViewerProps> = ({ floats, onSelectFloat, selectedFloat }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { controllerRef, state, setSelectedObject, updateState } = useCesium()

  useEffect(() => {
    if (!containerRef.current) return

    // Set Ion token if provided via environment
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken
    }

    // Configure resilient viewer with high quality globe and minimal clutter
    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
      shadows: false,
      shouldAnimate: true,
      contextOptions: {
        webgl: {
          alpha: false,
          depth: true,
          stencil: false,
          antialias: true,
          preserveDrawingBuffer: true,
        },
      },
    })

    // Ocean environment styling (remove space stars, enable marine atmosphere)
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#020b18')
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.skyAtmosphere.brightnessShift = 0.2
    }
    viewer.scene.globe.showGroundAtmosphere = true
    viewer.scene.globe.enableLighting = true

    // Setup imagery provider
    try {
      const imageryLayers = viewer.imageryLayers
      imageryLayers.removeAll()

      const osmProvider = new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      })
      imageryLayers.addImageryProvider(osmProvider)
    } catch (e) {
      console.warn('Imagery provider fallback:', e)
    }

    // Initialize master controller
    const controller = new CesiumSceneController(
      viewer,
      selected => {
        setSelectedObject(selected)
        if (selected && selected.type === 'argo' && onSelectFloat) {
          onSelectFloat({
            platform_number: selected.metadata?.platform_number,
            cycle_number: selected.metadata?.cycle_number,
            latitude: selected.position.lat,
            longitude: selected.position.lon,
            time: selected.time,
          })
        }
      },
      (timeMs, timeIso, timeIndex) => {
        updateState({ time_iso: timeIso, time_index: timeIndex })
      }
    )

    controllerRef.current = controller
    controller.setArgoFloats(floats)
    controller.updateState(state)

    return () => {
      controller.destroy()
      controllerRef.current = null
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
    }
  }, [])

  // Update floats whenever loaded
  useEffect(() => {
    if (controllerRef.current && floats.length > 0) {
      controllerRef.current.setArgoFloats(floats)
    }
  }, [floats])

  // Sync state changes with controller
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.updateState(state)
    }
  }, [state])

  // Sync selectedFloat with controller
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.argo.selectFloat(selectedFloat ?? null)
    }
  }, [selectedFloat])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Region Quick Presets & HUD */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 15,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: 'rgba(6, 12, 26, 0.88)',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid rgba(0, 212, 255, 0.3)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: '#00d4ff', letterSpacing: 0.8 }}>
          🌐 INDIAN OCEAN REGIONS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {Object.entries(INDIAN_OCEAN_REGIONS).map(([key, reg]) => (
            <button
              key={key}
              onClick={() => controllerRef.current?.camera.flyToRegion(reg)}
              style={{
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 600,
                background: 'rgba(0, 212, 255, 0.12)',
                color: '#e0f7fa',
                border: '1px solid rgba(0, 212, 255, 0.25)',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0, 212, 255, 0.12)')}
            >
              {reg.name.replace(' (Overview)', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Orientation and Zoom Shortcuts */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          zIndex: 15,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          onClick={() => controllerRef.current?.camera.zoomIn()}
          title="Zoom In"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: 'rgba(6,12,26,0.9)',
            border: '1px solid rgba(0,212,255,0.4)',
            color: '#00d4ff',
            fontSize: 18,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          +
        </button>
        <button
          onClick={() => controllerRef.current?.camera.zoomOut()}
          title="Zoom Out"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: 'rgba(6,12,26,0.9)',
            border: '1px solid rgba(0,212,255,0.4)',
            color: '#00d4ff',
            fontSize: 18,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          −
        </button>
        <button
          onClick={() => controllerRef.current?.camera.resetView()}
          title="Reset View"
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: 'rgba(6,12,26,0.9)',
            border: '1px solid rgba(0,212,255,0.4)',
            color: '#00d4ff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          ⟲
        </button>
      </div>
    </div>
  )
}
