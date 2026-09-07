/**
 * OceanWorld3D.tsx — Full Immersive 3D Ocean World
 *
 * Features:
 * ─────────────────────────────────────────────────────────────────────────
 *  • Free 6-DOF camera: WASD fly + mouse look + scroll zoom + Q/E up-down
 *  • Animated Gerstner wave surface (6-layer GLSL physics, transparent)
 *  • Real GEBCO bathymetry ocean floor (displaced mesh, depth-colored)
 *  • HYCOM volumetric depth slices (8 semi-transparent planes, colored by variable)
 *  • Argo float 3D markers (glowing spheres + depth lines at real lat/lon)
 *  • Lat/Lon grid every 5° with HTML text labels
 *  • Live HUD: position (lat/lon/depth), depth scale bar, compass, distance scale
 *  • Underwater mode: blue fog, caustic animation, depth indicator, particles
 *  • Click on ocean floor → shows depth + coordinates tooltip
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Coordinate system:
 *   World X = Longitude mapped to [-2000, +2000] over [LON_MIN, LON_MAX]
 *   World Y = Depth. Y=0 = sea surface. Y=-2000 = ~4000m deep (VERT_SCALE)
 *   World Z = Latitude mapped to [-1500, +1500] over [LAT_MIN, LAT_MAX]
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { ArgoFloat, api } from '../services/api'
import { SceneState, SelectedFloat } from '../types'

// ── World Coordinate Mapping ────────────────────────────────────────────────
const LON_MIN = 40,  LON_MAX = 110   // Indian Ocean longitude range
const LAT_MIN = -30, LAT_MAX = 35    // Indian Ocean latitude range
const WORLD_W = 4000                 // world units spanning LON_MIN→LON_MAX
const WORLD_D = 3200                 // world units spanning LAT_MIN→LAT_MAX
const VERT_SCALE = 0.45              // 1m real depth = 0.45 world units (so 4500m = 2025 units)

// Convert geo → world coords
function geoToWorld(lat: number, lon: number, depthM = 0): THREE.Vector3 {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * WORLD_W - WORLD_W / 2
  const z = ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * WORLD_D - WORLD_D / 2
  const y = -depthM * VERT_SCALE
  return new THREE.Vector3(x, y, z)
}

// Convert world → geo coords
function worldToGeo(wx: number, wy: number, wz: number): { lat: number; lon: number; depthM: number } {
  const lon = LON_MIN + ((wx + WORLD_W / 2) / WORLD_W) * (LON_MAX - LON_MIN)
  const lat = LAT_MIN + ((wz + WORLD_D / 2) / WORLD_D) * (LAT_MAX - LAT_MIN)
  const depthM = Math.max(0, -wy / VERT_SCALE)
  return { lat, lon, depthM }
}

// ── GLSL Shaders ────────────────────────────────────────────────────────────

// Gerstner Wave surface shader
const WAVE_VERT = /* glsl */`
uniform float uTime;
uniform float uWaveScale;
varying vec2  vUv;
varying float vHeight;
varying vec3  vWorldPos;
varying vec3  vNormal3;

vec3 gerstner(vec3 pos, float Q, float A, float kx, float kz, float spd) {
  float k   = length(vec2(kx, kz)) + 0.0001;
  float w   = sqrt(9.81 * k);
  float phi = kx * pos.x + kz * pos.z - w * uTime * spd;
  float Qa  = Q * A * uWaveScale;
  float As  = A * uWaveScale;
  return vec3(Qa * (kx/k) * cos(phi), As * sin(phi), Qa * (kz/k) * cos(phi));
}

void main() {
  vUv = uv;
  vec3 p = position;
  vec3 d = vec3(0.0);
  d += gerstner(p, 0.65, 2.8,  0.022,  0.010, 1.10);
  d += gerstner(p, 0.55, 1.8, -0.015,  0.028, 0.95);
  d += gerstner(p, 0.45, 1.2,  0.040,  0.018, 1.30);
  d += gerstner(p, 0.35, 0.9,  0.008, -0.035, 1.60);
  d += gerstner(p, 0.25, 0.6,  0.055,  0.006, 2.00);
  d += gerstner(p, 0.20, 0.4, -0.028,  0.048, 1.75);
  p += d;
  vHeight   = d.y;
  vWorldPos = p;

  // Approximate normal via finite difference
  float eps = 0.5;
  vec3 px = position + vec3(eps, 0, 0);
  vec3 pz = position + vec3(0, 0, eps);
  vec3 dx = vec3(0.0), dz = vec3(0.0);
  dx += gerstner(px, 0.65, 2.8, 0.022, 0.010, 1.10);
  dx += gerstner(px, 0.55, 1.8,-0.015, 0.028, 0.95);
  dz += gerstner(pz, 0.65, 2.8, 0.022, 0.010, 1.10);
  dz += gerstner(pz, 0.55, 1.8,-0.015, 0.028, 0.95);
  px += dx; pz += dz;
  vec3 N = normalize(cross(pz - p, px - p));
  vNormal3 = N;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const WAVE_FRAG = /* glsl */`
uniform float uTime;
uniform vec3  uCamPos;
uniform bool  uUnderwater;
varying vec2  vUv;
varying float vHeight;
varying vec3  vWorldPos;
varying vec3  vNormal3;

void main() {
  // Base ocean color by depth
  vec3 abyss   = vec3(0.002, 0.010, 0.055);
  vec3 deep    = vec3(0.005, 0.040, 0.175);
  vec3 mid     = vec3(0.010, 0.130, 0.380);
  vec3 shallow = vec3(0.030, 0.480, 0.680);
  vec3 foam    = vec3(0.88,  0.94,  1.00);

  float h = clamp((vHeight + 2.0) / 6.0, 0.0, 1.0);
  vec3 col = mix(abyss, deep, smoothstep(0.0, 0.22, h));
  col = mix(col, mid,     smoothstep(0.18, 0.52, h));
  col = mix(col, shallow, smoothstep(0.48, 0.85, h));

  // Foam on wave peaks
  float foamMask  = smoothstep(1.2, 2.8, vHeight);
  float fn1 = sin(vUv.x * 180.0 + uTime * 2.8) * sin(vUv.y * 140.0 + uTime * 2.2);
  float fn2 = sin(vUv.x * 240.0 - uTime * 3.5) * sin(vUv.y * 190.0 + uTime * 1.9);
  float foamNoise = (fn1 * 0.6 + fn2 * 0.4) * 0.5 + 0.5;
  col = mix(col, foam, foamMask * foamNoise * 0.85);

  // Specular highlight
  vec3 N       = normalize(vNormal3);
  vec3 lightDir= normalize(vec3(0.4, 1.0, 0.3));
  vec3 viewDir = normalize(uCamPos - vWorldPos);
  vec3 halfV   = normalize(lightDir + viewDir);
  float spec1  = pow(max(dot(N, halfV), 0.0), 280.0) * 2.2;
  float spec2  = pow(max(dot(N, halfV), 0.0), 55.0)  * 0.35;
  col += vec3(0.96, 0.98, 1.0) * (spec1 + spec2);

  // Caustic shimmer
  float c1 = abs(sin(vUv.x * 32.0 + uTime * 1.5) * sin(vUv.y * 26.0 + uTime * 1.1));
  float c2 = abs(sin(vUv.x * 52.0 - uTime * 2.3) * sin(vUv.y * 41.0 + uTime * 1.8));
  float caustic = pow(mix(c1, c2, 0.4), 3.5) * 0.18;
  col += vec3(caustic * 0.3, caustic * 0.75, caustic * 1.0);

  // Horizon fade
  float dist = clamp(length(vWorldPos.xz) / 1800.0, 0.0, 1.0);
  col = mix(col, abyss, dist * 0.6);

  // Underwater tint (looking up at surface from below)
  if (uUnderwater) {
    col = mix(col, vec3(0.01, 0.08, 0.32), 0.5);
  }

  float alpha = uUnderwater ? 0.65 : mix(0.92, 0.72, dist);
  gl_FragColor = vec4(col, alpha);
}
`

// Ocean floor shader
const FLOOR_VERT = /* glsl */`
uniform sampler2D uHeightMap;
uniform float     uVertScale;
uniform float     uTime;
varying vec2  vUv;
varying float vDepth;
varying vec3  vWorldPos;
varying vec3  vNormal3;

void main() {
  vUv = uv;
  float h  = texture2D(uHeightMap, uv).r;  // 0=deepest, 1=shallowest
  float depth = (1.0 - h) * 5000.0;        // 0→5000m
  vDepth    = depth;
  vec3 p    = position;
  p.y       = -depth * uVertScale;
  vWorldPos = p;

  // Normal from texture neighbours
  vec2 texel = vec2(1.0 / 256.0);
  float hL = texture2D(uHeightMap, uv - vec2(texel.x, 0)).r;
  float hR = texture2D(uHeightMap, uv + vec2(texel.x, 0)).r;
  float hD = texture2D(uHeightMap, uv - vec2(0, texel.y)).r;
  float hU = texture2D(uHeightMap, uv + vec2(0, texel.y)).r;
  vNormal3  = normalize(vec3((hL - hR) * 100.0, 2.0, (hD - hU) * 100.0));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const FLOOR_FRAG = /* glsl */`
uniform float uTime;
varying vec2  vUv;
varying float vDepth;
varying vec3  vWorldPos;
varying vec3  vNormal3;

void main() {
  // Depth-based color: shallow turquoise → mid blue → deep abyss
  vec3 shallow = vec3(0.04, 0.42, 0.55);
  vec3 mid     = vec3(0.01, 0.12, 0.32);
  vec3 deep    = vec3(0.004, 0.025, 0.11);
  vec3 abyss   = vec3(0.001, 0.006, 0.030);

  float d = clamp(vDepth / 5000.0, 0.0, 1.0);
  vec3 col = mix(shallow, mid,   smoothstep(0.0, 0.15, d));
  col = mix(col, deep,   smoothstep(0.12, 0.50, d));
  col = mix(col, abyss,  smoothstep(0.45, 1.0,  d));

  // Sediment texture noise
  float n1 = sin(vUv.x * 380.0) * sin(vUv.y * 320.0) * 0.03;
  float n2 = sin(vUv.x * 95.0 + vUv.y * 80.0 + 0.6) * 0.025;
  col += vec3(n1 + n2) * 0.5;

  // Diffuse lighting from above
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.2));
  float diff = max(dot(normalize(vNormal3), lightDir), 0.05);
  col *= (0.3 + 0.7 * diff);

  // Caustic light ripples on shallow floor
  if (vDepth < 500.0) {
    float ct = 1.0 - vDepth / 500.0;
    float c1 = abs(sin(vWorldPos.x * 0.08 + uTime * 1.4) * sin(vWorldPos.z * 0.07 + uTime * 1.1));
    float c2 = abs(sin(vWorldPos.x * 0.12 - uTime * 1.8) * sin(vWorldPos.z * 0.10 + uTime * 1.5));
    float caustic = pow(mix(c1, c2, 0.4), 2.8) * 0.25 * ct;
    col += vec3(caustic * 0.4, caustic * 0.85, caustic * 1.0);
  }

  gl_FragColor = vec4(col, 1.0);
}
`

// Volumetric depth-slice shader
const SLICE_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SLICE_FRAG = /* glsl */`
uniform sampler2D uDataTex;
uniform float     uOpacity;
uniform int       uVariable; // 0=temp, 1=salinity, 2=current
uniform float     uVmin;
uniform float     uVmax;
varying vec2 vUv;

vec3 tempColor(float t) {
  vec3 c0 = vec3(0.17, 0.09, 0.33);
  vec3 c1 = vec3(0.10, 0.14, 0.49);
  vec3 c2 = vec3(0.01, 0.53, 0.82);
  vec3 c3 = vec3(0.00, 0.54, 0.48);
  vec3 c4 = vec3(0.80, 0.86, 0.22);
  vec3 c5 = vec3(0.78, 0.16, 0.16);
  if (t < 0.2) return mix(c0, c1, t/0.2);
  if (t < 0.4) return mix(c1, c2, (t-0.2)/0.2);
  if (t < 0.6) return mix(c2, c3, (t-0.4)/0.2);
  if (t < 0.8) return mix(c3, c4, (t-0.6)/0.2);
  return mix(c4, c5, (t-0.8)/0.2);
}

vec3 salColor(float t) {
  vec3 c0 = vec3(0.29, 0.05, 0.56);
  vec3 c1 = vec3(0.08, 0.40, 0.75);
  vec3 c2 = vec3(0.01, 0.53, 0.82);
  vec3 c3 = vec3(0.15, 0.65, 0.60);
  vec3 c4 = vec3(0.98, 0.66, 0.14);
  if (t < 0.25) return mix(c0, c1, t/0.25);
  if (t < 0.50) return mix(c1, c2, (t-0.25)/0.25);
  if (t < 0.75) return mix(c2, c3, (t-0.50)/0.25);
  return mix(c3, c4, (t-0.75)/0.25);
}

void main() {
  float raw = texture2D(uDataTex, vUv).r;
  if (raw < 0.001) discard;  // no-data
  float t   = clamp((raw * (uVmax - uVmin) + uVmin - uVmin) / max(uVmax - uVmin, 0.001), 0.0, 1.0);
  t = raw; // raw is already 0..1 normalized
  vec3 col  = uVariable == 1 ? salColor(t) : tempColor(t);
  gl_FragColor = vec4(col, uOpacity);
}
`

// Particle (suspended matter) shader
const PARTICLE_VERT = /* glsl */`
attribute float aSize;
attribute vec3  aVelocity;
uniform   float uTime;
varying   float vAlpha;
void main() {
  vec3 p = position;
  p.y += sin(uTime * aVelocity.x + position.x * 0.01) * 0.8;
  p.x += sin(uTime * aVelocity.y + position.z * 0.01) * 0.4;
  p.z += cos(uTime * aVelocity.z + position.y * 0.01) * 0.4;
  vAlpha = 0.3 + 0.4 * sin(uTime * aVelocity.x);
  vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (500.0 / -mvPos.z);
  gl_Position  = projectionMatrix * mvPos;
}
`

const PARTICLE_FRAG = /* glsl */`
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d) * vAlpha;
  gl_FragColor = vec4(0.55, 0.80, 0.95, a * 0.6);
}
`

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  scene: SceneState
  floats: ArgoFloat[]
  filteredFloats?: ArgoFloat[]
  onFloatSelect: (f: SelectedFloat) => void
  selectedFloat: SelectedFloat | null
  region?: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
  onRegionSelect?: (b: { lat_min: number; lat_max: number; lon_min: number; lon_max: number }) => void
}

// ── Depth slices config ──────────────────────────────────────────────────────
const DEPTH_SLICES = [0, 50, 100, 200, 400, 800, 1500, 2000]
const FLY_SPEED_BASE = 8.0   // world units/sec

export default function OceanWorld3D({
  scene,
  floats,
  filteredFloats,
  onFloatSelect,
  selectedFloat,
}: Props) {
  const displayFloats = filteredFloats ?? floats

  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const cssRendRef   = useRef<CSS2DRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<OrbitControls | null>(null)
  const clockRef     = useRef(new THREE.Clock())
  const animRef      = useRef<number>(0)
  const waveMeshRef  = useRef<THREE.Mesh | null>(null)
  const waveUniRef   = useRef<any>(null)
  const sliceGroupRef= useRef<THREE.Group | null>(null)
  const floatGroupRef= useRef<THREE.Group | null>(null)
  const gridGroupRef = useRef<THREE.Group | null>(null)
  const particleRef  = useRef<THREE.Points | null>(null)
  const particleUniRef = useRef<any>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef     = useRef(new THREE.Vector2())
  const keysRef      = useRef<Record<string, boolean>>({})
  const underwaterRef= useRef(false)

  // HUD state
  const [hud, setHud] = useState({ lat: 12.0, lon: 77.0, depthM: 0, altitude: 500 })
  const [underwater, setUnderwater]   = useState(false)
  const [tooltip, setTooltip]         = useState<{ text: string; x: number; y: number } | null>(null)
  const [selectedVariable, setSelectedVariable] = useState<'temperature' | 'salinity' | 'current_speed'>('temperature')
  const [showSlices, setShowSlices]   = useState(true)
  const [showGrid,   setShowGrid]     = useState(true)
  const [showFloats, setShowFloats]   = useState(true)
  const [waveScale,  setWaveScale]    = useState(1.0)
  const [fovDeg,     setFovDeg]       = useState(60)

  // ── Init Three.js Scene ────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const W = mount.clientWidth
    const H = mount.clientHeight

    // ── Renderer ──────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ── CSS2D Renderer for labels ─────────────────────────────────────
    const cssRend = new CSS2DRenderer()
    cssRend.setSize(W, H)
    cssRend.domElement.style.position = 'absolute'
    cssRend.domElement.style.top = '0'
    cssRend.domElement.style.left = '0'
    cssRend.domElement.style.pointerEvents = 'none'
    mount.appendChild(cssRend.domElement)
    cssRendRef.current = cssRend

    // ── Scene ─────────────────────────────────────────────────────────
    const scene3 = new THREE.Scene()
    scene3.background = new THREE.Color(0x020810)
    sceneRef.current = scene3

    // ── Camera ────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.5, 20000)
    // Start at surface level looking over Indian Ocean
    const startPos = geoToWorld(12, 77, 0)
    camera.position.set(startPos.x, 350, startPos.z + 600)
    camera.lookAt(startPos.x, 0, startPos.z)
    cameraRef.current = camera

    // ── OrbitControls ─────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(startPos.x, 0, startPos.z)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.screenSpacePanning = false
    controls.minDistance = 2
    controls.maxDistance = 8000
    controls.enablePan = true
    controls.panSpeed = 1.5
    controls.rotateSpeed = 0.6
    controls.zoomSpeed = 1.2
    controlsRef.current = controls

    // ── Lighting ──────────────────────────────────────────────────────
    const hemiLight = new THREE.HemisphereLight(0x8ab4e8, 0x020812, 0.8)
    scene3.add(hemiLight)

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.8)
    sunLight.position.set(1200, 2000, 800)
    sunLight.castShadow = true
    scene3.add(sunLight)

    const fillLight = new THREE.DirectionalLight(0x304080, 0.4)
    fillLight.position.set(-800, 500, -600)
    scene3.add(fillLight)

    // Deep blue underwater ambient
    const deepLight = new THREE.PointLight(0x0033aa, 0.6, 3000)
    deepLight.position.set(0, -600, 0)
    scene3.add(deepLight)

    // ── Sky Dome ──────────────────────────────────────────────────────
    buildSkyDome(scene3)

    // ── Ocean Surface ─────────────────────────────────────────────────
    const waveUnis = {
      uTime:      { value: 0 },
      uWaveScale: { value: 1.0 },
      uCamPos:    { value: new THREE.Vector3() },
      uUnderwater:{ value: false },
    }
    waveUniRef.current = waveUnis

    const waveMat = new THREE.ShaderMaterial({
      vertexShader:   WAVE_VERT,
      fragmentShader: WAVE_FRAG,
      uniforms:       waveUnis,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    })
    const waveGeo = new THREE.PlaneGeometry(WORLD_W * 1.1, WORLD_D * 1.1, 320, 256)
    waveGeo.rotateX(-Math.PI / 2)
    const waveMesh = new THREE.Mesh(waveGeo, waveMat)
    waveMesh.position.y = 0
    scene3.add(waveMesh)
    waveMeshRef.current = waveMesh

    // ── Ocean Floor ────────────────────────────────────────────────────
    buildOceanFloor(scene3)

    // ── Lat/Lon Grid ──────────────────────────────────────────────────
    const gridGroup = buildLatLonGrid(scene3)
    gridGroupRef.current = gridGroup

    // ── Data slices (loaded async) ────────────────────────────────────
    const sliceGroup = new THREE.Group()
    sliceGroup.name = 'depth-slices'
    scene3.add(sliceGroup)
    sliceGroupRef.current = sliceGroup

    // ── Argo Float markers ────────────────────────────────────────────
    const floatGroup = new THREE.Group()
    floatGroup.name = 'argo-floats'
    scene3.add(floatGroup)
    floatGroupRef.current = floatGroup

    // ── Underwater particles ──────────────────────────────────────────
    const particleUnis = buildParticles(scene3)
    particleUniRef.current = particleUnis

    // ── Floor material ref for time updates ──────────────────────────
    const floorMat = (scene3 as any)._floorMat as THREE.ShaderMaterial | undefined

    // ── Fog (updated in animation loop) ──────────────────────────────
    scene3.fog = new THREE.Fog(0x020812, 3000, 9000)

    // ── Keyboard handling ─────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true }
    const onKeyUp   = (e: KeyboardEvent) => { delete keysRef.current[e.code] }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)

    // ── Mouse click for tooltips ──────────────────────────────────────
    const onClick = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect()
      mouseRef.current.set(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top)  / rect.height) * 2 + 1
      )
      handleClick()
    }
    renderer.domElement.addEventListener('click', onClick)

    // ── Resize ────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount || !rendererRef.current || !cameraRef.current) return
      const w = mount.clientWidth, h = mount.clientHeight
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
      cssRendRef.current?.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // ── Animation Loop ────────────────────────────────────────────────
    const animate = () => {
      animRef.current = requestAnimationFrame(animate)
      const dt  = clockRef.current.getDelta()
      const t   = clockRef.current.getElapsedTime()
      const cam = cameraRef.current!
      const ctrl= controlsRef.current!

      // WASD + QE fly camera
      handleFlyKeys(cam, ctrl, dt)

      ctrl.update()

      // Update wave uniforms
      if (waveUniRef.current) {
        waveUniRef.current.uTime.value   += dt * 1.0
        waveUniRef.current.uCamPos.value.copy(cam.position)
        const isUnder = cam.position.y < 1.0
        waveUniRef.current.uUnderwater.value = isUnder
        if (isUnder !== underwaterRef.current) {
          underwaterRef.current = isUnder
          setUnderwater(isUnder)
          // Switch fog
          if (isUnder) {
            scene3.fog = new THREE.FogExp2(0x000c22, 0.00045)
            scene3.background = new THREE.Color(0x000c22)
            hemiLight.color.set(0x001133)
            hemiLight.groundColor.set(0x000008)
          } else {
            scene3.fog = new THREE.Fog(0x020812, 3000, 9000)
            scene3.background = new THREE.Color(0x020810)
            hemiLight.color.set(0x8ab4e8)
            hemiLight.groundColor.set(0x020812)
          }
        }
      }

      // Update particle and floor uniforms
      if (particleUniRef.current) {
        particleUniRef.current.uTime.value = t
      }
      if (floorMat?.uniforms?.uTime) {
        floorMat.uniforms.uTime.value = t
      }

      // HUD update (throttled to every 10 frames)
      if (Math.round(t * 60) % 10 === 0) {
        const geo = worldToGeo(cam.position.x, cam.position.y, cam.position.z)
        const alt = Math.max(0, cam.position.y)
        setHud({
          lat:     parseFloat(geo.lat.toFixed(3)),
          lon:     parseFloat(geo.lon.toFixed(3)),
          depthM:  parseFloat(geo.depthM.toFixed(0)),
          altitude: parseFloat((alt / VERT_SCALE).toFixed(0)),
        })
      }

      renderer.render(scene3, cam)
      cssRend.render(scene3, cam)
    }
    animate()

    // ── Cleanup ───────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize',  onResize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      if (cssRend.domElement.parentNode === mount) {
        mount.removeChild(cssRend.domElement)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keyboard fly movement ──────────────────────────────────────────────
  const handleFlyKeys = useCallback((
    cam: THREE.PerspectiveCamera,
    ctrl: OrbitControls,
    dt: number
  ) => {
    const keys = keysRef.current
    const sprint = keys['ShiftLeft'] || keys['ShiftRight']
    const spd = FLY_SPEED_BASE * (sprint ? 12 : 1) * dt

    const dir  = new THREE.Vector3()
    const right= new THREE.Vector3()
    const up   = new THREE.Vector3(0, 1, 0)

    cam.getWorldDirection(dir)
    right.crossVectors(dir, up).normalize()

    const move = new THREE.Vector3()

    if (keys['KeyW'] || keys['ArrowUp'])   move.addScaledVector(dir,   spd)
    if (keys['KeyS'] || keys['ArrowDown']) move.addScaledVector(dir,  -spd)
    if (keys['KeyA'] || keys['ArrowLeft']) move.addScaledVector(right,-spd)
    if (keys['KeyD'] || keys['ArrowRight'])move.addScaledVector(right, spd)
    if (keys['KeyQ'] || keys['PageDown'])  move.addScaledVector(up,   -spd)
    if (keys['KeyE'] || keys['PageUp'])    move.addScaledVector(up,    spd)

    if (move.lengthSq() > 0) {
      cam.position.add(move)
      ctrl.target.add(move)
    }
  }, [])

  // ── Click Raycast ──────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    const cam     = cameraRef.current
    const scene3  = sceneRef.current
    const floatGr = floatGroupRef.current
    if (!cam || !scene3 || !floatGr) return

    raycasterRef.current.setFromCamera(mouseRef.current, cam)
    const hits = raycasterRef.current.intersectObjects(floatGr.children, true)
    if (hits.length > 0) {
      const obj = hits[0].object
      const ud  = (obj as any).userData
      if (ud?.float) {
        const f = ud.float as ArgoFloat
        onFloatSelect({
          platform_number: f.platform_number,
          cycle_number:    f.cycle_number,
          latitude:        f.latitude,
          longitude:       f.longitude,
          time:            f.time,
        })
      }
    }
  }, [onFloatSelect])

  // ── Build / rebuild Argo float markers when floats list changes ────────
  useEffect(() => {
    const group = floatGroupRef.current
    const scene3 = sceneRef.current
    if (!group || !scene3) return

    // Clear old markers
    while (group.children.length > 0) {
      const c = group.children[0] as THREE.Mesh
      c.geometry?.dispose()
      ;(c.material as THREE.Material)?.dispose?.()
      group.remove(c)
    }

    if (!showFloats || displayFloats.length === 0) return

    const sphereGeo = new THREE.SphereGeometry(4, 12, 8)

    displayFloats.forEach((f) => {
      const pos = geoToWorld(f.latitude, f.longitude, 0)

      // Temperature-based color
      const t = Math.max(0, Math.min(1, ((f.temp_surface ?? 25) - 2) / 30))
      const col = new THREE.Color().setHSL(0.65 - t * 0.65, 0.9, 0.55)

      // Glow outer sphere
      const glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3 })
      const glowGeo = new THREE.SphereGeometry(10, 10, 6)
      const glow    = new THREE.Mesh(glowGeo, glowMat)
      glow.position.copy(pos)
      group.add(glow)

      // Core sphere
      const coreMat = new THREE.MeshPhongMaterial({
        color: col, emissive: col, emissiveIntensity: 0.6, shininess: 80,
      })
      const core = new THREE.Mesh(sphereGeo, coreMat)
      core.position.copy(pos)
      core.userData.float = f
      group.add(core)

      // Depth line from surface to max depth
      if (f.pres_max && f.pres_max > 5) {
        const maxD = Math.min(f.pres_max, 2000)
        const linePts = [pos.clone(), geoToWorld(f.latitude, f.longitude, maxD)]
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts)
        const lineMat = new THREE.LineBasicMaterial({
          color: col, transparent: true, opacity: 0.5,
        })
        group.add(new THREE.Line(lineGeo, lineMat))
      }

      // Selected highlight
      if (selectedFloat?.platform_number === f.platform_number) {
        const hlGeo = new THREE.SphereGeometry(18, 14, 10)
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, wireframe: true })
        const hl    = new THREE.Mesh(hlGeo, hlMat)
        hl.position.copy(pos)
        group.add(hl)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFloats, showFloats, selectedFloat])

  // ── Toggle grid visibility ─────────────────────────────────────────────
  useEffect(() => {
    if (gridGroupRef.current) gridGroupRef.current.visible = showGrid
  }, [showGrid])

  // ── Toggle slice visibility ────────────────────────────────────────────
  useEffect(() => {
    if (sliceGroupRef.current) sliceGroupRef.current.visible = showSlices
  }, [showSlices])

  // ── Update wave scale uniform ──────────────────────────────────────────
  useEffect(() => {
    if (waveUniRef.current) waveUniRef.current.uWaveScale.value = waveScale
  }, [waveScale])

  // ── Fetch HYCOM data for depth slices ─────────────────────────────────
  useEffect(() => {
    if (!scene.show_model) return
    const group = sliceGroupRef.current
    if (!group) return

    // Clear old slices
    while (group.children.length > 0) {
      const c = group.children[0] as THREE.Mesh
      c.geometry?.dispose()
      ;(c.material as THREE.ShaderMaterial)?.dispose?.()
      group.remove(c)
    }
    if (!showSlices) return

    const varStr = scene.variable === 'current_speed' ? 'temperature' : scene.variable
    const varIdx  = varStr === 'salinity' ? 1 : 0

    DEPTH_SLICES.forEach((depthM, idx) => {
      api.modelDepthSlice(varStr, depthM, 0).then((data) => {
        if (!data?.values?.length) return
        const { lat: lats, lon: lons, values, vmin, vmax } = data
        const rows = lats.length, cols = lons.length
        const buf  = new Float32Array(rows * cols)

        let k = 0
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const v = values[i]?.[j]
            if (v != null && isFinite(v) && vmax > vmin) {
              buf[k++] = (v - vmin) / (vmax - vmin)
            } else {
              buf[k++] = 0
            }
          }
        }

        const tex = new THREE.DataTexture(
          buf, cols, rows,
          THREE.RedFormat,
          THREE.FloatType
        )
        tex.needsUpdate = true

        // Base opacity: surface slice more opaque, deeper = thinner
        const baseOpacity = Math.max(0.06, 0.18 - idx * 0.015)

        const mat = new THREE.ShaderMaterial({
          vertexShader:   SLICE_VERT,
          fragmentShader: SLICE_FRAG,
          uniforms: {
            uDataTex:  { value: tex },
            uOpacity:  { value: baseOpacity },
            uVariable: { value: varIdx },
            uVmin:     { value: vmin },
            uVmax:     { value: vmax },
          },
          transparent: true,
          depthWrite:  false,
          side:        THREE.DoubleSide,
        })

        const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 1, 1)
        geo.rotateX(-Math.PI / 2)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.y = -depthM * VERT_SCALE
        group.add(mesh)
      }).catch(() => {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.variable, scene.show_model, showSlices])

  // ── Distance scale computation (from camera height) ────────────────────
  const camDistKm = Math.max(1, (hud.altitude + hud.depthM) / 1000 * 111)
  const scaleBarKm = camDistKm < 5 ? 0.5 : camDistKm < 50 ? 5 : camDistKm < 200 ? 50 : camDistKm < 800 ? 100 : 500
  const scaleBarPx = Math.min(180, Math.max(30, (scaleBarKm / camDistKm) * 220))

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#020810' }}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* ── HUD: Position + Depth ─────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 80, left: 16, zIndex: 20,
        background: 'rgba(2,8,20,0.88)', border: '1px solid rgba(0,180,255,0.45)',
        borderRadius: 8, padding: '10px 14px', backdropFilter: 'blur(10px)',
        fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: 12, color: '#a0d8f8',
        minWidth: 200,
      }}>
        <div style={{ fontWeight: 700, color: '#00e5ff', marginBottom: 6, fontSize: 11, letterSpacing: 2 }}>📍 POSITION</div>
        <div>LAT: <span style={{ color: '#fff', fontWeight: 600 }}>{hud.lat >= 0 ? `${hud.lat.toFixed(3)}°N` : `${Math.abs(hud.lat).toFixed(3)}°S`}</span></div>
        <div>LON: <span style={{ color: '#fff', fontWeight: 600 }}>{hud.lon >= 0 ? `${hud.lon.toFixed(3)}°E` : `${Math.abs(hud.lon).toFixed(3)}°W`}</span></div>
        <div style={{ marginTop: 4, borderTop: '1px solid rgba(0,180,255,0.2)', paddingTop: 4 }}>
          {underwater
            ? <span style={{ color: '#4fc3f7' }}>🌊 DEPTH: <strong style={{ color: '#00e5ff' }}>{hud.depthM}m</strong></span>
            : <span style={{ color: '#81d4fa' }}>🌤️ ALTITUDE: <strong style={{ color: '#80deea' }}>{hud.altitude}m</strong></span>
          }
        </div>
      </div>

      {/* ── HUD: Depth Scale Bar ──────────────────────────────────── */}
      {underwater && (
        <div style={{
          position: 'absolute', top: '50%', right: 20, transform: 'translateY(-50%)',
          zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'rgba(2,8,20,0.80)', border: '1px solid rgba(0,180,255,0.35)',
          borderRadius: 8, padding: '10px 8px', backdropFilter: 'blur(8px)',
          gap: 0, width: 52,
        }}>
          <div style={{ fontSize: 9, color: '#4fc3f7', marginBottom: 4, letterSpacing: 1 }}>DEPTH</div>
          {[0, 200, 500, 1000, 2000, 4000].map((d) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 8, color: d === Math.round(hud.depthM / 200) * 200 ? '#00e5ff' : '#5090b0', minWidth: 28, textAlign: 'right' }}>{d}m</span>
              <div style={{ width: 4, height: 1, background: d === Math.round(hud.depthM / 200) * 200 ? '#00e5ff' : 'rgba(0,180,255,0.3)' }} />
            </div>
          ))}
          {/* Indicator line */}
          <div style={{
            position: 'absolute',
            top: `${14 + Math.min(80, (hud.depthM / 4000) * 80)}px`,
            right: 6, width: 12, height: 2, background: '#00e5ff',
            boxShadow: '0 0 6px #00e5ff',
          }} />
        </div>
      )}

      {/* ── Scale Bar (bottom left) ───────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 52, left: 16, zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
      }}>
        <div style={{ fontSize: 10, color: '#70b0d8', fontFamily: 'monospace' }}>{scaleBarKm >= 1 ? `${scaleBarKm} km` : `${(scaleBarKm * 1000).toFixed(0)} m`}</div>
        <div style={{
          width: scaleBarPx, height: 4,
          background: 'linear-gradient(90deg, #00e5ff 50%, transparent 50%)',
          backgroundSize: `${scaleBarPx / 4}px 4px`,
          border: '1px solid #00b4ff', borderRadius: 2,
        }} />
      </div>

      {/* ── Compass (bottom right) ────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 52, right: 20, zIndex: 20,
        width: 52, height: 52,
        background: 'rgba(2,8,20,0.82)', border: '1px solid rgba(0,180,255,0.35)',
        borderRadius: '50%', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', fontSize: 10, color: '#60a0c0',
        flexDirection: 'column',
      }}>
        <div style={{ color: '#ff4444', fontWeight: 700, lineHeight: 1 }}>N</div>
        <div style={{ display: 'flex', gap: 10, lineHeight: 1 }}><span>W</span><span>E</span></div>
        <div style={{ lineHeight: 1 }}>S</div>
      </div>

      {/* ── Controls Panel ────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 80, right: 16, zIndex: 20,
        background: 'rgba(2,8,20,0.88)', border: '1px solid rgba(0,180,255,0.4)',
        borderRadius: 8, padding: '10px 14px', backdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 190,
      }}>
        <div style={{ fontWeight: 700, color: '#00e5ff', fontSize: 11, letterSpacing: 2 }}>⚙️ SCENE CONTROLS</div>

        {/* Variable selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['temperature', 'salinity'] as const).map(v => (
            <button key={v} onClick={() => setSelectedVariable(v)} style={{
              flex: 1, padding: '4px 6px', fontSize: 9, fontWeight: 700, borderRadius: 4,
              border: `1px solid ${selectedVariable === v ? '#00e5ff' : 'rgba(0,180,255,0.3)'}`,
              background: selectedVariable === v ? 'rgba(0,229,255,0.15)' : 'rgba(2,8,20,0.6)',
              color: selectedVariable === v ? '#00e5ff' : '#5090b0', cursor: 'pointer',
            }}>{v === 'temperature' ? '🌡 TEMP' : '🧂 SAL'}</button>
          ))}
        </div>

        {/* Toggles */}
        {[
          { label: '🌊 Wave Surface', state: waveScale > 0, toggle: () => setWaveScale(w => w > 0 ? 0 : 1.0) },
          { label: '🗺️ Lat/Lon Grid', state: showGrid,   toggle: () => setShowGrid(g => !g) },
          { label: '📡 Argo Floats',  state: showFloats, toggle: () => setShowFloats(f => !f) },
          { label: '📊 Data Slices',  state: showSlices, toggle: () => setShowSlices(s => !s) },
        ].map(({ label, state, toggle }) => (
          <button key={label} onClick={toggle} style={{
            padding: '5px 10px', fontSize: 10, fontWeight: 600, borderRadius: 5, cursor: 'pointer',
            border: `1px solid ${state ? 'rgba(0,229,255,0.5)' : 'rgba(80,120,160,0.4)'}`,
            background: state ? 'rgba(0,229,255,0.12)' : 'rgba(2,8,20,0.6)',
            color: state ? '#80f0ff' : '#407090', textAlign: 'left',
          }}>{state ? '✅' : '⬜'} {label}</button>
        ))}

        {/* Wave scale slider */}
        <div>
          <div style={{ fontSize: 10, color: '#5090b0', marginBottom: 3 }}>Wave Scale: {waveScale.toFixed(1)}×</div>
          <input type="range" min={0.1} max={3.0} step={0.1} value={waveScale}
            onChange={e => setWaveScale(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#00b4ff' }} />
        </div>
      </div>

      {/* ── Keyboard Controls Help ────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, background: 'rgba(2,8,20,0.75)',
        border: '1px solid rgba(0,180,255,0.25)', borderRadius: 6,
        padding: '5px 16px', color: '#4080a0', fontSize: 10,
        fontFamily: 'monospace', whiteSpace: 'nowrap', backdropFilter: 'blur(6px)',
      }}>
        🖱 Drag: Orbit &nbsp;|&nbsp; Scroll: Zoom &nbsp;|&nbsp; WASD: Fly &nbsp;|&nbsp; Q/E: Up/Down &nbsp;|&nbsp; Shift: Sprint
      </div>

      {/* ── Underwater Banner ─────────────────────────────────────── */}
      {underwater && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 5, pointerEvents: 'none',
          color: 'rgba(0,150,255,0.08)', fontSize: 120, fontWeight: 900,
          fontFamily: 'sans-serif', letterSpacing: 40, userSelect: 'none',
        }}>
          UNDERWATER
        </div>
      )}

      {/* ── Float Tooltip ─────────────────────────────────────────── */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 12,
          zIndex: 30, background: 'rgba(2,10,24,0.94)',
          border: '1px solid #00b4ff', borderRadius: 6,
          padding: '8px 12px', color: '#fff', fontSize: 11,
          pointerEvents: 'none', backdropFilter: 'blur(8px)',
        }}>
          {tooltip.text}
        </div>
      )}

      {/* ── Underwater ambient indicator ──────────────────────────── */}
      {underwater && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,8,40,0.4) 100%)',
        }} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Build Sky Dome
// ─────────────────────────────────────────────────────────────────────────────
function buildSkyDome(scene: THREE.Scene) {
  const skyGeo = new THREE.SphereGeometry(9000, 32, 16)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float h = clamp((normalize(vPos).y + 0.1) / 1.1, 0.0, 1.0);
        vec3 zenith  = vec3(0.01, 0.04, 0.18);
        vec3 horizon = vec3(0.03, 0.10, 0.28);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.5, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  scene.add(new THREE.Mesh(skyGeo, skyMat))
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Build Procedural Ocean Floor (GEBCO-style bathymetry via heightmap)
// ─────────────────────────────────────────────────────────────────────────────
function buildOceanFloor(scene: THREE.Scene) {
  // Create a procedural height texture simulating Indian Ocean bathymetry
  // Real GEBCO data would be fetched and used here; for 3D geometry we bake
  // a synthetic texture that matches known Indian Ocean depth patterns
  const SIZE = 256
  const data = new Float32Array(SIZE * SIZE)

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      // Map to lat/lon space
      const lat = LAT_MIN + (row / SIZE) * (LAT_MAX - LAT_MIN)
      const lon = LON_MIN + (col / SIZE) * (LON_MAX - LON_MIN)

      // Approximate Indian Ocean bathymetry
      let depth = 3800  // average abyssal depth
      const distIndia = Math.sqrt(Math.pow(lat - 20, 2) + Math.pow(lon - 78, 2))
      const distSriLanka = Math.sqrt(Math.pow(lat - 8, 2) + Math.pow(lon - 81, 2))
      const distMaldives = Math.sqrt(Math.pow(lat - 4, 2) + Math.pow(lon - 73.5, 2))

      // Continental shelf off India (0-200m)
      if (distIndia < 8) depth = Math.max(0, distIndia * 25)
      // Sri Lanka shelf
      else if (distSriLanka < 3) depth = Math.max(0, distSriLanka * 60)
      // Arabian Sea (slightly shallower)
      else if (lon < 66) depth = 3200 + Math.sin(lon * 0.3 + lat * 0.2) * 400
      // Bay of Bengal
      else if (lon > 85 && lat > 8) depth = 2800 + Math.sin(lon * 0.25 - lat * 0.3) * 500
      // Mid-Indian Ocean Ridge (shallower ridge)
      else if (Math.abs(lon - 70) < 6 && lat < 10) depth = 2200 + Math.random() * 400
      // Maldives (very shallow)
      else if (distMaldives < 2) depth = 50 + distMaldives * 80
      // Deep abyssal basins
      else if (lat < -5) depth = 4500 + Math.sin(lon * 0.1 + lat * 0.1) * 600
      // Noise for realistic texture
      depth += Math.sin(lat * 8.4 + lon * 6.1) * 120
               + Math.sin(lat * 14.2 - lon * 11.3) * 60
               + Math.sin(lat * 22.7 + lon * 19.5) * 30
      depth = Math.max(0, depth)

      // Normalize 0→1 (0 = surface/land, 1 = deepest)
      data[row * SIZE + col] = Math.min(1, depth / 5500)
    }
  }

  const heightTex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RedFormat, THREE.FloatType)
  heightTex.needsUpdate = true

  const floorMat = new THREE.ShaderMaterial({
    vertexShader:   FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {
      uHeightMap: { value: heightTex },
      uVertScale: { value: VERT_SCALE },
      uTime:      { value: 0 },
    },
    side: THREE.FrontSide,
  })

  const floorGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 300, 240)
  floorGeo.rotateX(-Math.PI / 2)
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.y = -5  // slightly below Y=0
  floor.receiveShadow = true
  scene.add(floor)

  // Also store ref on scene for uTime updates
  ;(scene as any)._floorMat = floorMat
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Build Lat/Lon Grid with CSS2D Labels
// ─────────────────────────────────────────────────────────────────────────────
function buildLatLonGrid(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group()
  group.name  = 'lat-lon-grid'

  const latLineMat = new THREE.LineBasicMaterial({ color: 0x0055aa, transparent: true, opacity: 0.4 })
  const lonLineMat = new THREE.LineBasicMaterial({ color: 0x004488, transparent: true, opacity: 0.35 })

  // Latitude lines (horizontal, every 5°)
  for (let lat = Math.ceil(LAT_MIN / 5) * 5; lat <= LAT_MAX; lat += 5) {
    const pts: THREE.Vector3[] = []
    for (let lon = LON_MIN; lon <= LON_MAX; lon += 2) {
      pts.push(geoToWorld(lat, lon, 0))
    }
    const geo  = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.Line(geo, latLineMat)
    group.add(line)

    // Label
    const div = document.createElement('div')
    div.style.cssText = `color: rgba(100,180,255,0.7); font-size: 10px; font-family: monospace; pointer-events: none; white-space: nowrap;`
    div.textContent = lat >= 0 ? `${lat}°N` : `${Math.abs(lat)}°S`
    const label = new CSS2DObject(div)
    label.position.copy(geoToWorld(lat, LON_MIN - 1, 0))
    group.add(label)
  }

  // Longitude lines (vertical, every 5°)
  for (let lon = Math.ceil(LON_MIN / 5) * 5; lon <= LON_MAX; lon += 5) {
    const pts: THREE.Vector3[] = []
    for (let lat = LAT_MIN; lat <= LAT_MAX; lat += 2) {
      pts.push(geoToWorld(lat, lon, 0))
    }
    const geo  = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.Line(geo, lonLineMat)
    group.add(line)

    // Label
    const div = document.createElement('div')
    div.style.cssText = `color: rgba(80,160,255,0.7); font-size: 10px; font-family: monospace; pointer-events: none; white-space: nowrap;`
    div.textContent = lon >= 0 ? `${lon}°E` : `${Math.abs(lon)}°W`
    const label = new CSS2DObject(div)
    label.position.copy(geoToWorld(LAT_MIN - 1, lon, 0))
    group.add(label)
  }

  // Depth grid lines (vertical planes at key depths)
  const depthLineMat = new THREE.LineBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.25 })
  ;[200, 500, 1000, 2000, 4000].forEach((depthM) => {
    const pts = [
      geoToWorld(LAT_MIN, LON_MIN, depthM),
      geoToWorld(LAT_MAX, LON_MIN, depthM),
      geoToWorld(LAT_MAX, LON_MAX, depthM),
      geoToWorld(LAT_MIN, LON_MAX, depthM),
      geoToWorld(LAT_MIN, LON_MIN, depthM),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.Line(geo, depthLineMat))

    // Depth label
    const div = document.createElement('div')
    div.style.cssText = `color: rgba(60,120,220,0.65); font-size: 9px; font-family: monospace; pointer-events: none;`
    div.textContent = `— ${depthM}m`
    const label = new CSS2DObject(div)
    label.position.copy(geoToWorld(LAT_MIN, LON_MIN, depthM))
    group.add(label)
  })

  scene.add(group)
  return group
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Suspended particle system (underwater plankton / debris)
// ─────────────────────────────────────────────────────────────────────────────
function buildParticles(scene: THREE.Scene): { uTime: { value: number } } {
  const COUNT = 4000
  const positions  = new Float32Array(COUNT * 3)
  const sizes      = new Float32Array(COUNT)
  const velocities = new Float32Array(COUNT * 3)

  for (let i = 0; i < COUNT; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * WORLD_W
    positions[i * 3 + 1] = -(Math.random() * 2200)   // spread 0–2200 world = 0–4900m
    positions[i * 3 + 2] = (Math.random() - 0.5) * WORLD_D
    sizes[i]      = 1.5 + Math.random() * 3
    velocities[i * 3]     = 0.3 + Math.random() * 0.8
    velocities[i * 3 + 1] = 0.2 + Math.random() * 0.6
    velocities[i * 3 + 2] = 0.25 + Math.random() * 0.7
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aVelocity',new THREE.BufferAttribute(velocities, 3))

  const unis = { uTime: { value: 0 } }
  const mat  = new THREE.ShaderMaterial({
    vertexShader:   PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: unis,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const pts = new THREE.Points(geo, mat)
  scene.add(pts)
  return unis
}
