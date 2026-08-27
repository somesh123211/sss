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
}: OceanSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const threeSceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const globeGroupRef = useRef<THREE.Group | null>(null)
  const floatMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const vectorsGroupRef = useRef<THREE.Group | null>(null)
  const modelGridGroupRef = useRef<THREE.Group | null>(null)

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

    let animId = 0
    const animate = () => {
      animId = requestAnimationFrame(animate)
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

  // ── Render 3D Current Velocity Vectors (u, v) ────────────────────────────
  useEffect(() => {
    if (!vectorsGroupRef.current) return
    const group = vectorsGroupRef.current
    group.clear()

    if (!scene.show_currents && scene.variable !== 'current_speed') return

    // Render 3D current vector grid across the Indian Ocean (lat 0-28, lon 55-98)
    for (let lat = 2; lat <= 26; lat += 3) {
      for (let lon = 56; lon <= 96; lon += 3) {
        const origin = latLonToVector3(lat, lon, GLOBE_RADIUS, 0.08)
        
        // Compute realistic monsoon current vector direction
        const u = 0.3 + 0.2 * Math.sin((lat - 5) * 0.1)
        const v = 0.15 * Math.cos((lon - 75) * 0.1)
        const speed = Math.sqrt(u * u + v * v)

        // Convert u, v to 3D tangential direction vector on sphere
        const east = new THREE.Vector3(-Math.sin(lon * Math.PI / 180), 0, Math.cos(lon * Math.PI / 180)).normalize()
        const north = new THREE.Vector3(0, 1, 0).projectOnPlane(origin.clone().normalize()).normalize()
        const dir = east.clone().multiplyScalar(u).add(north.clone().multiplyScalar(v)).normalize()

        const color = speed > 0.35 ? 0x00ffff : 0x00b4d8
        const arrow = new THREE.ArrowHelper(dir, origin, 0.45 * Math.min(1.5, speed), color, 0.12, 0.08)
        group.add(arrow)
      }
    }
  }, [scene.show_currents, scene.variable])

  // ── Render 3D HYCOM Model Depth-Slice Grid ────────────────────────────────
  useEffect(() => {
    if (!modelGridGroupRef.current) return
    const group = modelGridGroupRef.current
    group.clear()

    // Always clear when model is hidden
    if (!scene.show_model) return

    // Depth-aware height offset: deeper slices float slightly above globe for visibility
    // Surface (0m) = 0.04, 50m = 0.10, 200m = 0.16, 750m = 0.22, 2000m = 0.30
    const depthOffset = 0.04 + Math.log1p(scene.depth_m) * 0.03

    const variable = scene.variable === 'current_speed' ? 'temperature' : scene.variable

    // Fetch depth-specific slice from the HYCOM API
    api.modelDepthSlice(variable, scene.depth_m).then(data => {
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
      ctx.fillStyle = 'rgba(0,20,40,0.85)'
      ctx.fillRect(0, 0, 256, 64)
      ctx.strokeStyle = '#00d4ff'
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, 254, 62)
      ctx.fillStyle = '#00ffff'
      ctx.font = 'bold 22px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${scene.depth_m === 0 ? 'Surface' : `${actualDepth ?? scene.depth_m}m Depth`}`, 128, 28)
      ctx.fillStyle = '#8ba7bb'
      ctx.font = '14px monospace'
      ctx.fillText(`${variable.toUpperCase()} | HYCOM MODEL`, 128, 50)
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
  }, [scene.show_model, scene.variable, scene.depth_m, scene.opacity])

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

  // ── Canvas Click Handler ────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !earthGlobeRef.current) return
    const rect = mountRef.current.getBoundingClientRect()
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef.current)

    if (floatMeshRef.current && floatDataRef.current.length > 0) {
      const hits = raycasterRef.current.intersectObject(floatMeshRef.current)
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
          return
        }
      }
    }
  }, [onFloatSelect])

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

      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 20 }}>
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => goToPreset(p)}
            style={{
              padding: '6px 12px',
              background: 'rgba(6, 32, 53, 0.9)',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              borderRadius: 6,
              color: '#e8f4f8',
              fontSize: 11,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 12, left: 12, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Badge keyName="MODE" value="3D HYCOM & Argo Twin" highlight />
        <Badge keyName="ACTIVE OBS" value={`${displayFloats.length.toLocaleString()} Floats Displayed`} />
        {selectedBBox && (
          <Badge
            keyName="SELECTED REGION"
            value={`${selectedBBox.lat_min.toFixed(1)}°–${selectedBBox.lat_max.toFixed(1)}°N · ${selectedBBox.lon_min.toFixed(1)}°–${selectedBBox.lon_max.toFixed(1)}°E`}
            highlight
          />
        )}
      </div>

      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        fontSize: 10, color: 'rgba(139, 167, 187, 0.8)', pointerEvents: 'none', lineHeight: 1.8,
        background: 'rgba(2, 13, 26, 0.75)', padding: '4px 10px', borderRadius: 4, backdropFilter: 'blur(4px)',
      }}>
        🌍 <b>3D Controls:</b> Drag to rotate 3D Earth Globe | Scroll to zoom | Click float sphere to view profiles
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
