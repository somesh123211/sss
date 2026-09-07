/**
 * OceanMapView.tsx — Real 3D Indian Ocean Map Visualization
 *
 * Basemap  : CartoDB Dark Matter → India = BLACK landmass
 * Ocean    : 3D Animated Gerstner Wave Canvas Overlay via Three.js (WebGL Shaders)
 * 3D Mode  : When zoomed in > 5.5, ColumnLayer extrudes IGORA model values as 3D bars
 * Heatmap  : Semi-transparent HYCOM temperature/salinity depth overlay
 * Floats   : Real Argo buoys with profile popups & 3D columns
 * Currents : Animated flow vector arcs
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as THREE from 'three'
import DeckGL from '@deck.gl/react'
import { Map } from 'react-map-gl/maplibre'
import {
  ScatterplotLayer,
  PathLayer,
  ArcLayer,
  TextLayer,
  ColumnLayer,
  HeatmapLayer,
} from 'deck.gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ArgoFloat, api } from '../services/api'
import { SceneState, SelectedFloat } from '../types'

// CartoDB Dark Matter — India=BLACK, oceans dark base
const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const INITIAL_VIEW = {
  longitude: 77, latitude: 12, zoom: 4.8, pitch: 52, bearing: -8, maxPitch: 85,
}

// Depth → color: abyssal dark navy → mid-blue → shallow turquoise
function depthColor(depthM: number): [number, number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [144, 224, 239]], // 0m     shallow turquoise
    [200, [0, 150, 199]], // 200m   coastal blue
    [500, [0, 119, 182]], // 500m   blue
    [1000, [2, 62, 138]], // 1000m  dark blue
    [2000, [3, 4, 94]], // 2000m  deep navy
    [4000, [1, 2, 40]], // 4000m  abyss
    [6000, [0, 1, 20]], // 6000m+ ultra deep
  ]
  const t = Math.max(0, depthM)
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return [
        Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0])),
        Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1])),
        Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2])),
        220,
      ]
    }
  }
  return [0, 1, 20, 220]
}

// Temperature ramp
function tempColor(temp: number | null | undefined): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, ((temp ?? 25) - 2) / 30))
  const stops: [number, [number, number, number]][] = [
    [0.0, [44, 22, 84]],
    [0.2, [26, 35, 126]],
    [0.4, [2, 136, 209]],
    [0.55, [0, 137, 123]],
    [0.75, [205, 220, 57]],
    [1.0, [198, 40, 40]],
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return [
        Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0])),
        Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1])),
        Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2])),
        230,
      ]
    }
  }
  return [198, 40, 40, 230]
}

// Salinity ramp
function salinityColor(psu: number | null | undefined): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, ((psu ?? 35) - 30) / 8))
  const stops: [number, [number, number, number]][] = [
    [0.0, [74, 14, 143]],
    [0.3, [21, 101, 192]],
    [0.55, [2, 136, 209]],
    [0.75, [38, 166, 154]],
    [1.0, [249, 168, 37]],
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      return [
        Math.round(stops[i][1][0] + f * (stops[i + 1][1][0] - stops[i][1][0])),
        Math.round(stops[i][1][1] + f * (stops[i + 1][1][1] - stops[i][1][1])),
        Math.round(stops[i][1][2] + f * (stops[i + 1][1][2] - stops[i][1][2])),
        210,
      ]
    }
  }
  return [249, 168, 37, 210]
}

const TEMP_CR: [number, number, number][] = [
  [44, 22, 84],
  [26, 35, 126],
  [2, 136, 209],
  [0, 137, 123],
  [205, 220, 57],
  [198, 40, 40],
]
const SAL_CR: [number, number, number][] = [
  [74, 14, 143],
  [21, 101, 192],
  [2, 136, 209],
  [38, 166, 154],
  [249, 168, 37],
  [255, 200, 80],
]

const CITIES = [
  { name: 'Chennai', lon: 80.28, lat: 13.08 },
  { name: 'Mumbai', lon: 72.88, lat: 19.07 },
  { name: 'Kolkata', lon: 88.36, lat: 22.57 },
  { name: 'Colombo', lon: 79.86, lat: 6.91 },
  { name: 'Port Blair', lon: 92.73, lat: 11.67 },
  { name: 'Kochi', lon: 76.26, lat: 9.93 },
  { name: 'Vizag', lon: 83.3, lat: 17.71 },
  { name: 'Male', lon: 73.51, lat: 4.18 },
  { name: 'Goa', lon: 73.83, lat: 15.49 },
  { name: 'Karachi', lon: 67.01, lat: 24.86 },
]

// Three.js Gerstner Ocean Wave GLSL Shaders
const OCEAN_VERT = `
uniform float uTime;
varying vec2 vUv;
varying float vHeight;
varying vec3 vWorldPos;
vec3 gerstner(vec3 pos, float Q, float A, float kx, float kz, float spd) {
  float k = length(vec2(kx, kz));
  float w = sqrt(9.81 * k);
  float phi = kx * pos.x + kz * pos.z - w * uTime * spd;
  float Qa = Q * A;
  return vec3(Qa * kx/k * cos(phi), A * sin(phi), Qa * kz/k * cos(phi));
}
void main() {
  vUv = uv;
  vec3 p = position;
  vec3 d = vec3(0.0);
  d += gerstner(p, 0.65, 1.8,  0.28,  0.12, 1.10);
  d += gerstner(p, 0.55, 1.1, -0.18,  0.35, 0.95);
  d += gerstner(p, 0.45, 0.7,  0.55,  0.25, 1.30);
  d += gerstner(p, 0.35, 0.5,  0.10, -0.48, 1.60);
  d += gerstner(p, 0.25, 0.35, 0.72,  0.08, 2.00);
  d += gerstner(p, 0.20, 0.25,-0.35,  0.60, 1.75);
  p += d;
  vHeight = d.y;
  vWorldPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const OCEAN_FRAG = `
uniform float uTime;
varying vec2 vUv;
varying float vHeight;
varying vec3 vWorldPos;
void main() {
  vec3 abyss   = vec3(0.003, 0.018, 0.08);
  vec3 deep    = vec3(0.008, 0.05,  0.20);
  vec3 mid     = vec3(0.015, 0.15,  0.42);
  vec3 shallow = vec3(0.04,  0.52,  0.75);
  vec3 foam    = vec3(0.88,  0.95,  1.00);
  float h = clamp((vHeight + 1.0) / 3.5, 0.0, 1.0);
  vec3 col = mix(abyss, deep, smoothstep(0.0, 0.25, h));
  col = mix(col, mid,     smoothstep(0.2, 0.55, h));
  col = mix(col, shallow, smoothstep(0.5, 0.85, h));
  float foamMask  = smoothstep(1.0, 2.2, vHeight);
  float foamNoise = sin(vUv.x*140.0 + uTime*2.8) * sin(vUv.y*110.0 + uTime*2.2) * 0.5 + 0.5;
  col = mix(col, foam, foamMask * foamNoise * 0.8);
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  vec3 viewDir  = normalize(vec3(0.0, 1.0, 0.4));
  vec3 halfV    = normalize(lightDir + viewDir);
  float nx = sin(vUv.x * 30.0 + uTime) * 0.3;
  float nz = sin(vUv.y * 25.0 + uTime * 0.8) * 0.3;
  vec3 N = normalize(vec3(-nx, 1.0, -nz));
  float spec  = pow(max(dot(N, halfV), 0.0), 200.0) * 1.4;
  float spec2 = pow(max(dot(N, halfV), 0.0), 45.0)  * 0.25;
  col += vec3(0.95, 0.97, 1.0) * (spec + spec2);
  float c1 = abs(sin(vUv.x*28.0 + uTime*1.3) * sin(vUv.y*22.0 + uTime*1.0));
  float c2 = abs(sin(vUv.x*44.0 - uTime*2.1) * sin(vUv.y*35.0 + uTime*1.6));
  float caustic = pow(mix(c1, c2, 0.4), 3.2) * 0.14;
  col += vec3(caustic*0.3, caustic*0.7, caustic*1.0);
  float dist = clamp(length(vWorldPos.xz) / 450.0, 0.0, 1.0);
  col = mix(col, abyss, dist * 0.55);
  float alpha = mix(0.90, 0.70, dist);
  gl_FragColor = vec4(col, alpha);
}
`

interface HeatPoint {
  position: [number, number]
  weight: number
}
interface OceanCol {
  pos: [number, number]
  value: number
  depth: number
}
interface GliderPath {
  path: [number, number, number][]
}
interface CurrentArc {
  from: [number, number]
  to: [number, number]
  speed: number
}
interface TooltipInfo {
  object: ArgoFloat
  x: number
  y: number
}

interface Props {
  scene: SceneState
  floats: ArgoFloat[]
  filteredFloats?: ArgoFloat[]
  onFloatSelect: (f: SelectedFloat) => void
  selectedFloat: SelectedFloat | null
  onRegionSelect?: (bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }) => void
}

export default function OceanMapView({
  scene,
  floats,
  filteredFloats,
  onFloatSelect,
  selectedFloat,
}: Props) {
  const displayFloats = filteredFloats ?? floats

  const [heatData, setHeatData] = useState<HeatPoint[]>([])
  const [oceanCols, setOceanCols] = useState<OceanCol[]>([])
  const [vminmax, setVminmax] = useState<[number, number]>([0, 32])
  const [gliderData, setGliderData] = useState<GliderPath[]>([])
  const [arcData, setArcData] = useState<CurrentArc[]>([])
  const [depthM, setDepthM] = useState(0)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const mapRef = useRef<any>(null)

  // Three.js 3D Wave overlay refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const scene3Ref = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const waveUniRef = useRef({ uTime: { value: 0.0 } })
  const animRef = useRef<number>(0)

  const variable = scene.variable === 'current_speed' ? 'temperature' : scene.variable
  const is3D = viewState.zoom >= 5.5

  // 1. Initialize Three.js transparent 3D wave overlay
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    const width = cv.clientWidth || window.innerWidth
    const height = cv.clientHeight || window.innerHeight

    const scene3 = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000)
    camera.position.set(0, 160, 240)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({
      canvas: cv,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    // Wave Mesh
    const geo = new THREE.PlaneGeometry(900, 700, 240, 180)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: waveUniRef.current,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })

    const mesh = new THREE.Mesh(geo, mat)
    scene3.add(mesh)

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8)
    scene3.add(amb)
    const dir = new THREE.DirectionalLight(0xfff5ea, 1.5)
    dir.position.set(200, 400, 150)
    scene3.add(dir)

    scene3Ref.current = scene3
    cameraRef.current = camera
    rendererRef.current = renderer

    let lastTime = performance.now()
    const renderLoop = () => {
      const now = performance.now()
      const dt = (now - lastTime) / 1000
      lastTime = now

      waveUniRef.current.uTime.value += dt * 1.2
      renderer.render(scene3, camera)
      animRef.current = requestAnimationFrame(renderLoop)
    }
    renderLoop()

    const handleResize = () => {
      if (!cv || !rendererRef.current || !cameraRef.current) return
      const w = cv.clientWidth || window.innerWidth
      const h = cv.clientHeight || window.innerHeight
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animRef.current)
      renderer.dispose()
      geo.dispose()
      mat.dispose()
    }
  }, [])

  // 2. Sync Three.js Camera with MapLibre ViewState
  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    const pitchRad = ((viewState.pitch ?? 52) * Math.PI) / 180
    const bearRad = ((viewState.bearing ?? -8) * Math.PI) / 180
    const zoom = viewState.zoom ?? 4.8
    const dist = 520 / Math.pow(2, zoom - 4.5)

    cam.position.set(
      Math.sin(bearRad) * dist * 0.65,
      dist * Math.cos(pitchRad) * 0.85 + 20,
      -Math.cos(bearRad) * dist * 0.65
    )
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [viewState])

  // Fetch HYCOM / IGORA model slice
  useEffect(() => {
    let cancelled = false
    api
      .modelDepthSlice(variable, depthM, 0)
      .then((data) => {
        if (cancelled || !data?.values?.length) return
        const pts: HeatPoint[] = []
        const cols: OceanCol[] = []
        const { lat: lats, lon: lons, values, vmin, vmax } = data
        const span = vmax - vmin || 1
        setVminmax([vmin, vmax])
        for (let i = 0; i < lats.length; i += 2) {
          for (let j = 0; j < lons.length; j += 2) {
            const v = values[i]?.[j]
            if (v != null && isFinite(v)) {
              const w = Math.max(0, Math.min(1, (v - vmin) / span))
              pts.push({ position: [lons[j], lats[i]], weight: w })
              cols.push({ pos: [lons[j], lats[i]], value: v, depth: depthM })
            }
          }
        }
        setHeatData(pts)
        setOceanCols(cols)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [variable, depthM])

  // Glider trajectory
  useEffect(() => {
    if (!scene.show_glider) {
      setGliderData([])
      return
    }
    api
      .gliderTrajectory()
      .then((data) => {
        if (!data?.waypoints?.length) return
        const path: [number, number, number][] = data.waypoints.map((w: any) => [
          w.lon,
          w.lat,
          -(w.depth_m ?? 50),
        ])
        setGliderData([{ path }])
      })
      .catch(() => {})
  }, [scene.show_glider])

  // Currents
  useEffect(() => {
    if (!scene.show_currents) {
      setArcData([])
      return
    }
    Promise.all([
      api.modelDepthSlice('u_current', depthM, 0),
      api.modelDepthSlice('v_current', depthM, 0),
    ])
      .then(([uF, vF]) => {
        if (!uF?.values || !vF?.values) return
        const { lat: lats, lon: lons } = uF
        const arcs: CurrentArc[] = []
        const sL = Math.max(1, Math.floor(lats.length / 10))
        const sO = Math.max(1, Math.floor(lons.length / 14))
        for (let i = 0; i < lats.length; i += sL) {
          for (let j = 0; j < lons.length; j += sO) {
            const u = uF.values[i]?.[j],
              v = vF.values[i]?.[j]
            if (u == null || v == null) continue
            const spd = Math.sqrt(u * u + v * v)
            if (!isFinite(spd) || spd < 0.01) continue
            arcs.push({
              from: [lons[j], lats[i]],
              to: [lons[j] + u * 2, lats[i] + v * 2],
              speed: spd,
            })
          }
        }
        setArcData(arcs)
      })
      .catch(() => {})
  }, [scene.show_currents, depthM])

  // MapLibre terrain setup
  const onMapLoad = useCallback((evt: any) => {
    const map = evt.target
    mapRef.current = map

    try {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
        tileSize: 256,
      })
      map.setTerrain({ source: 'terrain-dem', exaggeration: 5 })
    } catch (_) {}

    try {
      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 8,
          'sky-atmosphere-color': 'rgba(3,6,18,1)',
          'sky-atmosphere-halo-color': 'rgba(0,80,160,0.6)',
        },
      })
    } catch (_) {}
  }, [])

  // Build deck.gl layers
  const layers: any[] = []

  // 1. HYCOM / IGORA Depth-slice Heatmap
  if (scene.show_model && heatData.length > 0) {
    layers.push(
      new HeatmapLayer({
        id: 'model-heatmap',
        data: heatData,
        getPosition: (d: HeatPoint) => d.position,
        getWeight: (d: HeatPoint) => d.weight,
        radiusPixels: 80,
        intensity: 1.8,
        threshold: 0.04,
        colorRange: variable === 'salinity' ? SAL_CR : TEMP_CR,
        opacity: 0.65,
      })
    )
  }

  // 2. 3D Column Extrusions for depth slice values
  if (scene.show_model && is3D && oceanCols.length > 0) {
    const span = vminmax[1] - vminmax[0] || 1
    layers.push(
      new ColumnLayer({
        id: 'ocean-columns-3d',
        data: oceanCols,
        getPosition: (d: OceanCol) => [d.pos[0], d.pos[1], -d.depth],
        getElevation: (d: OceanCol) => ((d.value - vminmax[0]) / span) * 18000,
        getFillColor: (d: OceanCol) =>
          variable === 'salinity' ? salinityColor(d.value) : tempColor(d.value),
        radius: 12000,
        extruded: true,
        wireframe: false,
        elevationScale: 1,
        opacity: 0.8,
        pickable: true,
      })
    )
  }

  // 3. Glider Subsurface Path
  if (scene.show_glider && gliderData.length > 0) {
    layers.push(
      new PathLayer({
        id: 'glider-path-3d',
        data: gliderData,
        getPath: (d: GliderPath) => d.path,
        getColor: [255, 215, 0, 240],
        getWidth: 6,
        widthMinPixels: 3,
        shadowEnabled: true,
      })
    )
  }

  // 4. Current Vectors
  if (scene.show_currents && arcData.length > 0) {
    layers.push(
      new ArcLayer({
        id: 'current-arcs',
        data: arcData,
        getSourcePosition: (d: CurrentArc) => d.from,
        getTargetPosition: (d: CurrentArc) => d.to,
        getSourceColor: (d: CurrentArc) => [
          0,
          Math.min(255, 100 + d.speed * 200),
          255,
          180,
        ],
        getTargetColor: (d: CurrentArc) => [
          255,
          Math.min(255, d.speed * 300),
          100,
          230,
        ],
        getWidth: 2.5,
        getHeight: 0.2,
      })
    )
  }

  // 5. Argo Float Markers
  if (scene.show_argo && displayFloats.length > 0) {
    layers.push(
      new ScatterplotLayer({
        id: 'argo-floats-outer-glow',
        data: displayFloats,
        getPosition: (d: ArgoFloat) => [d.longitude, d.latitude, 0],
        getRadius: (d: ArgoFloat) => (selectedFloat?.platform_number === d.platform_number ? 28000 : 16000),
        getFillColor: (d: ArgoFloat) => {
          const c = tempColor(d.temp_surface)
          return [c[0], c[1], c[2], 90]
        },
        radiusMinPixels: 6,
        radiusMaxPixels: 20,
        pickable: false,
      })
    )

    layers.push(
      new ScatterplotLayer({
        id: 'argo-floats-core',
        data: displayFloats,
        getPosition: (d: ArgoFloat) => [d.longitude, d.latitude, 0],
        getRadius: (d: ArgoFloat) => (selectedFloat?.platform_number === d.platform_number ? 14000 : 7000),
        getFillColor: (d: ArgoFloat) => tempColor(d.temp_surface),
        getLineColor: [255, 255, 255, 230],
        lineWidthMinPixels: 1.5,
        stroked: true,
        radiusMinPixels: 4,
        radiusMaxPixels: 12,
        pickable: true,
        onClick: (info: any) => {
          if (info.object) {
            onFloatSelect({
              platform_number: info.object.platform_number,
              cycle_number:    info.object.cycle_number,
              latitude:        info.object.latitude,
              longitude:       info.object.longitude,
              time:            info.object.time,
            })
          }
        },
        onHover: (info: any) => {
          if (info.object) {
            setTooltip({ object: info.object, x: info.x, y: info.y })
          } else {
            setTooltip(null)
          }
        },
      })
    )
  }

  // 6. City labels
  layers.push(
    new TextLayer({
      id: 'city-labels',
      data: CITIES,
      getPosition: (d: any) => [d.lon, d.lat, 100],
      getText: (d: any) => d.name,
      getSize: 12,
      getColor: [210, 235, 255, 210],
      getAngle: 0,
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      getPixelOffset: [10, 0],
    })
  )

  const flyTo = (lon: number, lat: number, z = 6.5, p = 60, b = 0) => {
    setViewState({ ...viewState, longitude: lon, latitude: lat, zoom: z, pitch: p, bearing: b })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* DeckGL Map */}
      <DeckGL
        viewState={viewState as any}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={{ doubleClickZoom: false, dragRotate: true } as any}
        layers={layers}
        style={{ position: 'absolute', inset: '0' } as React.CSSProperties}
      >
        <Map mapStyle={BASEMAP} onLoad={onMapLoad} />
      </DeckGL>

      {/* Transparent 3D Wave Canvas Overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: 0.82,
        }}
      />

      {/* Fly-to Region Quick Controls */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 16,
          zIndex: 20,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {[
          { label: '🇮🇳 Indian Ocean', lon: 77, lat: 10, z: 4.8, p: 52, b: -8 },
          { label: '🌊 Arabian Sea', lon: 65, lat: 16, z: 5.8, p: 58, b: -15 },
          { label: '🌀 Bay of Bengal', lon: 88, lat: 14, z: 5.8, p: 58, b: 12 },
          { label: '🏙️ Chennai 3D', lon: 80.4, lat: 13.0, z: 7.2, p: 70, b: -25 },
          { label: '🏝️ Maldives', lon: 73.5, lat: 4.2, z: 7.0, p: 65, b: 10 },
          { label: '🌍 World View', lon: 75, lat: 5, z: 3.2, p: 30, b: 0 },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={() => flyTo(btn.lon, btn.lat, btn.z, btn.p, btn.b)}
            style={{
              background: 'rgba(4,16,36,0.85)',
              border: '1px solid rgba(0,180,255,0.4)',
              color: '#70d8ff',
              padding: '5px 11px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Depth Slider */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          zIndex: 20,
          background: 'rgba(4,16,36,0.88)',
          border: '1px solid rgba(0,180,255,0.35)',
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          backdropFilter: 'blur(10px)',
          color: '#e0f4ff',
          fontSize: 12,
        }}
      >
        <span>Depth:</span>
        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={depthM}
          onChange={(e) => setDepthM(Number(e.target.value))}
          style={{ width: 100, accentColor: '#00b4ff', cursor: 'pointer' }}
        />
        <span style={{ fontWeight: 700, color: '#00e5ff', minWidth: 45 }}>{depthM}m</span>
      </div>

      {/* Floating Info Badges */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 16,
          zIndex: 20,
          display: 'flex',
          gap: 8,
        }}
      >
        <div
          style={{
            background: 'rgba(4,16,36,0.85)',
            border: '1px solid rgba(0,180,255,0.3)',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#a0e0ff',
            fontSize: 11,
            backdropFilter: 'blur(8px)',
          }}
        >
          🌊 3D Gerstner Wave Shader Active
        </div>
        <div
          style={{
            background: 'rgba(4,16,36,0.85)',
            border: '1px solid rgba(0,180,255,0.3)',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#a0e0ff',
            fontSize: 11,
            backdropFilter: 'blur(8px)',
          }}
        >
          🇮🇳 Land: Solid Black (India)
        </div>
        <div
          style={{
            background: 'rgba(4,16,36,0.85)',
            border: '1px solid rgba(0,180,255,0.3)',
            borderRadius: 6,
            padding: '6px 12px',
            color: '#a0e0ff',
            fontSize: 11,
            backdropFilter: 'blur(8px)',
          }}
        >
          📡 Active Floats: {displayFloats.length}
        </div>
      </div>

      {/* Float Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 12,
            zIndex: 30,
            background: 'rgba(2,12,28,0.92)',
            border: '1px solid #00b4ff',
            borderRadius: 6,
            padding: '8px 12px',
            color: '#fff',
            fontSize: 11,
            pointerEvents: 'none',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontWeight: 700, color: '#00e5ff', marginBottom: 2 }}>
            Argo Float #{tooltip.object.platform_number}
          </div>
          <div>Lat: {tooltip.object.latitude.toFixed(2)}°N</div>
          <div>Lon: {tooltip.object.longitude.toFixed(2)}°E</div>
          <div>Temp: {tooltip.object.temp_surface?.toFixed(1) ?? 'N/A'} °C</div>
          <div>Salinity: {tooltip.object.psal_surface?.toFixed(2) ?? 'N/A'} PSU</div>
        </div>
      )}
    </div>
  )
}
