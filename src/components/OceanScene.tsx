import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SceneState, SelectedFloat } from '../types'
import { ArgoFloat, api, HYCOMModelSurface } from '../services/api'

const GLOBE_RADIUS = 8.0

/** Convert Lat, Lon (degrees) and height offset above globe surface to 3D Vector3 */
function latLonToVector3(lat: number, lon: number, radius = GLOBE_RADIUS, alt = 0): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const r = radius + alt
  const x = -(r * Math.sin(phi) * Math.cos(theta))
  const z = r * Math.sin(phi) * Math.sin(theta)
  const y = r * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

/** Convert 3D point on globe surface back to Lat, Lon */
function vector3ToLatLon(vec: THREE.Vector3, radius = GLOBE_RADIUS): { lat: number; lon: number } {
  const norm = vec.clone().normalize()
  const lat = 90 - Math.acos(norm.y) * (180 / Math.PI)
  let lon = Math.atan2(norm.z, -norm.x) * (180 / Math.PI) - 180
  if (lon < -180) lon += 360
  if (lon > 180) lon -= 360
  return { lat, lon }
}

/** Scientific temperature color mapping: 2°C (Blue) → 32°C (Red) */
function tempToColor(temp: number | null): THREE.Color {
  if (temp === null || isNaN(temp)) return new THREE.Color(0x3a7bd5)
  const t = Math.max(0, Math.min(1, (temp - 2) / 30))
  const c = new THREE.Color()
  if (t < 0.25) c.lerpColors(new THREE.Color(0x1a365d), new THREE.Color(0x00b4d8), t / 0.25)
  else if (t < 0.50) c.lerpColors(new THREE.Color(0x00b4d8), new THREE.Color(0x52b788), (t - 0.25) / 0.25)
  else if (t < 0.75) c.lerpColors(new THREE.Color(0x52b788), new THREE.Color(0xfee440), (t - 0.50) / 0.25)
  else c.lerpColors(new THREE.Color(0xfee440), new THREE.Color(0xf72585), (t - 0.75) / 0.25)
  return c
}

const ATMOSPHERE_VERT = /* glsl */`
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const ATMOSPHERE_FRAG = /* glsl */`
varying vec3 vNormal;
void main() {
  float intensity = pow(0.62 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
  gl_FragColor = vec4(0.12, 0.65, 0.98, 1.0) * intensity;
}
`

interface BBox { lat_min: number; lat_max: number; lon_min: number; lon_max: number }

interface OceanSceneProps {
  scene: SceneState
  floats: ArgoFloat[]
  onFloatSelect: (float: SelectedFloat) => void
  selectedFloat: SelectedFloat | null
  onBBoxSelect?: (bbox: BBox | null) => void
  selectedBBox?: BBox | null
  filteredFloats?: ArgoFloat[]
  onRegionSelect?: (bbox: BBox) => void
}

const PRESETS = [
  { name: '🇮🇳 India & Indian Ocean', lat: 15, lon: 78, distance: 20 },
  { name: '🌊 Arabian Sea', lat: 14, lon: 65, distance: 15 },
  { name: '🌊 Bay of Bengal', lat: 14, lon: 88, distance: 15 },
  { name: '🌐 Global 3D View', lat: 10, lon: 75, distance: 28 },
]

export default function OceanScene({
  scene,
  floats,
  onFloatSelect,
  selectedFloat,
  onBBoxSelect,
  selectedBBox,
  filteredFloats,
  onRegionSelect,
}: OceanSceneProps) {
  // Region dive selection (double-click globe → creates 4°×4° BBox → show Dive button)
  const [diveRegion, setDiveRegion] = useState<BBox | null>(null)
  const diveRegionRef = useRef<THREE.LineSegments | null>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const threeSceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const globeGroupRef = useRef<THREE.Group | null>(null)
  const floatMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const vectorsGroupRef = useRef<THREE.Group | null>(null)
  const modelGridGroupRef = useRef<THREE.Group | null>(null)
  const bathymetryGroupRef = useRef<THREE.Group | null>(null)

  const floatDataRef = useRef<ArgoFloat[]>([])
  const raycasterRef = useRef(new THREE.Raycaster())
  const earthGlobeRef = useRef<THREE.Mesh | null>(null)
  const bboxLineRef = useRef<THREE.LineSegments | null>(null)

  const displayFloats = filteredFloats || floats

  // ── Initialize 3D WebGL Canvas ───────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth
    const height = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x020813, 1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000)
    const initCamPos = latLonToVector3(15, 78, GLOBE_RADIUS, 14)
    camera.position.copy(initCamPos)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const threeScene = new THREE.Scene()
    threeSceneRef.current = threeScene

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.rotateSpeed = 0.8
    controls.zoomSpeed = 1.0
    controls.minDistance = 9.2
    controls.maxDistance = 50.0
    controlsRef.current = controls

    // Lighting
    threeScene.add(new THREE.AmbientLight(0xddeeff, 1.2))
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2)
    sunLight.position.set(25, 15, 20)
    threeScene.add(sunLight)
    const fillLight = new THREE.DirectionalLight(0x114488, 1.0)
    fillLight.position.set(-20, -10, -15)
    threeScene.add(fillLight)

    // Starfield
    const starGeo = new THREE.BufferGeometry()
    const starCount = 3000
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i++) starPositions[i] = (Math.random() - 0.5) * 400
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    threeScene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x88bbff, size: 0.7, transparent: true, opacity: 0.7 })))

    const globeGroup = new THREE.Group()
    threeScene.add(globeGroup)
    globeGroupRef.current = globeGroup

    // Groups for vectors & model fields
    const vectorsGroup = new THREE.Group()
    globeGroup.add(vectorsGroup)
    vectorsGroupRef.current = vectorsGroup

    const modelGridGroup = new THREE.Group()
    globeGroup.add(modelGridGroup)
    modelGridGroupRef.current = modelGridGroup

    const bathymetryGroup = new THREE.Group()
    globeGroup.add(bathymetryGroup)
    bathymetryGroupRef.current = bathymetryGroup

    // Load Earth texture
    const textureLoader = new THREE.TextureLoader()
    const satTex = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96)
    const earthMat = new THREE.MeshPhongMaterial({ map: satTex, shininess: 25, specular: new THREE.Color(0x113355) })
    const earthMesh = new THREE.Mesh(earthGeo, earthMat)
    globeGroup.add(earthMesh)
    earthGlobeRef.current = earthMesh

    // Atmosphere Glow
    const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.022, 64, 64)
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    })
    globeGroup.add(new THREE.Mesh(atmosGeo, atmosMat))

    // Lat / Lon Grid
    const gridMatMajor = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35 })
    const gridMatMinor = new THREE.LineBasicMaterial({ color: 0x0080ff, transparent: true, opacity: 0.15 })
    for (let lat = -80; lat <= 80; lat += 10) {
      const pts: THREE.Vector3[] = []
      for (let lon = -180; lon <= 180; lon += 3) pts.push(latLonToVector3(lat, lon, GLOBE_RADIUS, 0.02))
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lat % 30 === 0 ? gridMatMajor : gridMatMinor))
    }
    for (let lon = -180; lon < 180; lon += 15) {
      const pts: THREE.Vector3[] = []
      for (let lat = -85; lat <= 85; lat += 3) pts.push(latLonToVector3(lat, lon, GLOBE_RADIUS, 0.02))
      globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lon % 30 === 0 ? gridMatMajor : gridMatMinor))
    }

    // ── 3D Volumetric Ocean Water Block (Indian Ocean Water Column) ─────────────
    const waterGroup = new THREE.Group()
    waterGroup.name = 'volumetric-ocean-block'

    const lats = [0, 5, 10, 15, 20, 25]
    const lons = [55, 65, 75, 85, 95]
    const surfAlt = 0.14
    const botAlt = -0.40

    // Top Animated Ocean Surface Water Mesh
    const surfPts: THREE.Vector3[] = []
    const surfGeo = new THREE.PlaneGeometry(20, 15, 32, 24)
    const surfMat = new THREE.MeshPhongMaterial({
      color: 0x007799,
      emissive: 0x002233,
      specular: 0x88ffff,
      shininess: 90,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    })

    // Construct 3D Curved Top Surface for Indian Ocean
    const topGrid: THREE.Vector3[][] = []
    lats.forEach((lt, i) => {
      topGrid[i] = []
      lons.forEach((ln, j) => {
        topGrid[i][j] = latLonToVector3(lt, ln, GLOBE_RADIUS, surfAlt)
      })
    })

    // Construct 3D Curved Bottom Seafloor
    const botGrid: THREE.Vector3[][] = []
    lats.forEach((lt, i) => {
      botGrid[i] = []
      lons.forEach((ln, j) => {
        botGrid[i][j] = latLonToVector3(lt, ln, GLOBE_RADIUS, botAlt)
      })
    })

    // Create Translucent Glass Wall Meshes for 4 Sides of the Water Block
    const wallMat = new THREE.MeshPhongMaterial({
      color: 0x005577,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    const wallGeos: THREE.BufferGeometry[] = []

    // South Wall (lat = 0)
    for (let j = 0; j < lons.length - 1; j++) {
      const p1 = topGrid[0][j]
      const p2 = topGrid[0][j + 1]
      const p3 = botGrid[0][j + 1]
      const p4 = botGrid[0][j]
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p1, p3, p4])
      geo.computeVertexNormals()
      wallGeos.push(geo)
    }

    // North Wall (lat = 25)
    const lastLat = lats.length - 1
    for (let j = 0; j < lons.length - 1; j++) {
      const p1 = topGrid[lastLat][j]
      const p2 = topGrid[lastLat][j + 1]
      const p3 = botGrid[lastLat][j + 1]
      const p4 = botGrid[lastLat][j]
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p1, p3, p4])
      geo.computeVertexNormals()
      wallGeos.push(geo)
    }

    // West Wall (lon = 55)
    for (let i = 0; i < lats.length - 1; i++) {
      const p1 = topGrid[i][0]
      const p2 = topGrid[i + 1][0]
      const p3 = botGrid[i + 1][0]
      const p4 = botGrid[i][0]
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p1, p3, p4])
      geo.computeVertexNormals()
      wallGeos.push(geo)
    }

    // East Wall (lon = 95)
    const lastLon = lons.length - 1
    for (let i = 0; i < lats.length - 1; i++) {
      const p1 = topGrid[i][lastLon]
      const p2 = topGrid[i + 1][lastLon]
      const p3 = botGrid[i + 1][lastLon]
      const p4 = botGrid[i][lastLon]
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p1, p3, p4])
      geo.computeVertexNormals()
      wallGeos.push(geo)
    }

    wallGeos.forEach(g => waterGroup.add(new THREE.Mesh(g, wallMat)))
    globeGroup.add(waterGroup)

    let animId = 0
    let clockTime = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
      clockTime += 0.02
      controls.update()
      renderer.render(threeScene, camera)
    }
    animate()


    const handleResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const obs = new ResizeObserver(handleResize)
    obs.observe(mount)

    return () => {
      cancelAnimationFrame(animId)
      obs.disconnect()
      controls.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  // ── Render Argo Float Spheres ────────────────────────────────────────────
  useEffect(() => {
    if (!globeGroupRef.current) return
    const group = globeGroupRef.current
    floatDataRef.current = displayFloats

    if (floatMeshRef.current) {
      group.remove(floatMeshRef.current)
      floatMeshRef.current.geometry.dispose()
    }

    if (!scene.show_argo || displayFloats.length === 0) return

    const sphereGeo = new THREE.SphereGeometry(0.085, 12, 12)
    const mat = new THREE.MeshPhongMaterial({ shininess: 80, transparent: true, opacity: scene.opacity })
    const instancedMesh = new THREE.InstancedMesh(sphereGeo, mat, displayFloats.length)
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const dummy = new THREE.Object3D()
    displayFloats.forEach((f, i) => {
      const pos = latLonToVector3(f.latitude, f.longitude, GLOBE_RADIUS, 0.08)
      dummy.position.copy(pos)
      dummy.lookAt(pos.clone().multiplyScalar(2))
      dummy.updateMatrix()

      instancedMesh.setMatrixAt(i, dummy.matrix)
      instancedMesh.setColorAt(i, tempToColor(f.temp_surface))
    })

    instancedMesh.instanceMatrix.needsUpdate = true
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true

    group.add(instancedMesh)
    floatMeshRef.current = instancedMesh
  }, [displayFloats, scene.opacity, scene.show_argo])

  // ── Render real IGORA current velocity vectors (u, v) ────────────────────
  useEffect(() => {
    if (!vectorsGroupRef.current) return
    const group = vectorsGroupRef.current
    group.clear()

    if (!scene.show_currents && scene.variable !== 'current_speed') return
    let cancelled = false

    Promise.all([
      api.modelDepthSlice('u_current', scene.depth_m, Math.round(scene.time_index / 100 * 11)),
      api.modelDepthSlice('v_current', scene.depth_m, Math.round(scene.time_index / 100 * 11)),
    ]).then(([uField, vField]) => {
      if (cancelled || !uField.values || !vField.values) return
      const { lat: lats, lon: lons } = uField
      const stepLat = Math.max(1, Math.floor(lats.length / 12))
      const stepLon = Math.max(1, Math.floor(lons.length / 16))

      for (let i = 0; i < lats.length; i += stepLat) {
        for (let j = 0; j < lons.length; j += stepLon) {
          const u = uField.values[i]?.[j]
          const v = vField.values[i]?.[j]
          if (u == null || v == null) continue
          const speed = Math.sqrt(u * u + v * v)
          if (!Number.isFinite(speed) || speed < 0.01) continue

          const origin = latLonToVector3(lats[i], lons[j], GLOBE_RADIUS, 0.12)
          const lonRad = lons[j] * Math.PI / 180
          const east = new THREE.Vector3(-Math.sin(lonRad), 0, Math.cos(lonRad)).normalize()
          const north = new THREE.Vector3(0, 1, 0).projectOnPlane(origin.clone().normalize()).normalize()
          const dir = east.multiplyScalar(u).add(north.multiplyScalar(v)).normalize()
          const color = speed > 0.35 ? 0x00ffff : 0x00b4d8
          group.add(new THREE.ArrowHelper(dir, origin, 0.55 * Math.min(1.5, speed), color, 0.12, 0.08))
        }
      }
    }).catch(console.error)

    return () => { cancelled = true; group.clear() }
  }, [scene.show_currents, scene.variable, scene.depth_m, scene.time_index])

  // ── Render 3D HYCOM Model Depth-Slice Grid ────────────────────────────────
  useEffect(() => {
    if (!modelGridGroupRef.current) return
    const group = modelGridGroupRef.current
    group.clear()

    // Always clear when model is hidden
    if (!scene.show_model) return

    // Depth-aware height offset: deeper slices float slightly above globe for visibility
    // Surface (0m) = 0.04, 50m = 0.10, 200m = 0.16, 750m = 0.22, 2000m = 0.30
    const depthOffset = 0.04 + Math.log1p(scene.depth_m) * 0.006 * scene.vertical_exaggeration

    const variable = scene.variable === 'current_speed' ? 'temperature' : scene.variable

    // Fetch depth-specific slice from the HYCOM API
    api.modelDepthSlice(variable, scene.depth_m, Math.round(scene.time_index / 100 * 11)).then(data => {
      if (!data || !data.values || data.values.length === 0) return

      const { lat: lats, lon: lons, values, vmin, vmax, actual_depth_m: actualDepth } = data

      // Coarser grid for deeper slices (less data needed)
      const resolution = scene.depth_m === 0 ? 30 : scene.depth_m < 200 ? 25 : 20
      const stepLat = Math.max(1, Math.floor(lats.length / resolution))
      const stepLon = Math.max(1, Math.floor(lons.length / (resolution * 1.3)))

      const meshes: THREE.Mesh[] = []

      for (let i = 0; i < lats.length - stepLat; i += stepLat) {
        for (let j = 0; j < lons.length - stepLon; j += stepLon) {
          const val = values[i]?.[j]
          if (val === null || val === undefined) continue

          const p1 = latLonToVector3(lats[i],          lons[j],          GLOBE_RADIUS, depthOffset)
          const p2 = latLonToVector3(lats[i + stepLat], lons[j],          GLOBE_RADIUS, depthOffset)
          const p3 = latLonToVector3(lats[i + stepLat], lons[j + stepLon], GLOBE_RADIUS, depthOffset)
          const p4 = latLonToVector3(lats[i],          lons[j + stepLon], GLOBE_RADIUS, depthOffset)

          const geo = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p1, p3, p4])
          geo.computeVertexNormals()

          // Scientific color mapping: blue (cold/fresh) → red (warm/salty)
          const normVal = Math.max(0, Math.min(1, (val - vmin) / ((vmax - vmin) || 1)))
          const color = new THREE.Color()
          if (normVal < 0.25)      color.lerpColors(new THREE.Color(0x1a237e), new THREE.Color(0x0288d1), normVal / 0.25)
          else if (normVal < 0.5)  color.lerpColors(new THREE.Color(0x0288d1), new THREE.Color(0x4caf50), (normVal - 0.25) / 0.25)
          else if (normVal < 0.75) color.lerpColors(new THREE.Color(0x4caf50), new THREE.Color(0xffc107), (normVal - 0.50) / 0.25)
          else                     color.lerpColors(new THREE.Color(0xffc107), new THREE.Color(0xd32f2f), (normVal - 0.75) / 0.25)

          const mat = new THREE.MeshPhongMaterial({
            color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: scene.opacity * 0.80,
            shininess: 30,
            depthWrite: false,
          })
          meshes.push(new THREE.Mesh(geo, mat))
        }
      }

      meshes.forEach(m => group.add(m))

      // Add depth label sprite above the slice
      group.children.filter(c => c.name === 'depth-label').forEach(c => group.remove(c))
      const labelPos = latLonToVector3(28, 97, GLOBE_RADIUS, depthOffset + 0.3)
      const canvas = document.createElement('canvas')
      canvas.width = 256; canvas.height = 64
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.fillRect(0, 0, 256, 64)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, 254, 62)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 22px sans-serif'

      ctx.textAlign = 'center'
      ctx.fillText(`${scene.depth_m === 0 ? 'Surface' : `${actualDepth ?? scene.depth_m}m Depth`}`, 128, 28)
      ctx.fillStyle = '#8ba7bb'
      ctx.font = '14px monospace'
      ctx.fillText(`${variable.toUpperCase()} | INCOIS IGORA`, 128, 50)
      const tex = new THREE.CanvasTexture(canvas)
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 0.6),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      )
      labelMesh.position.copy(labelPos)
      labelMesh.lookAt(labelPos.clone().multiplyScalar(2))
      labelMesh.name = 'depth-label'
      group.add(labelMesh)

    }).catch(console.error)
  }, [scene.show_model, scene.variable, scene.depth_m, scene.opacity, scene.time_index, scene.vertical_exaggeration])

  // ── Render GEBCO seafloor mesh and land mask ─────────────────────────────
  useEffect(() => {
    const group = bathymetryGroupRef.current
    if (!group) return
    group.clear()
    if (!scene.show_bathymetry) return
    let cancelled = false

    api.gebcoGrid().then(data => {
      if (cancelled || !data.elevation?.length) return
      const positions: number[] = []
      const colors: number[] = []
      const indices: number[] = []
      const rows = data.lat.length
      const cols = data.lon.length
      const depthScale = 0.00002 * scene.vertical_exaggeration
      const colorForDepth = (depth: number) => {
        const t = Math.max(0, Math.min(1, depth / 5000))
        return new THREE.Color().lerpColors(new THREE.Color(0x164e63), new THREE.Color(0x020617), t)
      }

      const addVertex = (lat: number, lon: number, elevation: number) => {
        const depth = Math.max(0, -elevation)
        const pos = latLonToVector3(lat, lon, GLOBE_RADIUS, 0.06 + depth * depthScale)
        positions.push(pos.x, pos.y, pos.z)
        const color = colorForDepth(depth)
        colors.push(color.r, color.g, color.b)
        return positions.length / 3 - 1
      }

      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
          const e1 = data.elevation[i]?.[j] ?? 0
          const e2 = data.elevation[i + 1]?.[j] ?? 0
          const e3 = data.elevation[i + 1]?.[j + 1] ?? 0
          const e4 = data.elevation[i]?.[j + 1] ?? 0
          // Positive GEBCO elevation is land; omit cells touching land.
          if ([e1, e2, e3, e4].some(e => e >= 0)) continue
          const base = positions.length / 3
          addVertex(data.lat[i], data.lon[j], e1)
          addVertex(data.lat[i + 1], data.lon[j], e2)
          addVertex(data.lat[i + 1], data.lon[j + 1], e3)
          addVertex(data.lat[i], data.lon[j + 1], e4)
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        }
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'gebco-seafloor'
      mesh.renderOrder = 2
      group.add(mesh)
    }).catch(console.error)

    return () => { cancelled = true; group.clear() }
  }, [scene.show_bathymetry, scene.vertical_exaggeration])

  // ── Render 3D Glider Trajectory Line & Markers ─────────────────────────────
  useEffect(() => {
    if (!globeGroupRef.current) return
    const group = globeGroupRef.current
    group.children.filter(c => c.name === 'glider-group').forEach(c => group.remove(c))

    const gliderGroup = new THREE.Group()
    gliderGroup.name = 'glider-group'
    if (!scene.show_glider) return

    api.gliderTrajectory().then(data => {
      if (!data || !data.waypoints || data.waypoints.length === 0) return

      const points: THREE.Vector3[] = []
      data.waypoints.forEach(wp => {
        const vec = latLonToVector3(wp.lat, wp.lon, GLOBE_RADIUS, 0.15)
        points.push(vec)
      })

      // Sawtooth Trajectory Line
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
      const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 })
      const trajectoryLine = new THREE.Line(lineGeo, lineMat)
      gliderGroup.add(trajectoryLine)

      // Waypoint Markers
      const sphereGeo = new THREE.SphereGeometry(0.06, 8, 8)
      const mat = new THREE.MeshBasicMaterial({ color: 0x34d399 })
      points.forEach((p, idx) => {
        if (idx % 10 === 0) { // Render marker every 10 waypoints
          const mesh = new THREE.Mesh(sphereGeo, mat)
          mesh.position.copy(p)
          gliderGroup.add(mesh)
        }
      })

      group.add(gliderGroup)
    }).catch(console.error)
  }, [scene.show_glider, scene.vertical_exaggeration])


  // ── Selected Float Ring ──────────────────────────────────────────────────
  useEffect(() => {
    if (!globeGroupRef.current) return
    const group = globeGroupRef.current
    group.children.filter(c => c.name === 'float-sel-ring').forEach(c => group.remove(c))

    if (!selectedFloat) return
    const pos = latLonToVector3(selectedFloat.latitude, selectedFloat.longitude, GLOBE_RADIUS, 0.12)
    const ringGeo = new THREE.RingGeometry(0.18, 0.28, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    const ringMesh = new THREE.Mesh(ringGeo, ringMat)
    ringMesh.position.copy(pos)
    ringMesh.lookAt(pos.clone().multiplyScalar(2))
    ringMesh.name = 'float-sel-ring'
    group.add(ringMesh)
  }, [selectedFloat])

  // ── Canvas Click Handler ─────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !earthGlobeRef.current) return
    const rect = mountRef.current.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycasterRef.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef.current)

    // Try to select a float first
    if (floatMeshRef.current && floatDataRef.current.length > 0) {
      const hits = raycasterRef.current.intersectObject(floatMeshRef.current)
      if (hits.length > 0) {
        const idx = hits[0].instanceId ?? -1
        if (idx >= 0 && idx < floatDataRef.current.length) {
          const f = floatDataRef.current[idx]
          onFloatSelect({ platform_number: f.platform_number, cycle_number: f.cycle_number,
            latitude: f.latitude, longitude: f.longitude, time: f.time })
          return
        }
      }
    }

    // Globe click → create 4°×6° region box for Dive
    if (onRegionSelect && earthGlobeRef.current) {
      const globeHits = raycasterRef.current.intersectObject(earthGlobeRef.current)
      if (globeHits.length > 0) {
        const pt = globeHits[0].point
        const { lat, lon } = vector3ToLatLon(pt)
        const spanLat = 4, spanLon = 6
        const bbox: BBox = {
          lat_min: Math.max(-90,  parseFloat((lat - spanLat / 2).toFixed(1))),
          lat_max: Math.min(90,   parseFloat((lat + spanLat / 2).toFixed(1))),
          lon_min: Math.max(-180, parseFloat((lon - spanLon / 2).toFixed(1))),
          lon_max: Math.min(180,  parseFloat((lon + spanLon / 2).toFixed(1))),
        }
        setDiveRegion(bbox)
        // Draw glowing box on globe
        const group = globeGroupRef.current
        if (group) {
          if (diveRegionRef.current) group.remove(diveRegionRef.current)
          const pts: THREE.Vector3[] = []
          const steps = 20
          for (let s = 0; s <= steps; s++) {
            const t = s / steps
            pts.push(latLonToVector3(bbox.lat_min, bbox.lon_min + t*(bbox.lon_max - bbox.lon_min), GLOBE_RADIUS, 0.05))
          }
          for (let s = 0; s <= steps; s++) {
            const t = s / steps
            pts.push(latLonToVector3(bbox.lat_min + t*(bbox.lat_max - bbox.lat_min), bbox.lon_max, GLOBE_RADIUS, 0.05))
          }
          for (let s = 0; s <= steps; s++) {
            const t = s / steps
            pts.push(latLonToVector3(bbox.lat_max, bbox.lon_max - t*(bbox.lon_max - bbox.lon_min), GLOBE_RADIUS, 0.05))
          }
          for (let s = 0; s <= steps; s++) {
            const t = s / steps
            pts.push(latLonToVector3(bbox.lat_max - t*(bbox.lat_max - bbox.lat_min), bbox.lon_min, GLOBE_RADIUS, 0.05))
          }
          pts.push(pts[0])
          const geo = new THREE.BufferGeometry().setFromPoints(pts)
          const mat = new THREE.LineBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.95 })
          const line = new THREE.LineSegments(geo, mat)
          line.name = 'dive-region-box'
          group.add(line)
          diveRegionRef.current = line as unknown as THREE.LineSegments
        }
        return
      }
    }
  }, [onFloatSelect, onRegionSelect])

  const goToPreset = useCallback((preset: typeof PRESETS[0]) => {
    if (!cameraRef.current || !controlsRef.current) return
    const targetPos = latLonToVector3(preset.lat, preset.lon, GLOBE_RADIUS, preset.distance - GLOBE_RADIUS)
    const startPos = cameraRef.current.position.clone()
    let progress = 0
    const duration = 40
    const step = () => {
      progress++
      const t = Math.min(1, progress / duration)
      const easeT = 0.5 - Math.cos(t * Math.PI) / 2
      cameraRef.current?.position.lerpVectors(startPos, targetPos, easeT)
      controlsRef.current?.update()
      if (progress < duration) requestAnimationFrame(step)
    }
    step()
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} onClick={handleCanvasClick} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Preset view buttons */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 20 }}>
        {PRESETS.map(p => (
          <button key={p.name} onClick={() => goToPreset(p)} style={{
            padding: '6px 12px', background: 'rgba(6,32,53,0.9)',
            border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6,
            color: '#e8f4f8', fontSize: 11, fontFamily: 'Inter, sans-serif',
            fontWeight: 500, cursor: 'pointer', backdropFilter: 'blur(8px)',
          }}>{p.name}</button>
        ))}
      </div>

      {/* Info badges */}
      <div style={{ position: 'absolute', top: 12, left: 12, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Badge keyName="MODE" value="🌍 Globe — click ocean to select region" highlight />
        <Badge keyName="ACTIVE OBS" value={`${displayFloats.length.toLocaleString()} Floats`} />
        {diveRegion && (
          <Badge keyName="SELECTED" value={`${diveRegion.lat_min}–${diveRegion.lat_max}°N · ${diveRegion.lon_min}–${diveRegion.lon_max}°E`} highlight />
        )}
      </div>

      {/* Dive into Region button */}
      {diveRegion && onRegionSelect && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            background: 'rgba(6,12,26,0.95)', border: '1px solid rgba(255,220,0,0.6)',
            borderRadius: 10, padding: '8px 16px', textAlign: 'center',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ color: '#ffdd00', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, marginBottom: 6 }}>
              📍 {diveRegion.lat_min}–{diveRegion.lat_max}°N · {diveRegion.lon_min}–{diveRegion.lon_max}°E
            </div>
            <button
              id="dive-region-btn"
              onClick={() => { onRegionSelect(diveRegion); setDiveRegion(null) }}
              style={{
                padding: '10px 28px', background: 'linear-gradient(135deg,#0052cc,#0088d4)',
                border: 'none', borderRadius: 8, color: '#ffffff',
                fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.5px',
                boxShadow: '0 4px 18px rgba(0,136,212,0.45)',
              }}
            >
              🔬 Dive into This Region
            </button>
            <button
              onClick={() => setDiveRegion(null)}
              style={{
                marginTop: 6, padding: '4px 12px', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                color: '#8ba7bb', fontSize: 10, cursor: 'pointer', display: 'block', width: '100%',
              }}
            >✕ Cancel</button>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 12, left: 12, fontSize: 10,
        color: 'rgba(139,167,187,0.8)', pointerEvents: 'none', lineHeight: 1.8,
        background: 'rgba(2,13,26,0.75)', padding: '4px 10px', borderRadius: 4, backdropFilter: 'blur(4px)',
      }}>
        🌍 <b>Drag</b> to rotate · <b>Scroll</b> to zoom · <b>Click ocean</b> to select region · <b>Click float</b> for profile
      </div>
    </div>
  )
}

function Badge({ keyName, value, highlight = false }: { keyName: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 4,
      background: highlight ? 'rgba(0,212,255,0.18)' : 'rgba(4, 27, 46, 0.88)',
      border: `1px solid ${highlight ? 'rgba(0,212,255,0.6)' : 'rgba(0,212,255,0.18)'}`,
      fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
      backdropFilter: 'blur(6px)',
      boxShadow: highlight ? '0 0 12px rgba(0,212,255,0.3)' : 'none',
    }}>
      <span style={{ color: 'rgba(139, 167, 187, 0.9)' }}>{keyName}:</span>
      <span style={{ color: highlight ? '#00ffff' : '#00d4ff', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
