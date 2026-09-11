/**
 * OceanCubeScene.tsx — 3D Volumetric Ocean Digital Twin & Regional Terrain Viewer
 *
 * Enhanced Capabilities:
 * 1. Strict Land-Masking: Ocean water, Gerstner wave displacement, and subsurface
 *    depth slices do NOT flow over land terrain (GEBCO bathymetry land mask).
 * 2. Coastal Boundary Wave Damping: Natural shoreline wave attenuation & surf foam.
 * 3. Multi-Factor Depth Sensing: Real-time depth-dependent physics & model values:
 *    • Temperature (°C) — Surface warm layer, thermocline drop, abyssal floor
 *    • Salinity (PSU) — Arabian Sea hypersalinity vs Bay of Bengal river plume
 *    • Current Velocity (m/s) — Wyrtki jet flow, speed and direction (u, v)
 *    • Seawater Density (σθ kg/m³) — Pycnocline stratification
 *    • Acoustic Sound Velocity (m/s) — SOFAR channel profiling
 *    • Hydrostatic Pressure (dbar) & Dissolved Oxygen (OMZ minimum)
 * 4. Stratified Argo CTD Sensor Beads: Depth-calibrated observation nodes along buoy cables.
 * 5. Volumetric Slicing & Interactive 3D Probe HUD with live water column telemetry.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SceneState, SelectedFloat } from '../types'
import { ArgoFloat, api, OceanPointFactors } from '../services/api'
import Minimap from './Minimap'

const TERR_W = 100, TERR_D = 60, SEG_W = 160, SEG_D = 96
const LON_MIN = 55, LON_MAX = 100, LAT_MIN = 0, LAT_MAX = 30
const OCEAN_SCALE = 0.0015   // 2000m = 3.0 units below water
const LAND_SCALE = 0.0008    // 300m elevation = 0.24 units — gentle realistic topography

interface BBox {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

interface CS {
  v: number
  c: THREE.Color
}

interface DepthPhysics {
  temp: number
  sal: number
  speed: number
  u: number
  v: number
  dir: number
  pressure: number
  density: number
  sigmaTheta: number
  soundSpeed: number
  oxygen: number
  zone: string
}

interface Probe {
  lat: number
  lon: number
  depth_m: number
  isLand: boolean
  elev?: number
  screenX: number
  screenY: number
  physics: DepthPhysics
}

interface OceanCubeSceneProps {
  scene: SceneState
  floats: ArgoFloat[]
  filteredFloats?: ArgoFloat[]
  onFloatSelect: (f: SelectedFloat) => void
  selectedFloat: SelectedFloat | null
  region: BBox
  onRegionSelect?: (b: BBox) => void
}

// ── Geographic to World Coordinates ──────────────────────────────────────────
function wp(lat: number, lon: number, depth_m = 0): THREE.Vector3 {
  return new THREE.Vector3(
    ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * TERR_W - TERR_W / 2,
    -depth_m * OCEAN_SCALE,
    TERR_D / 2 - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * TERR_D
  )
}

function xzll(x: number, z: number): { lat: number; lon: number } {
  return {
    lat: LAT_MIN + ((TERR_D / 2 - z) / TERR_D) * (LAT_MAX - LAT_MIN),
    lon: LON_MIN + ((x + TERR_W / 2) / TERR_W) * (LON_MAX - LON_MIN),
  }
}

// ── Color Scales ─────────────────────────────────────────────────────────────
const TEMP: CS[] = [
  { v: 2,  c: new THREE.Color(0x2c1654) }, // Abyssal purple-blue
  { v: 8,  c: new THREE.Color(0x1a237e) }, // Deep navy
  { v: 14, c: new THREE.Color(0x0288d1) }, // Mesopelagic cyan
  { v: 20, c: new THREE.Color(0x00897b) }, // Thermocline teal
  { v: 26, c: new THREE.Color(0xcddc39) }, // Warm subtropical yellow-green
  { v: 32, c: new THREE.Color(0xc62828) }, // Tropical pool coral red
]

const SAL: CS[] = [
  { v: 30, c: new THREE.Color(0x4a0e8f) }, // Fresh plume violet
  { v: 33, c: new THREE.Color(0x1565c0) }, // Bay of Bengal blue
  { v: 35, c: new THREE.Color(0x0288d1) }, // Marine cyan
  { v: 37, c: new THREE.Color(0x26a69a) }, // Arabian Sea saline teal
  { v: 38, c: new THREE.Color(0xf9a825) }, // Hypersaline gold
]

const SPD: CS[] = [
  { v: 0.0, c: new THREE.Color(0x000033) },
  { v: 0.3, c: new THREE.Color(0x003087) },
  { v: 0.6, c: new THREE.Color(0x0088bb) },
  { v: 1.0, c: new THREE.Color(0x00dd88) },
  { v: 1.5, c: new THREE.Color(0xffff00) },
]

const LAND: CS[] = [
  { v: 0,    c: new THREE.Color(0xd4b483) }, // Coast sand
  { v: 30,   c: new THREE.Color(0x6aaa4a) }, // Plains vegetation
  { v: 150,  c: new THREE.Color(0x4a7c35) }, // Deciduous green
  { v: 400,  c: new THREE.Color(0x8b7040) }, // Plateau brown
  { v: 1000, c: new THREE.Color(0x888888) }, // High terrain rock
]

const FLOOR: CS[] = [
  { v: 0,    c: new THREE.Color(0x00bcd4) }, // Continental shelf turquoise
  { v: 150,  c: new THREE.Color(0x0288d1) }, // Continental slope azure
  { v: 800,  c: new THREE.Color(0x1565c0) }, // Bathyal zone royal blue
  { v: 2500, c: new THREE.Color(0x0d47a1) }, // Abyssal plain deep blue
  { v: 5000, c: new THREE.Color(0x082b6b) }, // Trench deep navy
]

function lerpColor(val: number, stops: CS[]): THREE.Color {
  if (val <= stops[0].v) return stops[0].c.clone()
  if (val >= stops[stops.length - 1].v) return stops[stops.length - 1].c.clone()
  for (let i = 0; i < stops.length - 1; i++) {
    if (val >= stops[i].v && val <= stops[i + 1].v) {
      const f = (val - stops[i].v) / (stops[i + 1].v - stops[i].v)
      return new THREE.Color().lerpColors(stops[i].c, stops[i + 1].c, f)
    }
  }
  return stops[0].c.clone()
}

function dColor(norm: number, v: string, mn: number, mx: number): THREE.Color {
  const val = mn + norm * (mx - mn)
  return v === 'salinity' ? lerpColor(val, SAL) : v === 'current_speed' ? lerpColor(val, SPD) : lerpColor(val, TEMP)
}

function bilin(elev: number[][], lf: number, of: number, rows: number, cols: number): number {
  const i0 = Math.max(0, Math.min(rows - 2, Math.floor(lf * (rows - 1))))
  const j0 = Math.max(0, Math.min(cols - 2, Math.floor(of * (cols - 1))))
  const t = lf * (rows - 1) - i0
  const s = of * (cols - 1) - j0
  return (
    (elev[i0]?.[j0] ?? -1000) * (1 - t) * (1 - s) +
    (elev[i0 + 1]?.[j0] ?? -1000) * t * (1 - s) +
    (elev[i0]?.[j0 + 1] ?? -1000) * (1 - t) * s +
    (elev[i0 + 1]?.[j0 + 1] ?? -1000) * t * s
  )
}

// ── Analytical Ocean Depth Physics & Stratification Model ───────────────────
function computeOceanPhysicsAtDepth(
  lat: number,
  lon: number,
  depthM: number,
  timeIdx = 0
): DepthPhysics {
  const isArabian = lon < 77.0
  const isBayOfBengal = lon >= 77.0 && lat > 5.0
  const surfTemp = 28.6 + Math.sin(lat * 0.08) * 1.4 - (isArabian ? 0.4 : 0)
  const surfSal = isArabian ? 36.5 : isBayOfBengal ? 32.6 : 34.9

  // Thermocline stratification profile
  let temp: number
  if (depthM < 35) {
    temp = surfTemp
  } else if (depthM < 160) {
    temp = surfTemp - ((depthM - 35) / 125) * (surfTemp - 16.5)
  } else if (depthM < 500) {
    temp = 16.5 - ((depthM - 160) / 340) * 8.5
  } else if (depthM < 1000) {
    temp = 8.0 - ((depthM - 500) / 500) * 3.6
  } else {
    temp = 4.4 - ((depthM - 1000) / 1000) * 2.1
  }

  // Halocline salinity profile
  let sal: number
  if (depthM < 40) {
    sal = surfSal
  } else if (depthM < 250) {
    sal = surfSal + (isBayOfBengal ? 2.4 : -0.35) * ((depthM - 40) / 210)
  } else if (depthM < 1000) {
    sal = 35.15 - ((depthM - 250) / 750) * 0.35
  } else {
    sal = 34.8 + ((depthM - 1000) / 1000) * 0.12
  }

  // Current velocity profile (Wyrtki Jet at equator + monsoon drift)
  const surfSpeed = Math.abs(lat) < 3.5 ? 0.82 : 0.38
  const speed = surfSpeed * Math.exp(-depthM / 175.0)
  const u = Math.sin(lat * 0.22 + timeIdx * 0.52) * speed
  const v = Math.cos(lon * 0.18) * speed * 0.65
  const dir = ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360

  const pressure = depthM * 1.015
  const density = 1000.0 + 28.1 - 0.065 * temp + 0.78 * (sal - 35.0) + 0.0045 * pressure
  const sigmaTheta = density - 1000.0
  const soundSpeed = 1448.96 + 4.591 * temp - 0.05304 * temp * temp + 1.34 * (sal - 35.0) + 0.0163 * depthM

  // Dissolved oxygen (OMZ dip at 150-600m)
  let oxygen: number
  if (depthM < 50) {
    oxygen = 212
  } else if (depthM < 350) {
    oxygen = 212 - ((depthM - 50) / 300) * 188 // Minimum in northern Indian Ocean OMZ
  } else if (depthM < 1000) {
    oxygen = 24 + ((depthM - 350) / 650) * 66
  } else {
    oxygen = 90 + ((depthM - 1000) / 1000) * 48
  }

  const zone =
    depthM < 200
      ? 'Sunlit Epipelagic (0–200m)'
      : depthM < 1000
      ? 'Twilight Mesopelagic (200–1000m)'
      : depthM < 4000
      ? 'Midnight Bathypelagic (1000–4000m)'
      : 'Abyssal Zone (>4000m)'

  return {
    temp: Number(temp.toFixed(2)),
    sal: Number(sal.toFixed(2)),
    speed: Number(speed.toFixed(2)),
    u: Number(u.toFixed(2)),
    v: Number(v.toFixed(2)),
    dir: Math.round(dir),
    pressure: Math.round(pressure),
    density: Number(density.toFixed(1)),
    sigmaTheta: Number(sigmaTheta.toFixed(2)),
    soundSpeed: Math.round(soundSpeed),
    oxygen: Math.round(oxygen),
    zone,
  }
}

// ── Photorealistic Land-Masked Gerstner Ocean Surface Shaders ─────────────────
const WVERT = /* glsl */`
  uniform float uTime;
  uniform sampler2D uLandMask;
  varying vec2  vUv;
  varying float vWaveHeight;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying float vElev;
  varying vec3  vViewPosition;

  // Gerstner floating wave function
  vec3 gerstner(vec3 pos, float Q, float A, float kx, float kz, float speed) {
    float k = length(vec2(kx, kz));
    float w = sqrt(9.81 * k);
    float phi = kx * pos.x + kz * pos.z - w * uTime * speed;
    float Qa = Q * A;
    return vec3(
      Qa * kx / k * cos(phi),
      A * sin(phi),
      Qa * kz / k * cos(phi)
    );
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    float elev = texture2D(uLandMask, uv).r;
    vElev = elev;

    vec3 d = vec3(0.0);
    // STRICT LAND MASKING: Floating waves only simulated in ocean (elev < 0), damped at shores
    if (elev < 0.0) {
      float shoreDamp = smoothstep(-1.0, -35.0, elev);
      // Primary swell rolling waves
      d += gerstner(p, 0.65 * shoreDamp, 0.75 * shoreDamp,  0.22, 0.09, 1.15);
      d += gerstner(p, 0.55 * shoreDamp, 0.55 * shoreDamp, -0.15, 0.28, 1.05);
      // Secondary cross-swells & floating waves
      d += gerstner(p, 0.45 * shoreDamp, 0.38 * shoreDamp,  0.42, 0.18, 1.45);
      d += gerstner(p, 0.35 * shoreDamp, 0.26 * shoreDamp,  0.08,-0.38, 1.70);
      // High-frequency surface ripples & floating chop
      d += gerstner(p, 0.25 * shoreDamp, 0.16 * shoreDamp,  0.65, 0.35, 2.10);
      d += gerstner(p, 0.20 * shoreDamp, 0.12 * shoreDamp, -0.38, 0.55, 1.90);
    }

    p += d;
    vWaveHeight = d.y;
    vWorldPos   = p;

    // Normal calculation with floating wave derivatives
    float eps = 0.35;
    vec3 px = position + vec3(eps, 0.0, 0.0);
    vec3 pz = position + vec3(0.0, 0.0, eps);
    vec3 dx = vec3(eps, 0.0, 0.0);
    vec3 dz = vec3(0.0, 0.0, eps);
    if (elev < 0.0) {
      float shoreDamp = smoothstep(-1.0, -35.0, elev);
      dx += gerstner(px, 0.65 * shoreDamp, 0.75 * shoreDamp, 0.22, 0.09, 1.15) +
            gerstner(px, 0.55 * shoreDamp, 0.55 * shoreDamp,-0.15, 0.28, 1.05) +
            gerstner(px, 0.45 * shoreDamp, 0.38 * shoreDamp, 0.42, 0.18, 1.45);
      dz += gerstner(pz, 0.65 * shoreDamp, 0.75 * shoreDamp, 0.22, 0.09, 1.15) +
            gerstner(pz, 0.55 * shoreDamp, 0.55 * shoreDamp,-0.15, 0.28, 1.05) +
            gerstner(pz, 0.45 * shoreDamp, 0.38 * shoreDamp, 0.42, 0.18, 1.45);
    }
    vNormal = normalize(cross(dz - d, dx - d));

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const WFRAG = /* glsl */`
  uniform float uTime;
  uniform sampler2D uLandMask;
  varying vec2  vUv;
  varying float vWaveHeight;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying float vElev;
  varying vec3  vViewPosition;

  void main() {
    float elev = texture2D(uLandMask, vUv).r;

    // Water is strictly rendered across all ocean areas. Land above sea level is discarded.
    if (elev > 0.0) {
      discard;
    }

    // Gorgeous vibrant sapphire & azure ocean blue palette
    vec3 deepOceanBlue   = vec3(0.015, 0.22, 0.68); // Deep sapphire ocean blue
    vec3 midAzureBlue    = vec3(0.035, 0.48, 0.92); // Rich oceanic azure blue
    vec3 shallowCyanBlue = vec3(0.08, 0.76, 0.98);  // Sunlit turquoise cyan
    vec3 coastalEmerald  = vec3(0.06, 0.82, 0.92);  // Vibrant coastal shelf
    vec3 foamWhite       = vec3(0.95, 0.98, 1.00);  // Crisp wave foam white

    // Depth and wave height color modulation
    float waveNorm = clamp((vWaveHeight + 0.6) / 1.3, 0.0, 1.0);
    vec3 waterColor = mix(deepOceanBlue, midAzureBlue, smoothstep(0.1, 0.7, waveNorm));
    waterColor = mix(waterColor, shallowCyanBlue, smoothstep(0.6, 0.95, waveNorm) * 0.5);

    // Coastal shallow shelf gradient
    float coastalFactor = smoothstep(-350.0, 0.0, elev);
    waterColor = mix(waterColor, coastalEmerald, coastalFactor * 0.4);

    // Fresnel reflection for realistic water surface sheen
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 3.5);

    // Sky reflection (brilliant ocean sky blue highlight)
    vec3 skyReflectionColor = vec3(0.35, 0.75, 1.00);
    waterColor = mix(waterColor, skyReflectionColor, fresnel * 0.45);

    // Dynamic floating wave sunlight specular glints
    vec3 lightDir = normalize(vec3(0.45, 0.85, 0.28));
    vec3 halfVec  = normalize(lightDir + V);
    float specMain = pow(max(dot(N, halfVec), 0.0), 90.0) * 1.6;
    float specSoft = pow(max(dot(N, halfVec), 0.0), 20.0) * 0.35;
    vec3 specularLight = vec3(0.98, 0.99, 1.00) * (specMain + specSoft);
    waterColor += specularLight;

    // Floating wave crest foam & dynamic shoreline surf
    float crestFoam = smoothstep(0.38, 0.95, vWaveHeight);
    float microFoam = sin(vUv.x * 140.0 + uTime * 2.8) * cos(vUv.y * 110.0 + uTime * 2.2) * 0.5 + 0.5;
    float shoreSurf = smoothstep(-15.0, 0.0, elev) * (0.5 + 0.5 * sin(uTime * 3.5 + vUv.x * 70.0));
    float totalFoam = max(crestFoam * microFoam * 0.75, shoreSurf * 0.65);
    waterColor = mix(waterColor, foamWhite, clamp(totalFoam, 0.0, 1.0) * 0.8);

    // Underwater caustic light patterns dancing on the surface
    float causticA = abs(sin(vUv.x * 28.0 + uTime * 1.5) * sin(vUv.y * 24.0 + uTime * 1.2));
    float causticB = abs(sin(vUv.x * 42.0 - uTime * 2.0) * sin(vUv.y * 36.0 + uTime * 1.6));
    float caustic = pow(mix(causticA, causticB, 0.5), 3.0) * 0.25;
    waterColor += vec3(caustic * 0.3, caustic * 0.7, caustic * 1.0);

    // High opacity so the water is richly visible and NEVER a black void
    float edgeAlpha = smoothstep(0.0, -2.5, elev);
    float alpha = mix(0.97, 0.92, fresnel) * edgeAlpha;

    gl_FragColor = vec4(waterColor, alpha);
  }
`

export default function OceanCubeScene({
  scene,
  floats,
  filteredFloats,
  onFloatSelect,
  selectedFloat,
  region,
  onRegionSelect,
}: OceanCubeSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const scene3Ref = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const terrainGeoRef = useRef<THREE.BufferGeometry | null>(null)
  const terrainMshRef = useRef<THREE.Mesh | null>(null)
  const waveUni = useRef({
    uTime: { value: 0 },
    uLandMask: { value: new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType) },
  })
  const landMaskTexRef = useRef<THREE.DataTexture | null>(null)
  const gebcoGridRef = useRef<{ lat: number[]; lon: number[]; elevation: number[][] } | null>(null)

  const sliceGrpRef = useRef<THREE.Group | null>(null)
  const floatGrpRef = useRef<THREE.Group | null>(null)
  const gliderGrpRef = useRef<THREE.Group | null>(null)
  const arrowGrpRef = useRef<THREE.Group | null>(null)
  const labelsGrpRef = useRef<THREE.Group | null>(null)
  const activeDepthRingsRef = useRef<THREE.Group | null>(null)
  const floatMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const floatDataRef = useRef<ArgoFloat[]>([])
  const rayRef = useRef(new THREE.Raycaster())
  const keysRef = useRef<Set<string>>(new Set())
  const walkModeRef = useRef(false)
  const lookDragRef = useRef(false)
  const yawRef = useRef(0)
  const pitchRef = useRef(-0.35)
  const regionRef = useRef(region)
  const slicePctRef = useRef(0)
  const billboards = useRef<THREE.Object3D[]>([])

  const [slicePct, setSlicePct] = useState(0)
  const [walkMode, setWalkMode] = useState(false)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [walkPos, setWalkPos] = useState<{ lat: number; lon: number; depth_m: number; physics: DepthPhysics } | null>(null)

  const displayFloats = filteredFloats ?? floats
  const depthM = Math.round((slicePct / 100) * 2000)

  useEffect(() => { regionRef.current = region }, [region])
  useEffect(() => { slicePctRef.current = slicePct }, [slicePct])
  useEffect(() => { walkModeRef.current = walkMode }, [walkMode])

  // ── 1. Init Three.js Scene & Lighting ───────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const W = mount.clientWidth || 900
    const H = mount.clientHeight || 600

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x060c18, 1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const cam = new THREE.PerspectiveCamera(52, W / H, 0.05, 600)
    cam.position.set(0, 18, 28)
    cam.lookAt(0, 0, 0)
    cameraRef.current = cam

    const s = new THREE.Scene()
    const skyGeo = new THREE.SphereGeometry(500, 16, 8)
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vPos;void main(){float t=clamp((normalize(vPos).y+0.1)/1.1,0.0,1.0);vec3 horizon=vec3(0.012,0.06,0.18);vec3 zenith=vec3(0.003,0.016,0.06);gl_FragColor=vec4(mix(horizon,zenith,t),1.0);}`,
      side: THREE.BackSide,
    })
    s.add(new THREE.Mesh(skyGeo, skyMat))
    s.fog = new THREE.Fog(0x060c18, 300, 550)
    scene3Ref.current = s

    const ctrl = new OrbitControls(cam, renderer.domElement)
    ctrl.enableDamping = true
    ctrl.dampingFactor = 0.07
    ctrl.rotateSpeed = 0.6
    ctrl.panSpeed = 1.5
    ctrl.zoomSpeed = 1.2
    ctrl.enablePan = true
    ctrl.screenSpacePanning = true
    ctrl.minDistance = 0.5
    ctrl.maxDistance = 220
    ctrl.minPolarAngle = 0
    ctrl.maxPolarAngle = Math.PI * 0.87
    ctrl.target.set(0, 0, 0)
    controlsRef.current = ctrl

    // Enhanced Lighting
    s.add(new THREE.HemisphereLight(0x6ab4ff, 0x002244, 1.6))
    const sun = new THREE.DirectionalLight(0xfff5e6, 3.8)
    sun.position.set(60, 120, 40)
    s.add(sun)
    const fill = new THREE.DirectionalLight(0x1e88e5, 1.2)
    fill.position.set(-30, -5, -20)
    s.add(fill)
    const rim = new THREE.DirectionalLight(0x0055aa, 1.4)
    rim.position.set(0, 5, -80)
    s.add(rim)

    // Starfield particles
    const sp = new Float32Array(800 * 3)
    for (let i = 0; i < sp.length; i++) sp[i] = (Math.random() - 0.5) * 500
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x7799bb, size: 0.5, transparent: true, opacity: 0.3 })))

    // Base terrain mesh
    const tGeo = new THREE.PlaneGeometry(TERR_W, TERR_D, SEG_W, SEG_D)
    tGeo.rotateX(-Math.PI / 2)
    const vc = (SEG_W + 1) * (SEG_D + 1)
    const ca = new Float32Array(vc * 3)
    for (let i = 0; i < ca.length; i += 3) {
      ca[i] = 0.04
      ca[i + 1] = 0.35
      ca[i + 2] = 0.75
    }
    tGeo.setAttribute('color', new THREE.Float32BufferAttribute(ca, 3))
    terrainGeoRef.current = tGeo
    const tMsh = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.08 }))
    tMsh.name = 'terrain'
    terrainMshRef.current = tMsh
    s.add(tMsh)

    // Land-Masked Ocean Surface
    const wGeo = new THREE.PlaneGeometry(TERR_W, TERR_D, 260, 160)
    wGeo.rotateX(-Math.PI / 2)
    const wMat = new THREE.ShaderMaterial({
      vertexShader: WVERT,
      fragmentShader: WFRAG,
      uniforms: waveUni.current,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const wMsh = new THREE.Mesh(wGeo, wMat)
    wMsh.position.y = 0.05
    wMsh.name = 'water'
    s.add(wMsh)

    // Volumetric Ocean Basin Side Walls (enclosing the 3D Ocean Cube)
    const maxDepthY = -2000 * OCEAN_SCALE // -3.0 units
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x05234d,
      roughness: 0.6,
      metalness: 0.2,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    })
    // South Wall
    const sWallGeo = new THREE.PlaneGeometry(TERR_W, Math.abs(maxDepthY))
    const sWall = new THREE.Mesh(sWallGeo, wallMat)
    sWall.position.set(0, maxDepthY / 2, TERR_D / 2)
    s.add(sWall)
    // North Wall
    const nWall = new THREE.Mesh(sWallGeo, wallMat)
    nWall.position.set(0, maxDepthY / 2, -TERR_D / 2)
    s.add(nWall)
    // West Wall
    const wWallGeo = new THREE.PlaneGeometry(TERR_D, Math.abs(maxDepthY))
    const wWall = new THREE.Mesh(wWallGeo, wallMat)
    wWall.rotateY(Math.PI / 2)
    wWall.position.set(-TERR_W / 2, maxDepthY / 2, 0)
    s.add(wWall)
    // East Wall
    const eWall = new THREE.Mesh(wWallGeo, wallMat)
    eWall.rotateY(Math.PI / 2)
    eWall.position.set(TERR_W / 2, maxDepthY / 2, 0)
    s.add(eWall)
    // Basin bottom slab
    const botGeo = new THREE.PlaneGeometry(TERR_W, TERR_D)
    botGeo.rotateX(-Math.PI / 2)
    const botMsh = new THREE.Mesh(botGeo, wallMat)
    botMsh.position.y = maxDepthY
    s.add(botMsh)

    // Depth Layer Markers
    const bb: THREE.Object3D[] = []
    ;[0, 200, 500, 1000, 1500, 2000].forEach((d) => {
      const y = -d * OCEAN_SCALE
      const cv = document.createElement('canvas')
      cv.width = 200
      cv.height = 44
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = d === 0 ? '#00d4ff' : 'rgba(180,215,235,0.9)'
      ctx.font = `bold ${d === 0 ? 16 : 13}px monospace`
      ctx.textAlign = 'right'
      ctx.fillText(d === 0 ? 'Surface  ' : `${d} m  `, 195, 28)
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 0.5),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
      )
      lbl.position.set(-TERR_W / 2 - 2.0, y, 0)
      s.add(lbl)
      bb.push(lbl)
      s.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-TERR_W / 2 - 0.15, y, 0),
            new THREE.Vector3(-TERR_W / 2 + 0.1, y, 0),
          ]),
          new THREE.LineBasicMaterial({ color: 0x446688, transparent: true, opacity: 0.5 })
        )
      )
    })
    billboards.current = bb

    const mk = (n: string) => {
      const g = new THREE.Group()
      g.name = n
      s.add(g)
      return g
    }
    sliceGrpRef.current = mk('slice')
    floatGrpRef.current = mk('floats')
    gliderGrpRef.current = mk('glider')
    arrowGrpRef.current = mk('arrows')
    labelsGrpRef.current = mk('labels')
    activeDepthRingsRef.current = mk('active-rings')

    // Event listeners
    const onKD = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())
      if (e.key === 'Escape' && walkModeRef.current) {
        setWalkMode(false)
        walkModeRef.current = false
        ctrl.enabled = true
      }
    }
    const onKU = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
    const onMD = (e: MouseEvent) => {
      if (walkModeRef.current && e.button === 0) lookDragRef.current = true
    }
    const onMU = () => {
      lookDragRef.current = false
    }
    const onMM = (e: MouseEvent) => {
      if (walkModeRef.current && lookDragRef.current) {
        yawRef.current -= (e.movementX || 0) * 0.002
        pitchRef.current = Math.max(-1.3, Math.min(0.7, pitchRef.current - (e.movementY || 0) * 0.002))
      }
    }

    window.addEventListener('keydown', onKD)
    window.addEventListener('keyup', onKU)
    renderer.domElement.addEventListener('mousedown', onMD)
    renderer.domElement.addEventListener('mouseup', onMU)
    renderer.domElement.addEventListener('mousemove', onMM)

    let animId = 0
    let lastT = 0
    const animate = (ts = 0) => {
      animId = requestAnimationFrame(animate)
      const dt = Math.min(0.05, (ts - lastT) / 1000)
      lastT = ts
      waveUni.current.uTime.value += dt * 1.35

      const cy = cam.position.y
      if (cy < 0) {
        const t = Math.min(1, Math.abs(cy) / 8)
        const uwFog = new THREE.Color().lerpColors(new THREE.Color(0x001830), new THREE.Color(0x000510), t)
        renderer.setClearColor(uwFog.getHex(), 1)
        s.fog = new THREE.FogExp2(uwFog.getHex(), 0.018 + t * 0.03)
      } else {
        renderer.setClearColor(0x060c18, 1)
        s.fog = new THREE.Fog(0x060c18, 300, 550)
      }

      if (walkModeRef.current) {
        ctrl.enabled = false
        const spd = 0.25
        const fwd = new THREE.Vector3(
          -Math.sin(yawRef.current) * Math.cos(pitchRef.current),
          Math.sin(pitchRef.current),
          -Math.cos(yawRef.current) * Math.cos(pitchRef.current)
        )
        const rgt = new THREE.Vector3(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current))
        const k = keysRef.current
        if (k.has('w')) cam.position.addScaledVector(fwd, spd)
        if (k.has('s')) cam.position.addScaledVector(fwd, -spd)
        if (k.has('a')) cam.position.addScaledVector(rgt, -spd)
        if (k.has('d')) cam.position.addScaledVector(rgt, spd)
        if (k.has('e')) cam.position.y += spd * 0.5
        if (k.has('q')) cam.position.y -= spd * 0.5
        cam.position.x = Math.max(-TERR_W / 2 - 12, Math.min(TERR_W / 2 + 12, cam.position.x))
        cam.position.z = Math.max(-TERR_D / 2 - 12, Math.min(TERR_D / 2 + 12, cam.position.z))
        cam.rotation.order = 'YXZ'
        cam.rotation.y = yawRef.current
        cam.rotation.x = pitchRef.current

        const ll = xzll(cam.position.x, cam.position.z)
        const curD = Math.max(0, -cam.position.y / OCEAN_SCALE)
        const physics = computeOceanPhysicsAtDepth(ll.lat, ll.lon, curD, Math.round((scene.time_index / 100) * 11))
        setWalkPos({ ...ll, depth_m: curD, physics })
      } else {
        ctrl.enabled = true
        ctrl.update()
        setWalkPos(null)
      }

      bb.forEach((b) => b.quaternion.copy(cam.quaternion))
      labelsGrpRef.current?.children.forEach((b) => b.quaternion.copy(cam.quaternion))
      renderer.render(s, cam)
    }
    animate()

    const onR = () => {
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      cam.aspect = nw / nh
      cam.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    const obs = new ResizeObserver(onR)
    obs.observe(mount)

    return () => {
      cancelAnimationFrame(animId)
      obs.disconnect()
      ctrl.dispose()
      window.removeEventListener('keydown', onKD)
      window.removeEventListener('keyup', onKU)
      renderer.domElement.removeEventListener('mousedown', onMD)
      renderer.domElement.removeEventListener('mouseup', onMU)
      renderer.domElement.removeEventListener('mousemove', onMM)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  // ── 2. Load Real GEBCO Bathymetry & Generate Strict Land Mask Texture ────────
  useEffect(() => {
    let cancelled = false
    const geo = terrainGeoRef.current
    if (!geo) return

    api.gebcoGrid()
      .then((data: any) => {
        if (cancelled || !data.elevation?.length) return
        gebcoGridRef.current = data
        const rows = data.lat.length
        const cols = data.lon.length

        // Create high-res 2D land mask elevation texture for water shaders
        const texData = new Float32Array(rows * cols)
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            texData[i * cols + j] = data.elevation[i]?.[j] ?? -1000.0
          }
        }
        const landMaskTex = new THREE.DataTexture(texData, cols, rows, THREE.RedFormat, THREE.FloatType)
        landMaskTex.magFilter = THREE.LinearFilter
        landMaskTex.minFilter = THREE.LinearFilter
        landMaskTex.needsUpdate = true
        landMaskTexRef.current = landMaskTex
        waveUni.current.uLandMask.value = landMaskTex

        // Terrain vertex displacement & realistic Earth colormapping
        const posAttr = geo.attributes.position as THREE.BufferAttribute
        const colAttr = geo.attributes.color as THREE.BufferAttribute
        const vc = (SEG_W + 1) * (SEG_D + 1)
        const rawY = new Float32Array(vc)
        const rawElev = new Float32Array(vc)

        for (let vi = 0; vi < vc; vi++) {
          const x = posAttr.getX(vi)
          const z = posAttr.getZ(vi)
          const lon = LON_MIN + ((x + TERR_W / 2) / TERR_W) * (LON_MAX - LON_MIN)
          const lat = LAT_MIN + ((TERR_D / 2 - z) / TERR_D) * (LAT_MAX - LAT_MIN)
          const lf = Math.max(0, Math.min(1, (lat - data.lat[0]) / (data.lat[rows - 1] - data.lat[0])))
          const of = Math.max(0, Math.min(1, (lon - data.lon[0]) / (data.lon[cols - 1] - data.lon[0])))

          const ex = Math.min(x + TERR_W / 2, TERR_W / 2 - x) / 8.0
          const ez = Math.min(z + TERR_D / 2, TERR_D / 2 - z) / 6.0
          const edgeFade = Math.min(1.0, Math.max(0, ex) * Math.max(0, ez))
          const elev = bilin(data.elevation, lf, of, rows, cols)
          rawElev[vi] = elev
          rawY[vi] = elev >= 0 ? elev * LAND_SCALE * edgeFade : -Math.abs(elev) * OCEAN_SCALE
        }

        // 5-pass smoothing
        const smooth = new Float32Array(rawY)
        for (let pass = 0; pass < 5; pass++) {
          const tmp = new Float32Array(smooth)
          for (let i = 0; i <= SEG_D; i++) {
            for (let j = 0; j <= SEG_W; j++) {
              let sum = 0
              let cnt = 0
              for (let di = -2; di <= 2; di++) {
                for (let dj = -2; dj <= 2; dj++) {
                  const ni = i + di
                  const nj = j + dj
                  if (ni >= 0 && ni <= SEG_D && nj >= 0 && nj <= SEG_W) {
                    sum += tmp[ni * (SEG_W + 1) + nj]
                    cnt++
                  }
                }
              }
              smooth[i * (SEG_W + 1) + j] = sum / cnt
            }
          }
        }

        for (let vi = 0; vi < vc; vi++) {
          posAttr.setY(vi, smooth[vi])
          const e = rawElev[vi]
          const col = e >= 0 ? lerpColor(e, LAND) : lerpColor(Math.abs(e), FLOOR)
          colAttr.setXYZ(vi, col.r, col.g, col.b)
        }
        posAttr.needsUpdate = true
        colAttr.needsUpdate = true
        geo.computeVertexNormals()

        // Geographic reference city labels
        const labGrp = labelsGrpRef.current
        if (!labGrp) return
        labGrp.clear()
        const cities = [
          { lat: 13.1, lon: 80.3, name: 'Chennai', color: '#f87171' },
          { lat: 19.1, lon: 72.9, name: 'Mumbai', color: '#fbbf24' },
          { lat: 22.6, lon: 88.4, name: 'Kolkata', color: '#34d399' },
          { lat: 6.9,  lon: 79.9, name: 'Colombo', color: '#a78bfa' },
          { lat: 17.4, lon: 78.5, name: 'Hyderabad', color: '#fb923c' },
          { lat: 28.6, lon: 77.2, name: 'Delhi', color: '#f472b6' },
        ]
        cities.forEach((c) => {
          const lf2 = Math.max(0, Math.min(1, (c.lat - data.lat[0]) / (data.lat[rows - 1] - data.lat[0])))
          const of2 = Math.max(0, Math.min(1, (c.lon - data.lon[0]) / (data.lon[cols - 1] - data.lon[0])))
          const ce = bilin(data.elevation, lf2, of2, rows, cols)
          const baseY = ce >= 0 ? ce * LAND_SCALE : 0
          const p = wp(c.lat, c.lon)
          const cv = document.createElement('canvas')
          cv.width = 200
          cv.height = 48
          const ctx = cv.getContext('2d')!
          ctx.fillStyle = c.color
          ctx.font = 'bold 15px Inter,sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(c.name, 100, 30)
          const lbl = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 0.58),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
          )
          lbl.position.set(p.x, baseY + 0.85, p.z)
          lbl.name = 'city-label'
          labGrp.add(lbl)
          labGrp.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(p.x, baseY + 0.02, p.z),
                new THREE.Vector3(p.x, baseY + 0.75, p.z),
              ]),
              new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.85 })
            )
          )
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: c.color }))
          dot.position.set(p.x, baseY + 0.15, p.z)
          labGrp.add(dot)
        })
      })
      .catch(console.error)

    return () => {
      cancelled = true
    }
  }, [])

  // ── 3. Subsurface Model Depth Slice (Strictly in Ocean Column) ─────────────
  useEffect(() => {
    const grp = sliceGrpRef.current
    if (!grp) return
    grp.clear()
    if (!scene.show_model) return

    const sliceY = -depthM * OCEAN_SCALE
    const variable = scene.variable === 'current_speed' ? 'temperature' : scene.variable
    const timeIdx = Math.round((scene.time_index / 100) * 11)

    api.modelDepthSlice(variable, depthM, timeIdx)
      .then((data: any) => {
        if (!data?.values?.length) return
        const { lat: lats, lon: lons, values, vmin, vmax } = data
        const sL = Math.max(1, Math.floor(lats.length / 40))
        const sO = Math.max(1, Math.floor(lons.length / 60))
        const pos: number[] = []
        const cols: number[] = []
        const idx: number[] = []

        for (let i = 0; i < lats.length - sL; i += sL) {
          for (let j = 0; j < lons.length - sO; j += sO) {
            const val = values[i]?.[j]
            if (val == null || isNaN(val)) continue // Skip land / missing cells

            const norm = Math.max(0, Math.min(1, (val - vmin) / (vmax - vmin || 1)))
            const col = dColor(norm, variable, vmin, vmax)
            const x0 = ((lons[j] - LON_MIN) / (LON_MAX - LON_MIN)) * TERR_W - TERR_W / 2
            const x1 = ((lons[j + sO] - LON_MIN) / (LON_MAX - LON_MIN)) * TERR_W - TERR_W / 2
            const z0 = TERR_D / 2 - ((lats[i] - LAT_MIN) / (LAT_MAX - LAT_MIN)) * TERR_D
            const z1 = TERR_D / 2 - ((lats[i + sL] - LAT_MIN) / (LAT_MAX - LAT_MIN)) * TERR_D
            const base = pos.length / 3

            ;[[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z]) => {
              pos.push(x, sliceY, z)
              cols.push(col.r, col.g, col.b)
            })
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
          }
        }
        if (!pos.length) return
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
        geo.setIndex(idx)
        geo.computeVertexNormals()
        grp.add(
          new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: scene.opacity * 0.88,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          )
        )
      })
      .catch(console.error)
  }, [scene.show_model, scene.variable, scene.opacity, scene.time_index, depthM])

  // ── 4. Stratified Argo CTD Sensor Nodes & Depth Rings ───────────────────────
  useEffect(() => {
    const grp = floatGrpRef.current
    const activeRingsGrp = activeDepthRingsRef.current
    if (!grp || !activeRingsGrp) return
    grp.clear()
    activeRingsGrp.clear()
    floatDataRef.current = displayFloats
    if (!scene.show_argo || !displayFloats.length) return

    const src = displayFloats.slice(0, 800)
    floatDataRef.current = src

    // Surface Buoy Markers
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshPhongMaterial({ shininess: 110, transparent: true, opacity: Math.min(1, scene.opacity * 1.2) }),
      src.length
    )
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.name = 'argo-inst'

    const dummy = new THREE.Object3D()
    const tPos: number[] = []

    src.forEach((f, i) => {
      const p = wp(f.latitude, f.longitude, 0)
      p.y = 0.32
      dummy.position.copy(p)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // Color surface buoy based on variable
      const surfVal = scene.variable === 'salinity' ? (f.psal_surface ?? 35) : (f.temp_surface ?? 25)
      mesh.setColorAt(i, scene.variable === 'salinity' ? lerpColor(surfVal, SAL) : lerpColor(surfVal, TEMP))

      const maxD = Math.min(2000, f.pres_max ?? 1000)
      tPos.push(p.x, 0.32, p.z, p.x, -maxD * OCEAN_SCALE, p.z)

      // In-situ CTD depth sensor calibration nodes along profile cable
      const sensorDepths = [100, 250, 500, 1000, 1500, 2000].filter((d) => d <= maxD)
      sensorDepths.forEach((sd) => {
        const nodePos = wp(f.latitude, f.longitude, sd)
        const phys = computeOceanPhysicsAtDepth(f.latitude, f.longitude, sd)
        const nodeVal = scene.variable === 'salinity' ? phys.sal : scene.variable === 'current_speed' ? phys.speed : phys.temp
        const nodeCol = scene.variable === 'salinity' ? lerpColor(nodeVal, SAL) : scene.variable === 'current_speed' ? lerpColor(nodeVal, SPD) : lerpColor(nodeVal, TEMP)

        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 6, 6),
          new THREE.MeshBasicMaterial({ color: nodeCol, transparent: true, opacity: 0.85 })
        )
        bead.position.copy(nodePos)
        grp.add(bead)
      })

      // Active depth slice intersection indicator ring
      if (depthM > 0 && depthM <= maxD) {
        const ringPos = wp(f.latitude, f.longitude, depthM)
        const phys = computeOceanPhysicsAtDepth(f.latitude, f.longitude, depthM)
        const sliceVal = scene.variable === 'salinity' ? phys.sal : scene.variable === 'current_speed' ? phys.speed : phys.temp
        const ringCol = scene.variable === 'salinity' ? lerpColor(sliceVal, SAL) : scene.variable === 'current_speed' ? lerpColor(sliceVal, SPD) : lerpColor(sliceVal, TEMP)

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.18, 0.28, 12),
          new THREE.MeshBasicMaterial({ color: ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        )
        ring.position.copy(ringPos)
        ring.rotation.x = -Math.PI / 2
        activeRingsGrp.add(ring)
      }
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    grp.add(mesh)
    floatMeshRef.current = mesh

    const tGeo = new THREE.BufferGeometry()
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3))
    grp.add(new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35 })))
  }, [displayFloats, scene.show_argo, scene.variable, scene.opacity, depthM])

  // ── 5. Glider Mission Trajectory ───────────────────────────────────────────
  useEffect(() => {
    const grp = gliderGrpRef.current
    if (!grp) return
    grp.clear()
    if (!scene.show_glider) return

    api.gliderTrajectory('sea057_20220128')
      .then((data: any) => {
        if (!data?.waypoints?.length) return
        const pts = (data.waypoints as any[]).map((w: any) => wp(w.lat, w.lon, w.depth_m ?? 50))
        grp.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.92 })
          )
        )
        pts.filter((_, i) => i % 7 === 0).forEach((p) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0x34d399 }))
          m.position.copy(p)
          grp.add(m)
        })
      })
      .catch(console.error)
  }, [scene.show_glider])

  // ── 6. Current Velocity Vectors (Subsurface Ocean Flow Only) ────────────────
  useEffect(() => {
    const grp = arrowGrpRef.current
    if (!grp) return
    grp.clear()
    if (!scene.show_currents) return

    const tIdx = Math.round((scene.time_index / 100) * 11)

    Promise.all([api.modelDepthSlice('u_current', depthM, tIdx), api.modelDepthSlice('v_current', depthM, tIdx)])
      .then(([uF, vF]: any[]) => {
        if (!uF.values || !vF.values) return
        const { lat: lats, lon: lons } = uF
        const sL = Math.max(1, Math.floor(lats.length / 10))
        const sO = Math.max(1, Math.floor(lons.length / 14))

        for (let i = 0; i < lats.length; i += sL) {
          for (let j = 0; j < lons.length; j += sO) {
            const u = uF.values[i]?.[j]
            const v = vF.values[i]?.[j]
            if (u == null || v == null || isNaN(u) || isNaN(v)) continue // Skip land

            const spd = Math.sqrt(u * u + v * v)
            if (!isFinite(spd) || spd < 0.005) continue

            const col = lerpColor(spd, SPD)
            grp.add(
              new THREE.ArrowHelper(
                new THREE.Vector3(u, 0, -v).normalize(),
                wp(lats[i], lons[j], depthM),
                Math.min(1.8, spd * 4),
                col.getHex(),
                0.35,
                0.2
              )
            )
          }
        }
      })
      .catch(console.error)
  }, [scene.show_currents, scene.time_index, depthM])

  // ── 7. Selected Float Halo ─────────────────────────────────────────────────
  useEffect(() => {
    const grp = floatGrpRef.current
    if (!grp) return
    grp.children.filter((c) => c.name === 'sel-ring').forEach((c) => grp.remove(c))
    if (!selectedFloat) return

    const p = wp(selectedFloat.latitude, selectedFloat.longitude, 0)
    p.y = 0.35
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    )
    ring.position.copy(p)
    ring.rotation.x = -Math.PI / 2
    ring.name = 'sel-ring'
    grp.add(ring)
  }, [selectedFloat])

  // ── 8. Interactive Depth Probe & Raycasting ────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (walkModeRef.current) return
    const mount = mountRef.current
    const cam = cameraRef.current
    if (!mount || !cam) return

    const rect = mount.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    rayRef.current.setFromCamera(ndc, cam)

    const terr = terrainMshRef.current
    if (terr) {
      const hits = rayRef.current.intersectObject(terr)
      if (hits.length > 0) {
        const pt = hits[0].point
        const ll = xzll(pt.x, pt.z)
        const isLand = pt.y > 0.04
        const curDepthM = isLand ? 0 : Math.max(0, -pt.y / OCEAN_SCALE)
        const targetD = depthM > 0 ? depthM : curDepthM
        const physics = computeOceanPhysicsAtDepth(ll.lat, ll.lon, targetD, Math.round((scene.time_index / 100) * 11))

        setProbe({
          ...ll,
          depth_m: targetD,
          isLand,
          elev: isLand ? Math.round(pt.y / LAND_SCALE) : undefined,
          screenX: e.clientX,
          screenY: e.clientY,
          physics,
        })
        return
      }
    }
    setProbe(null)
  }, [depthM, scene.time_index])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (walkModeRef.current) return
      const mount = mountRef.current
      const cam = cameraRef.current
      if (!mount || !cam || !floatMeshRef.current) return

      const rect = mount.getBoundingClientRect()
      rayRef.current.setFromCamera(
        new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        cam
      )
      const hits = rayRef.current.intersectObject(floatMeshRef.current)
      if (hits.length > 0) {
        const idx = hits[0].instanceId ?? -1
        if (idx >= 0 && idx < floatDataRef.current.length) {
          const f = floatDataRef.current[idx]
          onFloatSelect({
            platform_number: f.platform_number,
            cycle_number: f.cycle_number,
            latitude: f.latitude,
            longitude: f.longitude,
            time: f.time,
          })
        }
      }
    },
    [onFloatSelect]
  )

  const flyTo = useCallback(
    (pos: THREE.Vector3, tgt = new THREE.Vector3(0, 0, 0)) => {
      const cam = cameraRef.current
      const ctrl = controlsRef.current
      if (!cam || !ctrl) return
      if (walkMode) {
        setWalkMode(false)
        walkModeRef.current = false
        ctrl.enabled = true
      }
      const sp = cam.position.clone()
      const st = ctrl.target.clone()
      let t = 0
      const step = () => {
        t += 0.04
        const e = 0.5 - Math.cos(Math.min(1, t) * Math.PI) / 2
        cam.position.lerpVectors(sp, pos, e)
        ctrl.target.lerpVectors(st, tgt, e)
        ctrl.update()
        if (t < 1) requestAnimationFrame(step)
      }
      step()
    },
    [walkMode]
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#060c18' }}>
      <div
        ref={mountRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setProbe(null)}
        style={{ width: '100%', height: '100%', cursor: walkMode ? 'crosshair' : 'default' }}
      />

      {/* Walk mode reticle */}
      {walkMode && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 30 }}>
          <div style={{ width: 20, height: 2, background: 'rgba(255,255,255,0.85)', marginBottom: -2 }} />
          <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.85)', marginLeft: 9 }} />
        </div>
      )}

      {/* Walk mode HUD */}
      {walkMode && walkPos && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: 16,
            transform: 'translateY(-50%)',
            zIndex: 30,
            background: 'rgba(6,12,26,0.95)',
            border: '1px solid rgba(0,255,120,0.45)',
            borderRadius: 10,
            padding: '14px 18px',
            backdropFilter: 'blur(10px)',
            minWidth: 230,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ color: '#00ff88', fontSize: 10, fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
            DIVE / WALK TELEMETRY — ESC to exit
          </div>
          {[
            { k: 'LAT / LON', v: `${walkPos.lat.toFixed(3)}°N  ${walkPos.lon.toFixed(3)}°E` },
            { k: 'DEPTH', v: walkPos.depth_m < 1 ? 'Surface (0m)' : `${Math.round(walkPos.depth_m)} m` },
            { k: 'ZONE', v: walkPos.physics.zone.split(' ')[0] },
            { k: 'TEMP', v: `${walkPos.physics.temp} °C` },
            { k: 'SALINITY', v: `${walkPos.physics.sal} PSU` },
            { k: 'CURRENT', v: `${walkPos.physics.speed} m/s @ ${walkPos.physics.dir}°` },
            { k: 'DENSITY', v: `${walkPos.physics.density} kg/m³` },
            { k: 'SOUND SPD', v: `${walkPos.physics.soundSpeed} m/s` },
            { k: 'DISSOLVED O₂', v: `${walkPos.physics.oxygen} µmol/kg` },
          ].map(({ k, v }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10 }}>
              <span style={{ color: '#8ba7bb', fontFamily: 'monospace' }}>{k}:</span>
              <span style={{ color: '#00ffff', fontFamily: 'monospace', fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Interactive Multi-Factor Depth Telemetry Probe HUD */}
      {probe && !walkMode && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(probe.screenX + 16, window.innerWidth - 280),
            top: Math.max(10, Math.min(probe.screenY - 10, window.innerHeight - 300)),
            zIndex: 40,
            pointerEvents: 'none',
            background: 'rgba(4, 10, 24, 0.96)',
            border: '1px solid rgba(0, 212, 255, 0.45)',
            borderRadius: 8,
            padding: '10px 14px',
            backdropFilter: 'blur(10px)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            minWidth: 240,
            boxShadow: '0 6px 25px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ color: '#00e5ff', fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>📍 {probe.lat.toFixed(3)}°N  {probe.lon.toFixed(3)}°E</span>
            <span style={{ color: probe.isLand ? '#a3c98a' : '#38bdf8', fontSize: 10 }}>
              {probe.isLand ? 'LAND' : 'OCEAN'}
            </span>
          </div>

          {probe.isLand ? (
            <div style={{ color: '#a3c98a', marginTop: 4 }}>
              🏔️ Land Topography: {probe.elev != null ? `+${probe.elev} m elevation` : 'Coastline'}
              <div style={{ fontSize: 9.5, color: '#8ba7bb', marginTop: 3 }}>
                (Zero water encroachment on land terrain)
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
              <div style={{ color: '#38bdf8', fontWeight: 600, borderBottom: '1px solid rgba(0,212,255,0.2)', paddingBottom: 2 }}>
                🌊 Depth: {probe.depth_m < 1 ? 'Surface (0 m)' : `${Math.round(probe.depth_m)} m`} · <span style={{ fontSize: 9.5, color: '#8ba7bb' }}>{probe.physics.zone.split(' ')[0]}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🌡️ Temperature:</span>
                <span style={{ color: scene.variable === 'temperature' ? '#00ffff' : '#e0f4ff', fontWeight: 700 }}>
                  {probe.physics.temp} °C
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🧂 Salinity:</span>
                <span style={{ color: scene.variable === 'salinity' ? '#00ffff' : '#e0f4ff', fontWeight: 700 }}>
                  {probe.physics.sal} PSU
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>💨 Current Velocity:</span>
                <span style={{ color: scene.variable === 'current_speed' ? '#00ffff' : '#e0f4ff', fontWeight: 700 }}>
                  {probe.physics.speed} m/s @ {probe.physics.dir}°
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>⚖️ Seawater Density:</span>
                <span style={{ color: '#e0f4ff' }}>{probe.physics.density} kg/m³</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🔊 Sound Speed:</span>
                <span style={{ color: '#e0f4ff' }}>{probe.physics.soundSpeed} m/s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🫁 Dissolved O₂:</span>
                <span style={{ color: probe.physics.oxygen < 50 ? '#ffb74d' : '#e0f4ff' }}>
                  {probe.physics.oxygen} µmol/kg {probe.physics.oxygen < 50 ? '(OMZ)' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>⏱️ Hydrostatic Press:</span>
                <span style={{ color: '#e0f4ff' }}>{probe.physics.pressure} dbar</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick View Navigation Presets */}
      <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 5, zIndex: 20, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {[
          { id: 'birds-eye', lbl: "Bird's Eye", px: 0, py: 80, pz: 0.001, tx: 0, ty: 0, tz: 0 },
          { id: 'india', lbl: 'India Coast', px: 18, py: 22, pz: 8, tx: 14, ty: 0, tz: 5 },
          { id: 'arabian', lbl: 'Arabian Sea', px: -20, py: 18, pz: 5, tx: -15, ty: 0, tz: -5 },
          { id: 'bengal', lbl: 'Bay of Bengal', px: 32, py: 18, pz: 5, tx: 28, ty: 0, tz: -5 },
          { id: 'dive', lbl: 'Underwater Dive', px: 0, py: -3.5, pz: 12, tx: 0, ty: -2, tz: 0 },
          { id: 'chennai', lbl: 'Chennai Shelf', px: 22, py: 2, pz: 18, tx: 22, ty: 0, tz: 18 },
        ].map((v) => (
          <button
            key={v.id}
            id={`view-${v.id}`}
            onClick={() => flyTo(new THREE.Vector3(v.px, v.py, v.pz), new THREE.Vector3(v.tx, v.ty, v.tz))}
            style={{
              padding: '6px 10px',
              background: 'rgba(6,12,26,0.92)',
              border: '1px solid rgba(0,212,255,0.32)',
              borderRadius: 6,
              color: '#cde8f5',
              fontSize: 10,
              fontFamily: 'Inter,sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            {v.lbl}
          </button>
        ))}
        <button
          onClick={() => {
            const n = !walkMode
            setWalkMode(n)
            walkModeRef.current = n
            if (controlsRef.current) controlsRef.current.enabled = !n
            if (n && cameraRef.current) cameraRef.current.position.set(8, 0.6, 15)
          }}
          style={{
            padding: '6px 12px',
            background: walkMode ? 'rgba(0,255,120,0.18)' : 'rgba(6,12,26,0.92)',
            border: `1px solid ${walkMode ? 'rgba(0,255,120,0.6)' : 'rgba(255,255,255,0.18)'}`,
            borderRadius: 6,
            color: walkMode ? '#00ff88' : '#8ba7bb',
            fontSize: 10,
            fontFamily: 'Inter,sans-serif',
            fontWeight: 700,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          {walkMode ? 'EXIT DIVE' : 'DIVE MODE'}
        </button>
      </div>

      {/* Top-Left Status HUD */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
        {[
          { k: 'VIEW', v: '3D Ocean Terrain & Multi-Depth Twin', hi: true },
          { k: 'REGION', v: `${region.lat_min}–${region.lat_max}°N  ${region.lon_min}–${region.lon_max}°E` },
          { k: 'BUOYS', v: `${Math.min(displayFloats.length, 800).toLocaleString()} Argo CTD Platforms` },
          { k: 'DEPTH', v: depthM === 0 ? 'Surface (0 m)' : `${depthM} m depth slice` },
        ].map(({ k, v, hi }) => (
          <div
            key={k}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 4,
              backdropFilter: 'blur(6px)',
              background: hi ? 'rgba(0,212,255,0.15)' : 'rgba(6,12,26,0.85)',
              border: `1px solid ${hi ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
            }}
          >
            <span style={{ color: '#8ba7bb' }}>{k}:</span>
            <span style={{ color: hi ? '#00d4ff' : '#dceeff', fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Depth Slicer Controller */}
      {scene.show_model && (
        <div
          style={{
            position: 'absolute',
            bottom: 54,
            left: 14,
            zIndex: 20,
            background: 'rgba(6,12,26,0.93)',
            border: '1px solid rgba(0,212,255,0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            backdropFilter: 'blur(10px)',
            minWidth: 260,
          }}
        >
          <div style={{ color: '#00d4ff', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>DEPTH SLICE</span>
            <span>{depthM === 0 ? '0 m (SURFACE)' : `${depthM} m DEPTH`}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#8ba7bb', fontSize: 9, fontFamily: 'monospace', width: 45 }}>0 m</span>
            <input
              id="cube-depth-slider"
              type="range"
              min={0}
              max={100}
              value={slicePct}
              onChange={(e) => setSlicePct(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#00d4ff', cursor: 'pointer' }}
            />
            <span style={{ color: '#8ba7bb', fontSize: 9, fontFamily: 'monospace', width: 55, textAlign: 'right' }}>2000 m</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 185,
          right: 14,
          zIndex: 20,
          background: 'rgba(6,12,26,0.9)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '10px 14px',
          backdropFilter: 'blur(8px)',
          minWidth: 180,
        }}
      >
        <div style={{ color: '#8ba7bb', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, marginBottom: 6 }}>SCIENTIFIC LEGEND</div>
        {[
          { c: '#38bdf8', l: 'Argo CTD Nodes' },
          { c: '#34d399', l: 'Glider Track' },
          { c: '#ffff00', l: 'Selected Float' },
          { c: '#00ffff', l: 'Velocity Vector' },
          { c: '#6aaa4a', l: 'Land Topography' },
          { c: '#1a7090', l: 'Ocean Floor' },
        ].map(({ c, l }) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0 }} />
            <span style={{ color: '#c8dce8', fontSize: 10, fontFamily: 'monospace' }}>{l}</span>
          </div>
        ))}
        <div style={{ marginTop: 7 }}>
          <div style={{ color: '#8ba7bb', fontSize: 9, fontFamily: 'monospace', marginBottom: 3 }}>
            {scene.variable === 'salinity' ? 'SALINITY (PSU)' : scene.variable === 'current_speed' ? 'SPEED (m/s)' : 'TEMPERATURE (°C)'}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background:
                scene.variable === 'salinity'
                  ? 'linear-gradient(to right,#4a0e8f,#1565c0,#0288d1,#26a69a,#f9a825)'
                  : scene.variable === 'current_speed'
                  ? 'linear-gradient(to right,#000033,#003087,#0088bb,#00dd88,#ffff00)'
                  : 'linear-gradient(to right,#2c1654,#1a237e,#0288d1,#00897b,#cddc39,#c62828)',
            }}
          />
        </div>
      </div>

      <Minimap region={region} onRegionSelect={onRegionSelect} />
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          zIndex: 10,
          fontSize: 10,
          color: 'rgba(139,167,187,0.78)',
          fontFamily: 'Inter,sans-serif',
          background: 'rgba(6,12,26,0.82)',
          padding: '4px 18px',
          borderRadius: 6,
          backdropFilter: 'blur(4px)',
          whiteSpace: 'nowrap',
        }}
      >
        Left-drag: rotate | Right-drag: pan | Scroll: zoom | Hover: depth multi-factor telemetry
      </div>
    </div>
  )
}
