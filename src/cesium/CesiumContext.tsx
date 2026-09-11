import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import {
  OceanVisualizationState,
  VisualizationAction,
  SelectedObject,
  OceanVariable,
  OceanLayerVisibility,
} from './types'
import { INDIAN_OCEAN_REGIONS } from './utils/coordinates'
import { CesiumSceneController } from './CesiumSceneController'

interface CesiumContextValue {
  controllerRef: React.MutableRefObject<CesiumSceneController | null>
  state: OceanVisualizationState
  selectedObject: SelectedObject | null
  setSelectedObject: (obj: SelectedObject | null) => void
  updateState: (partial: Partial<OceanVisualizationState>) => void
  setLayerVisibility: (layer: keyof OceanLayerVisibility, visible: boolean) => void
  setVariable: (variable: OceanVariable) => void
  setDepth: (depth_m: number) => void
  setTimeIndex: (time_index: number) => void
  dispatchAction: (action: VisualizationAction) => void
}

const DEFAULT_STATE: OceanVisualizationState = {
  model_id: 'igora',
  variable: 'temperature',
  depth_m: 0,
  time_index: 0,
  time_iso: '2024-06-15T00:00:00Z',
  vertical_exaggeration: 3,
  layers: {
    ocean_surface: true,
    bathymetry: true,
    argo: true,
    argo_tracks: true,
    glider: true,
    model_slice: true,
    current_vectors: false,
    current_particles: false,
    model_error: false,
    observation_density: false,
    boundaries: true,
    volume_3d: false,
  },
  selected_region: INDIAN_OCEAN_REGIONS.INDIAN_OCEAN,
  particle_density: 'medium',
  particle_speed: 1.0,
  volume_quality: 'medium',
  volume_opacity: 0.85,
}

const CesiumContext = createContext<CesiumContextValue | null>(null)

export const CesiumProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const controllerRef = useRef<CesiumSceneController | null>(null)
  const [state, setState] = useState<OceanVisualizationState>(DEFAULT_STATE)
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null)

  const updateState = useCallback((partial: Partial<OceanVisualizationState>) => {
    setState(prev => {
      const next = { ...prev, ...partial }
      if (controllerRef.current) {
        controllerRef.current.updateState(next)
      }
      return next
    })
  }, [])

  const setLayerVisibility = useCallback((layer: keyof OceanLayerVisibility, visible: boolean) => {
    setState(prev => {
      const nextLayers = { ...prev.layers, [layer]: visible }
      const next = { ...prev, layers: nextLayers }
      if (controllerRef.current) {
        controllerRef.current.updateState(next)
      }
      return next
    })
  }, [])

  const setVariable = useCallback((variable: OceanVariable) => {
    updateState({ variable })
  }, [updateState])

  const setDepth = useCallback((depth_m: number) => {
    updateState({ depth_m })
  }, [updateState])

  const setTimeIndex = useCallback((time_index: number) => {
    updateState({ time_index })
  }, [updateState])

  const dispatchAction = useCallback((action: VisualizationAction) => {
    if (controllerRef.current) {
      controllerRef.current.executeAction(action)
    }
  }, [])

  return (
    <CesiumContext.Provider
      value={{
        controllerRef,
        state,
        selectedObject,
        setSelectedObject,
        updateState,
        setLayerVisibility,
        setVariable,
        setDepth,
        setTimeIndex,
        dispatchAction,
      }}
    >
      {children}
    </CesiumContext.Provider>
  )
}

export function useCesium(): CesiumContextValue {
  const ctx = useContext(CesiumContext)
  if (!ctx) {
    throw new Error('useCesium must be used within a CesiumProvider')
  }
  return ctx
}
