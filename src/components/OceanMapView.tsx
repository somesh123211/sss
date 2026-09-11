/**
 * OceanMapView.tsx — Accurate 2D Scientific Oceanographic Map
 *
 * Operational ocean visualization mode for SIH26067 / INCOIS.
 *
 * Scientific Principles:
 * 1. Geographic Coordinate Mapping:
 *    • Longitude → X, Latitude → Y (EPSG:4326 via Web Mercator projection)
 *    • No arbitrary normalization; actual observation and model grid coordinates
 * 2. Exact Model-Grid Raster:
 *    • Rendered strictly within [55.0°E, 0.0°N] to [100.0°E, 30.0°N] (IGORA bounds)
 *    • No stretching into Southern Ocean / Madagascar
 *    • Discrete model depth levels (0–2000m) & discrete timesteps (monthly)
 * 3. In-Situ Observations:
 *    • Argo: Actual float positions (INCOIS ERDDAP / GDAC), clickable platform/cycle
 *    • Glider: Actual mission trajectory & waypoints (IFREMER sea057, Arabian Sea)
 * 4. Current Vectors:
 *    • Velocity speed = sqrt(u² + v²)
 *    • Vector orientation along (u, v) direction with speed scale legend
 * 5. Bathymetry:
 *    • ETOPO1 / GEBCO-derived real seafloor bathymetry overlay
 * 6. Provenance & Scientific Honesty:
 *    • Visible distinctions between REAL observations and SYNTHETIC / FALLBACK model
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import DeckGL from '@deck.gl/react'
import { Map } from 'react-map-gl/maplibre'
import {
  ScatterplotLayer,
  PathLayer,
  LineLayer,
  BitmapLayer,
  TextLayer,
} from 'deck.gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ArgoFloat, api, HYCOMModelSurface } from '../services/api'
import { SceneState, SelectedFloat, SelectedGliderPoint } from '../types'

// Dark Matter basemap — high-contrast dark oceanographic styling
const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

// Initial scientific 2D view centered on the Indian Ocean basin
const INITIAL_VIEW = {
  longitude: 77.0,
  latitude: 12.0,
  zoom: 4.2,
  pitch: 0,
  bearing: 0,
  maxPitch: 60,
  minZoom: 2.5,
  maxZoom: 12.0,
}

// Major geographical oceanographic reference points in the Indian Ocean
const OCEAN_LANDMARKS = [
  { name: 'Arabian Sea', lon: 65.0, lat: 16.0, type: 'sea' },
  { name: 'Bay of Bengal', lon: 88.0, lat: 14.0, type: 'sea' },
  { name: 'Equatorial Indian Ocean', lon: 78.0, lat: 0.0, type: 'ocean' },
  { name: 'Gulf of Oman (Glider sea057)', lon: 58.5, lat: 24.5, type: 'mission' },
  { name: 'Lakshadweep Sea', lon: 73.0, lat: 10.0, type: 'sea' },
  { name: 'Andaman Sea', lon: 95.0, lat: 10.5, type: 'sea' },
]

// ── Scientific Colormapping Functions ──────────────────────────────────────────

/**
 * Temperature Colormap (Ocean Thermal / Turbo palette)
 * Range: 0°C (abyssal blue) to 32°C (tropical sea surface red)
 */
function tempToRgb(temp: number | null | undefined, vmin = 2, vmax = 32): [number, number, number] {
  if (temp == null || isNaN(temp)) return [10, 18, 30]
  const t = Math.max(0, Math.min(1, (temp - vmin) / (vmax - vmin || 1)))
  const stops: [number, [number, number, number]][] = [
    [0.00, [30, 20, 110]],    // 2°C: Deep Abyssal Blue
    [0.18, [20, 75, 185]],    // ~7°C: Oceanic Blue
    [0.35, [0, 160, 215]],    // ~12°C: Deep Shelf Cyan
    [0.52, [0, 185, 130]],    // ~18°C: Temperate Teal-Green
    [0.70, [235, 205, 35]],   // ~23°C: Warm Subtropical Gold
    [0.85, [240, 105, 20]],   // ~28°C: Tropical Orange
    [1.00, [210, 25, 25]],    // 32°C: Warm Pool Coral Red
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return [
        Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0])),
        Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1])),
        Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2])),
      ]
    }
  }
  return [210, 25, 25]
}

/**
 * Salinity Colormap (Haline palette)
 * Range: 31.0 PSU (fresh / river plume) to 37.5 PSU (high-salinity Arabian Sea)
 */
function salinityToRgb(psu: number | null | undefined, vmin = 31, vmax = 37.5): [number, number, number] {
  if (psu == null || isNaN(psu)) return [10, 18, 30]
  const t = Math.max(0, Math.min(1, (psu - vmin) / (vmax - vmin || 1)))
  const stops: [number, [number, number, number]][] = [
    [0.00, [50, 15, 95]],     // Low salinity / River runoff violet
    [0.22, [20, 65, 160]],    // Bay of Bengal surface blue
    [0.45, [0, 145, 180]],    // Central Indian Ocean cyan
    [0.68, [25, 175, 125]],   // Normal marine teal
    [0.85, [180, 195, 30]],   // Arabian Sea saline yellow-green
    [1.00, [245, 170, 20]],   // Hypersaline Arabian Sea gold
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return [
        Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0])),
        Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1])),
        Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2])),
      ]
    }
  }
  return [245, 170, 20]
}

/**
 * Current Speed Colormap (Velocity palette)
 * Range: 0.0 m/s to 1.5+ m/s
 */
function currentSpeedToRgb(spd: number | null | undefined, vmin = 0, vmax = 1.2): [number, number, number] {
  if (spd == null || isNaN(spd)) return [10, 18, 30]
  const t = Math.max(0, Math.min(1, (spd - vmin) / (vmax - vmin || 1)))
  const stops: [number, [number, number, number]][] = [
    [0.00, [10, 25, 55]],     // Sluggish / Quiescent (<0.05 m/s)
    [0.20, [15, 80, 170]],    // Gentle drift (0.2 m/s)
    [0.45, [0, 190, 210]],    // Moderate current (0.5 m/s)
    [0.70, [50, 220, 110]],   // Strong flow (0.8 m/s)
    [1.00, [255, 200, 30]],   // High-velocity boundary current (>1.2 m/s)
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return [
        Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0])),
        Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1])),
        Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2])),
      ]
    }
  }
  return [255, 200, 30]
}

/**
 * Bathymetry Colormap
 * Negative = Ocean Depth (m), Positive = Land
 */
function bathymetryToRgb(elev: number): [number, number, number, number] {
  if (elev >= 0) return [20, 26, 32, 220] // Land terrain
  const depth = -elev
  if (depth < 150) return [20, 135, 170, 220]     // Continental shelf (<150m)
  if (depth < 500) return [10, 85, 140, 220]      // Continental slope (150–500m)
  if (depth < 2000) return [5, 45, 95, 230]       // Bathyal plain (500–2000m)
  if (depth < 4000) return [3, 20, 55, 240]       // Abyssal plain (2000–4000m)
  return [1, 8, 30, 250]                          // Deep trench (>4000m)
}

// ── Types for 2D Map Layers ───────────────────────────────────────────────────

interface CurrentVector {
  from: [number, number]
  to: [number, number]
  speed: number
  u: number
  v: number
  headingDeg: number
  color: [number, number, number, number]
  width: number
}

interface GliderWaypointItem {
  point_id: number
  lat: number
  lon: number
  time: string
  temp_surface: number | null
  sal_surface: number | null
  chla_surface: number | null
}

interface Props {
  scene: SceneState
  onSceneChange?: (partial: Partial<SceneState>) => void
  floats: ArgoFloat[]
  filteredFloats?: ArgoFloat[]
  onFloatSelect: (f: SelectedFloat) => void
  selectedFloat: SelectedFloat | null
  onGliderSelect?: (w: SelectedGliderPoint) => void
  selectedGliderPoint?: SelectedGliderPoint | null
  onRegionSelect?: (bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }) => void
  nTimeSteps?: number
  availableDepths?: number[]
  onViewModeChange?: (mode: '3d' | 'map' | 'globe') => void
}

export default function OceanMapView({
  scene,
  onSceneChange,
  floats,
  filteredFloats,
  onFloatSelect,
  selectedFloat,
  onGliderSelect,
  selectedGliderPoint,
  nTimeSteps = 12,
  availableDepths = [0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000],
  onViewModeChange,
}: Props) {
  const displayFloats = filteredFloats ?? floats
  const [viewState, setViewState] = useState(INITIAL_VIEW)

  // Live mouse coordinates over scientific map
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null)

  // Model field raster state
  const [modelCanvas, setModelCanvas] = useState<HTMLCanvasElement | null>(null)
  const [modelBounds, setModelBounds] = useState<[number, number, number, number] | null>(null)
  const [modelVminMax, setModelVminMax] = useState<[number, number]>([0, 32])
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)

  // Bathymetry raster state
  const [bathymetryCanvas, setBathymetryCanvas] = useState<HTMLCanvasElement | null>(null)
  const [bathymetryBounds, setBathymetryBounds] = useState<[number, number, number, number] | null>(null)

  // Glider trajectory & waypoints
  const [gliderTrajectoryPath, setGliderTrajectoryPath] = useState<[number, number][]>([])
  const [gliderWaypoints, setGliderWaypoints] = useState<GliderWaypointItem[]>([])
  const [gliderLoading, setGliderLoading] = useState(false)

  // Current vectors
  const [currentVectors, setCurrentVectors] = useState<CurrentVector[]>([])
  const [currentsLoading, setCurrentsLoading] = useState(false)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    text: string
    subtext?: string
    x: number
    y: number
    badge?: string
    badgeColor?: string
  } | null>(null)

  // Legend visibility toggle
  const [showLegend, setShowLegend] = useState(true)

  // Model timestep index (discrete 0 to nTimeSteps-1)
  const maxTimeIdx = Math.max(0, nTimeSteps - 1)
  const modelTimeIdx = scene.time_index > maxTimeIdx
    ? Math.min(maxTimeIdx, Math.max(0, Math.round((scene.time_index / 100) * maxTimeIdx)))
    : Math.min(maxTimeIdx, Math.max(0, Math.round(scene.time_index)))

  // ── 1. Fetch and Generate Scientifically Accurate Model Raster ───────────────
  useEffect(() => {
    if (!scene.show_model) {
      setModelCanvas(null)
      setModelBounds(null)
      return
    }

    let cancelled = false
    setModelLoading(true)
    setModelError(null)

    const fetchModel = async () => {
      try {
        let lats: number[]
        let lons: number[]
        let values: (number | null)[][]
        let vmin: number
        let vmax: number

        if (scene.variable === 'current_speed') {
          const res = await api.modelCurrentSlice(scene.depth_m, modelTimeIdx)
          lats = res.lat
          lons = res.lon
          values = res.speed
          vmin = res.vmin
          vmax = res.vmax
        } else {
          const res = await api.modelDepthSlice(scene.variable, scene.depth_m, modelTimeIdx)
          lats = res.lat
          lons = res.lon
          values = res.values
          vmin = res.vmin
          vmax = res.vmax
        }

        if (cancelled || !lats?.length || !lons?.length || !values?.length) {
          setModelLoading(false)
          return
        }

        setModelVminMax([vmin, vmax])

        // Canvas width = longitudes count, Canvas height = latitudes count
        const width = lons.length
        const height = lats.length
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          setModelLoading(false)
          return
        }

        const imgData = ctx.createImageData(width, height)
        const d = imgData.data

        // Scientific orientation:
        // Canvas top-left (y=0) corresponds to North (lat_max).
        // Array index 0 is South (0°N), array index height-1 is North (30°N).
        // Therefore: latIndex = (height - 1 - y)
        for (let y = 0; y < height; y++) {
          const latIdx = height - 1 - y
          for (let x = 0; x < width; x++) {
            const lonIdx = x
            const val = values[latIdx]?.[lonIdx]
            const pixelIdx = (y * width + x) * 4

            if (val == null || isNaN(val)) {
              // Land / missing mask: fully transparent
              d[pixelIdx] = 0
              d[pixelIdx + 1] = 0
              d[pixelIdx + 2] = 0
              d[pixelIdx + 3] = 0
            } else {
              let rgb: [number, number, number]
              if (scene.variable === 'salinity') {
                rgb = salinityToRgb(val, vmin, vmax)
              } else if (scene.variable === 'current_speed') {
                rgb = currentSpeedToRgb(val, vmin, vmax)
              } else {
                rgb = tempToRgb(val, vmin, vmax)
              }
              d[pixelIdx] = rgb[0]
              d[pixelIdx + 1] = rgb[1]
              d[pixelIdx + 2] = rgb[2]
              d[pixelIdx + 3] = 235 // Solid scientific raster value
            }
          }
        }

        ctx.putImageData(imgData, 0, 0)
        if (!cancelled) {
          setModelCanvas(canvas)
          // Deck.gl BitmapLayer bounds: [west, south, east, north]
          setModelBounds([
            lons[0],
            lats[0],
            lons[lons.length - 1],
            lats[lats.length - 1],
          ])
          setModelLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setModelError(err instanceof Error ? err.message : 'Model unavailable')
          setModelLoading(false)
        }
      }
    }

    fetchModel()

    return () => {
      cancelled = true
    }
  }, [scene.show_model, scene.variable, scene.depth_m, modelTimeIdx])

  // ── 2. Fetch Bathymetry Elevation Grid ───────────────────────────────────────
  useEffect(() => {
    if (!scene.show_bathymetry) {
      setBathymetryCanvas(null)
      setBathymetryBounds(null)
      return
    }

    let cancelled = false
    api.gebcoGrid()
      .then((data) => {
        if (cancelled || !data?.elevation?.length) return
        const { lat: lats, lon: lons, elevation } = data
        const width = lons.length
        const height = lats.length
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const imgData = ctx.createImageData(width, height)
        const d = imgData.data

        for (let y = 0; y < height; y++) {
          const latIdx = height - 1 - y
          for (let x = 0; x < width; x++) {
            const lonIdx = x
            const elev = elevation[latIdx]?.[lonIdx] ?? 0
            const pixelIdx = (y * width + x) * 4
            const rgba = bathymetryToRgb(elev)
            d[pixelIdx] = rgba[0]
            d[pixelIdx + 1] = rgba[1]
            d[pixelIdx + 2] = rgba[2]
            d[pixelIdx + 3] = rgba[3]
          }
        }

        ctx.putImageData(imgData, 0, 0)
        if (!cancelled) {
          setBathymetryCanvas(canvas)
          setBathymetryBounds([
            lons[0],
            lats[0],
            lons[lons.length - 1],
            lats[lats.length - 1],
          ])
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [scene.show_bathymetry])

  // ── 3. Fetch Real Glider Mission Trajectory & Waypoints ──────────────────────
  useEffect(() => {
    if (!scene.show_glider) {
      setGliderTrajectoryPath([])
      setGliderWaypoints([])
      return
    }

    let cancelled = false
    setGliderLoading(true)

    api.gliderTrajectory('sea057_20220128')
      .then((data) => {
        if (cancelled || !data?.waypoints?.length) {
          setGliderLoading(false)
          return
        }
        // Preserve strict chronological order for the trajectory
        const sorted = [...data.waypoints].sort((a, b) => a.point_id - b.point_id)
        const path: [number, number][] = sorted.map((w) => [w.lon, w.lat])
        setGliderTrajectoryPath(path)
        setGliderWaypoints(sorted)
        setGliderLoading(false)
      })
      .catch(() => {
        if (!cancelled) setGliderLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scene.show_glider])

  // Argo float drift track for selected platform
  const selectedFloatTrack = useMemo(() => {
    if (!selectedFloat) return []
    return floats
      .filter((f) => f.platform_number === selectedFloat.platform_number)
      .sort((a, b) => (a.cycle_number ?? 0) - (b.cycle_number ?? 0))
      .map((f) => [f.longitude, f.latitude] as [number, number])
  }, [selectedFloat, floats])

  // ── 4. Fetch Current Vectors with Speed & Direction Separation ───────────────
  useEffect(() => {
    if (!scene.show_currents) {
      setCurrentVectors([])
      return
    }

    let cancelled = false
    setCurrentsLoading(true)

    api.modelCurrentSlice(scene.depth_m, modelTimeIdx)
      .then((data) => {
        if (cancelled || !data?.u?.length || !data?.v?.length) {
          setCurrentsLoading(false)
          return
        }

        const { lat: lats, lon: lons, u: uGrid, v: vGrid, speed: spdGrid, vmax } = data
        const vectors: CurrentVector[] = []

        // Subsample grid so flow vectors are scientifically legible without screen clutter
        const stepLat = Math.max(1, Math.floor(lats.length / 16))
        const stepLon = Math.max(1, Math.floor(lons.length / 22))

        for (let i = 0; i < lats.length; i += stepLat) {
          for (let j = 0; j < lons.length; j += stepLon) {
            const u = uGrid[i]?.[j]
            const v = vGrid[i]?.[j]
            const spd = spdGrid[i]?.[j]

            if (u == null || v == null || spd == null || isNaN(spd) || spd < 0.02) continue

            const headingRad = Math.atan2(v, u)
            const headingDeg = (headingRad * 180) / Math.PI

            // Vector length in geographic degrees (scaled by speed)
            const lengthDeg = Math.min(0.9, (spd / (vmax || 1.2)) * 0.65 + 0.15)
            const endLon = lons[j] + Math.cos(headingRad) * lengthDeg
            const endLat = lats[i] + Math.sin(headingRad) * lengthDeg

            const rgb = currentSpeedToRgb(spd, 0, vmax || 1.2)

            vectors.push({
              from: [lons[j], lats[i]],
              to: [endLon, endLat],
              speed: spd,
              u,
              v,
              headingDeg,
              color: [rgb[0], rgb[1], rgb[2], 230],
              width: Math.min(4, Math.max(1.5, spd * 3.5)),
            })
          }
        }

        if (!cancelled) {
          setCurrentVectors(vectors)
          setCurrentsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [scene.show_currents, scene.depth_m, modelTimeIdx])

  // ── 5. Camera Navigation Presets ─────────────────────────────────────────────
  const flyTo = useCallback((lon: number, lat: number, zoom: number) => {
    setViewState((prev) => ({
      ...prev,
      longitude: lon,
      latitude: lat,
      zoom,
      pitch: 0,
      bearing: 0,
      transitionDuration: 1000,
    }))
  }, [])

  // ── 6. Construct Deck.gl Layers ──────────────────────────────────────────────
  const layers = useMemo(() => {
    const list: any[] = []

    // A. Bathymetry Elevation Raster Layer
    if (scene.show_bathymetry && bathymetryCanvas && bathymetryBounds) {
      list.push(
        new BitmapLayer({
          id: 'bathymetry-raster',
          bounds: bathymetryBounds,
          image: bathymetryCanvas,
          opacity: 0.75,
          pickable: false,
        })
      )
    }

    // B. Ocean Model Field Raster Layer (Exact Grid Bounded)
    if (scene.show_model && modelCanvas && modelBounds) {
      list.push(
        new BitmapLayer({
          id: 'model-raster-field',
          bounds: modelBounds,
          image: modelCanvas,
          opacity: scene.opacity,
          pickable: true,
          onClick: (info: any) => {
            if (info.coordinate) {
              setCursorCoords({ lon: info.coordinate[0], lat: info.coordinate[1] })
            }
          },
        })
      )
    }

    // C. Current Flow Vectors Layer (Directional line segments)
    if (scene.show_currents && currentVectors.length > 0) {
      list.push(
        new LineLayer({
          id: 'current-flow-vectors',
          data: currentVectors,
          getSourcePosition: (d: CurrentVector) => d.from,
          getTargetPosition: (d: CurrentVector) => d.to,
          getColor: (d: CurrentVector) => d.color,
          getWidth: (d: CurrentVector) => d.width,
          widthUnits: 'pixels',
          pickable: true,
          onHover: (info: any) => {
            if (info.object) {
              const d = info.object as CurrentVector
              setTooltip({
                text: `Current Velocity: ${d.speed.toFixed(2)} m/s`,
                subtext: `Heading: ${d.headingDeg.toFixed(0)}° • u: ${d.u.toFixed(2)} m/s, v: ${d.v.toFixed(2)} m/s`,
                badge: 'DERIVED SPEED: sqrt(u²+v²)',
                badgeColor: '#00e5ff',
                x: info.x,
                y: info.y,
              })
            } else {
              setTooltip(null)
            }
          },
        })
      )
    }

    // D. Glider Mission Trajectory Track (Chronological Path)
    if (scene.show_glider && gliderTrajectoryPath.length > 1) {
      list.push(
        new PathLayer({
          id: 'glider-trajectory-track',
          data: [{ path: gliderTrajectoryPath }],
          getPath: (d: any) => d.path,
          getColor: [255, 204, 0, 240], // Bright operational gold
          getWidth: 3.5,
          widthMinPixels: 2,
          capRounded: true,
          jointRounded: true,
          pickable: false,
        })
      )
    }

    // E. Glider Dive Observations / Waypoints
    if (scene.show_glider && gliderWaypoints.length > 0) {
      list.push(
        new ScatterplotLayer({
          id: 'glider-waypoints',
          data: gliderWaypoints,
          getPosition: (w: GliderWaypointItem) => [w.lon, w.lat, 0],
          getRadius: (w: GliderWaypointItem) =>
            selectedGliderPoint?.point_id === w.point_id ? 1800 : 750,
          getFillColor: [255, 220, 50, 240],
          getLineColor: [20, 30, 40, 255],
          lineWidthMinPixels: 1.5,
          stroked: true,
          radiusMinPixels: 3,
          radiusMaxPixels: 9,
          pickable: true,
          onClick: (info: any) => {
            if (info.object && onGliderSelect) {
              const w = info.object as GliderWaypointItem
              onGliderSelect({
                mission_id: 'sea057_20220128',
                point_id: w.point_id,
                lat: w.lat,
                lon: w.lon,
                latitude: w.lat,
                longitude: w.lon,
                time: w.time,
                temp_surface: w.temp_surface,
                sal_surface: w.sal_surface,
                chla_surface: w.chla_surface,
              })
            }
          },
          onHover: (info: any) => {
            if (info.object) {
              const w = info.object as GliderWaypointItem
              setTooltip({
                text: `Glider sea057 Observation #${w.point_id}`,
                subtext: `Time: ${w.time.replace('T', ' ')} UTC\nLat: ${w.lat.toFixed(4)}°N, Lon: ${w.lon.toFixed(4)}°E\nSurface Temp: ${w.temp_surface ?? '—'} °C • Salinity: ${w.sal_surface ?? '—'} PSU`,
                badge: 'REAL • IFREMER OceanGliders',
                badgeColor: '#ffd54f',
                x: info.x,
                y: info.y,
              })
            } else {
              setTooltip(null)
            }
          },
        })
      )
    }

    // F. Argo Floats: Drift Track for Selected Float
    if (scene.show_argo && selectedFloatTrack.length > 1) {
      list.push(
        new PathLayer({
          id: 'argo-drift-track',
          data: [{ path: selectedFloatTrack }],
          getPath: (d: any) => d.path,
          getColor: [0, 229, 255, 220],
          getWidth: 2.5,
          widthMinPixels: 2,
          capRounded: true,
          jointRounded: true,
          pickable: false,
        })
      )
    }

    // G. Argo Floats: Selected Float Highlight Glow
    if (scene.show_argo && selectedFloat) {
      list.push(
        new ScatterplotLayer({
          id: 'argo-selected-halo',
          data: [selectedFloat],
          getPosition: (f: SelectedFloat) => [f.longitude, f.latitude, 0],
          getRadius: 28000,
          getFillColor: [0, 229, 255, 70],
          getLineColor: [0, 255, 255, 255],
          lineWidthMinPixels: 2,
          stroked: true,
          radiusMinPixels: 12,
          radiusMaxPixels: 26,
          pickable: false,
        })
      )
    }

    // G. Argo Floats: Observation Markers
    if (scene.show_argo && displayFloats.length > 0) {
      list.push(
        new ScatterplotLayer({
          id: 'argo-observation-markers',
          data: displayFloats,
          getPosition: (f: ArgoFloat) => [f.longitude, f.latitude, 0],
          getRadius: (f: ArgoFloat) =>
            selectedFloat?.platform_number === f.platform_number ? 14000 : 7000,
          getFillColor: (f: ArgoFloat) => {
            if (scene.variable === 'salinity') {
              const rgb = salinityToRgb(f.psal_surface, 31, 37.5)
              return [rgb[0], rgb[1], rgb[2], 230]
            }
            const rgb = tempToRgb(f.temp_surface, 2, 32)
            return [rgb[0], rgb[1], rgb[2], 230]
          },
          getLineColor: [255, 255, 255, 220],
          lineWidthMinPixels: 1.5,
          stroked: true,
          radiusMinPixels: 4,
          radiusMaxPixels: 11,
          pickable: true,
          onClick: (info: any) => {
            if (info.object) {
              const f = info.object as ArgoFloat
              onFloatSelect({
                platform_number: f.platform_number,
                cycle_number: f.cycle_number,
                latitude: f.latitude,
                longitude: f.longitude,
                time: f.time,
                pres_max: f.pres_max,
                temp_surface: f.temp_surface,
                psal_surface: f.psal_surface,
              })
            }
          },
          onHover: (info: any) => {
            if (info.object) {
              const f = info.object as ArgoFloat
              setTooltip({
                text: `Argo Platform #${f.platform_number} (Cycle ${f.cycle_number})`,
                subtext: `Obs Time: ${f.time ? f.time.slice(0, 10) : '—'}\nLat: ${f.latitude.toFixed(3)}°N, Lon: ${f.longitude.toFixed(3)}°E\nSurface Temp: ${f.temp_surface?.toFixed(2) ?? '—'} °C • Salinity: ${f.psal_surface?.toFixed(2) ?? '—'} PSU\nMax Profile Pressure: ${f.pres_max ?? '—'} dbar`,
                badge: 'REAL • INCOIS ERDDAP / GDAC',
                badgeColor: '#00e5ff',
                x: info.x,
                y: info.y,
              })
            } else {
              setTooltip(null)
            }
          },
        })
      )
    }

    // H. Geographic Oceanographic Labels
    list.push(
      new TextLayer({
        id: 'ocean-landmarks-labels',
        data: OCEAN_LANDMARKS,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getText: (d: any) => d.name,
        getSize: 11,
        getColor: [170, 215, 255, 180],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600,
      })
    )

    return list
  }, [
    scene.show_model,
    scene.show_bathymetry,
    scene.show_glider,
    scene.show_currents,
    scene.show_argo,
    scene.variable,
    scene.opacity,
    modelCanvas,
    modelBounds,
    bathymetryCanvas,
    bathymetryBounds,
    currentVectors,
    gliderTrajectoryPath,
    gliderWaypoints,
    displayFloats,
    selectedFloat,
    selectedFloatTrack,
    selectedGliderPoint,
    onFloatSelect,
    onGliderSelect,
  ])

  // Track live mouse coordinates
  const handleMapHover = useCallback((info: any) => {
    if (info.coordinate) {
      setCursorCoords({
        lon: Number(info.coordinate[0].toFixed(3)),
        lat: Number(info.coordinate[1].toFixed(3)),
      })
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#040b17' }}>
      {/* ── DeckGL Map Component ─────────────────────────────────────────── */}
      <DeckGL
        viewState={viewState as any}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={{ doubleClickZoom: false, dragRotate: false }}
        layers={layers}
        onHover={handleMapHover}
        style={{ position: 'absolute', inset: '0' } as any}
      >
        <Map mapStyle={BASEMAP_STYLE} />
      </DeckGL>

      {/* ── Top Bar: Quick Navigation Presets & Mode Indicator ────────── */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 16,
          zIndex: 20,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            background: 'rgba(2,10,24,0.92)',
            border: '1px solid rgba(0,212,255,0.4)',
            borderRadius: 6,
            padding: '5px 10px',
            color: '#00e5ff',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.8px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}
        >
          🗺️ 2D SCIENTIFIC MAP
        </div>

        {[
          { label: '🇮🇳 Indian Ocean', lon: 77.0, lat: 12.0, z: 4.2 },
          { label: '🌊 Arabian Sea', lon: 65.0, lat: 16.0, z: 5.6 },
          { label: '🌀 Bay of Bengal', lon: 88.0, lat: 15.0, z: 5.6 },
          { label: '🛸 Glider (sea057)', lon: 57.8, lat: 24.1, z: 8.5 },
          { label: '🎯 Fit Indian Basin', lon: 77.0, lat: 12.0, z: 4.2 },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={() => flyTo(btn.lon, btn.lat, btn.z)}
            style={{
              background: 'rgba(4,16,36,0.85)',
              border: '1px solid rgba(0,180,255,0.3)',
              color: '#8bd4ff',
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#00e5ff')}
            onMouseOut={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,180,255,0.3)')}
          >
            {btn.label}
          </button>
        ))}

        {onViewModeChange && (
          <button
            onClick={() => onViewModeChange('3d')}
            style={{
              background: 'rgba(0,212,255,0.15)',
              border: '1px solid #00d4ff',
              color: '#00ffff',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              marginLeft: 4,
            }}
          >
            🌊 Switch to 3D Ocean World ➔
          </button>
        )}
      </div>

      {/* ── Top-Right: Discrete Depth Level Selector (Synced) ─────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          zIndex: 20,
          background: 'rgba(2,12,28,0.92)',
          border: '1px solid rgba(0,212,255,0.35)',
          borderRadius: 8,
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          backdropFilter: 'blur(10px)',
          color: '#e0f4ff',
          fontSize: 12,
          boxShadow: '0 2px 14px rgba(0,0,0,0.5)',
        }}
      >
        {/* Variable Selector */}
        <span style={{ fontSize: 11, color: '#8ba7bb', fontWeight: 600 }}>VAR:</span>
        <select
          value={scene.variable}
          onChange={(e) => onSceneChange?.({ variable: e.target.value as any })}
          style={{
            background: 'rgba(6,22,46,0.9)',
            border: '1px solid rgba(0,212,255,0.5)',
            color: '#00e5ff',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <option value="temperature">Temperature (°C)</option>
          <option value="salinity">Salinity (PSU)</option>
          <option value="current_speed">Current Speed (m/s)</option>
        </select>

        {/* Depth Selector */}
        <span style={{ fontSize: 11, color: '#8ba7bb', fontWeight: 600 }}>DEPTH:</span>
        <select
          value={scene.depth_m}
          onChange={(e) => onSceneChange?.({ depth_m: Number(e.target.value) })}
          style={{
            background: 'rgba(6,22,46,0.9)',
            border: '1px solid rgba(0,212,255,0.5)',
            color: '#00e5ff',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {availableDepths.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? '0 m (Surface)' : `${d} m`}
            </option>
          ))}
        </select>

        {/* Timestep / Month Selector */}
        <span style={{ fontSize: 11, color: '#8ba7bb', fontWeight: 600 }}>MONTH:</span>
        <select
          value={modelTimeIdx}
          onChange={(e) => onSceneChange?.({ time_index: Number(e.target.value) })}
          style={{
            background: 'rgba(6,22,46,0.9)',
            border: '1px solid rgba(0,212,255,0.5)',
            color: '#00e5ff',
            borderRadius: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {[
            '01 Jan', '02 Feb', '03 Mar', '04 Apr', '05 May', '06 Jun',
            '07 Jul', '08 Aug', '09 Sep', '10 Oct', '11 Nov', '12 Dec'
          ].map((m, idx) => (
            <option key={m} value={idx}>
              {m}
            </option>
          ))}
        </select>

        {/* Loading Spinner */}
        {(modelLoading || currentsLoading || gliderLoading) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ffd54f' }}>
            <div
              style={{
                width: 10,
                height: 10,
                border: '2px solid #ffd54f',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span>Fetching Layer...</span>
          </div>
        )}
      </div>

      {/* ── Bottom-Left: Live Geographic Coordinate Readout & Provenance ──── */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 16,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(2,10,24,0.90)',
            border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#a0e4ff',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            display: 'flex',
            gap: 12,
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
          }}
        >
          <div>
            LON:{' '}
            <strong style={{ color: '#fff' }}>
              {cursorCoords ? `${Math.abs(cursorCoords.lon).toFixed(3)}°${cursorCoords.lon >= 0 ? 'E' : 'W'}` : '77.000°E'}
            </strong>
          </div>
          <div>
            LAT:{' '}
            <strong style={{ color: '#fff' }}>
              {cursorCoords ? `${Math.abs(cursorCoords.lat).toFixed(3)}°${cursorCoords.lat >= 0 ? 'N' : 'S'}` : '12.000°N'}
            </strong>
          </div>
          <div>
            DEPTH:{' '}
            <strong style={{ color: '#00e5ff' }}>
              {scene.depth_m === 0 ? '0m (Surface)' : `${scene.depth_m}m`}
            </strong>
          </div>
        </div>

        {/* Provenance Badges Bar */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div
            style={{
              background: 'rgba(2,10,24,0.85)',
              border: '1px solid rgba(0,230,118,0.4)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 10,
              color: '#00e676',
              fontWeight: 600,
            }}
          >
            ● ARGO: REAL (INCOIS)
          </div>
          <div
            style={{
              background: 'rgba(2,10,24,0.85)',
              border: '1px solid rgba(255,215,0,0.4)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 10,
              color: '#ffd54f',
              fontWeight: 600,
            }}
          >
            ● GLIDER: REAL (IFREMER sea057)
          </div>
          <div
            style={{
              background: 'rgba(2,10,24,0.85)',
              border: '1px solid rgba(255,145,0,0.4)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 10,
              color: '#ffb74d',
              fontWeight: 600,
            }}
          >
            ⚠ MODEL: SYNTHETIC / FALLBACK
          </div>
        </div>
      </div>

      {/* ── Bottom-Right: Professional Scientific Legend ───────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          right: 16,
          zIndex: 20,
          background: 'rgba(2,12,28,0.94)',
          border: '1px solid rgba(0,212,255,0.35)',
          borderRadius: 8,
          padding: '10px 14px',
          color: '#e8f4f8',
          fontSize: 11,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          width: 280,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
            borderBottom: '1px solid rgba(0,212,255,0.2)',
            paddingBottom: 4,
          }}
        >
          <div style={{ fontWeight: 700, color: '#00e5ff', fontSize: 11, letterSpacing: '0.8px' }}>
            SCIENTIFIC MAP LEGEND
          </div>
          <button
            onClick={() => setShowLegend(!showLegend)}
            style={{
              background: 'none',
              border: 'none',
              color: '#8ba7bb',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {showLegend ? '▼' : '▲'}
          </button>
        </div>

        {showLegend && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Active Model Field */}
            {scene.show_model && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8ba7bb', marginBottom: 2 }}>
                  <span>
                    MODEL FIELD ({scene.variable === 'temperature' ? 'Temp' : scene.variable === 'salinity' ? 'Salinity' : 'Current Speed'})
                  </span>
                  <span style={{ color: '#00e5ff' }}>
                    {scene.variable === 'temperature' ? '°C' : scene.variable === 'salinity' ? 'PSU' : 'm/s'}
                  </span>
                </div>
                <div
                  style={{
                    height: 9,
                    borderRadius: 3,
                    background:
                      scene.variable === 'salinity'
                        ? 'linear-gradient(to right, rgb(50,15,95), rgb(20,65,160), rgb(0,145,180), rgb(25,175,125), rgb(245,170,20))'
                        : scene.variable === 'current_speed'
                        ? 'linear-gradient(to right, rgb(10,25,55), rgb(15,80,170), rgb(0,190,210), rgb(50,220,110), rgb(255,200,30))'
                        : 'linear-gradient(to right, rgb(30,20,110), rgb(20,75,185), rgb(0,160,215), rgb(0,185,130), rgb(235,205,35), rgb(210,25,25))',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#a0c4d8', marginTop: 2, fontFamily: 'monospace' }}>
                  <span>{modelVminMax[0].toFixed(1)}</span>
                  <span>{((modelVminMax[0] + modelVminMax[1]) / 2).toFixed(1)}</span>
                  <span>{modelVminMax[1].toFixed(1)}</span>
                </div>
              </div>
            )}

            {/* Argo Markers */}
            {scene.show_argo && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#00d4ff',
                      border: '1.5px solid #fff',
                    }}
                  />
                  <span>Argo Float Observation</span>
                </div>
                <span style={{ color: '#00e5ff', fontFamily: 'monospace' }}>{displayFloats.length} floats</span>
              </div>
            )}

            {/* Glider Trajectory */}
            {scene.show_glider && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 14, height: 3, background: '#ffd54f', borderRadius: 1 }} />
                  <span>Glider Trajectory (sea057)</span>
                </div>
                <span style={{ color: '#ffd54f', fontFamily: 'monospace' }}>822 pts</span>
              </div>
            )}

            {/* Current Vectors */}
            {scene.show_currents && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#00ffff', fontWeight: 700 }}>➔</span>
                  <span>Current Vector (u, v)</span>
                </div>
                <span style={{ color: '#00e5ff', fontFamily: 'monospace' }}>Speed-scaled</span>
              </div>
            )}

            {/* Bathymetry */}
            {scene.show_bathymetry && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, background: '#0a4260', borderRadius: 2 }} />
                  <span>Seafloor Bathymetry (ETOPO1)</span>
                </div>
                <span style={{ color: '#8ba7bb', fontFamily: 'monospace' }}>0 to -5656m</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Hover Tooltip ─────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 14, window.innerWidth - 300),
            top: Math.max(10, tooltip.y - 14),
            zIndex: 40,
            background: 'rgba(2,10,24,0.96)',
            border: '1px solid #00b4ff',
            borderRadius: 6,
            padding: '8px 12px',
            color: '#fff',
            fontSize: 11,
            pointerEvents: 'none',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
            maxWidth: 280,
          }}
        >
          {tooltip.badge && (
            <div
              style={{
                fontSize: 9,
                color: tooltip.badgeColor || '#00e5ff',
                fontWeight: 700,
                letterSpacing: '0.6px',
                marginBottom: 4,
              }}
            >
              {tooltip.badge}
            </div>
          )}
          <div style={{ fontWeight: 700, color: '#00e5ff', marginBottom: 2 }}>{tooltip.text}</div>
          {tooltip.subtext && (
            <div style={{ color: '#b0d8f0', whiteSpace: 'pre-line', fontSize: 10, lineHeight: 1.4 }}>
              {tooltip.subtext}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
