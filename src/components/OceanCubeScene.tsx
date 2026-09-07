/**
 * OceanCubeScene.tsx - Google Earth-style 3D Indian Ocean Terrain Viewer
 * FIXED: bilinear interpolation + 5-pass smoothing = smooth terrain, no blocky India
 * FIXED: reduced vertical scale = gentle hills not cliffs
 * FIXED: no grid = clean ocean surface
 */
import { useEffect, useRef, useState, useCallback } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { SceneState, SelectedFloat } from "../types"
import { ArgoFloat, api } from "../services/api"
import Minimap from "./Minimap"

const TERR_W=100, TERR_D=60, SEG_W=160, SEG_D=96
const LON_MIN=55, LON_MAX=100, LAT_MIN=0, LAT_MAX=30
const OCEAN_SCALE=0.0015   // 2000m = 3 units below water
const LAND_SCALE =0.0008   // 300m elevation = 0.24 units — gentle, not cliffs

interface BBox{lat_min:number;lat_max:number;lon_min:number;lon_max:number}
interface CS{v:number;c:THREE.Color}
interface Probe{lat:number;lon:number;depth_m:number;isLand:boolean;elev?:number;screenX:number;screenY:number}
interface OceanCubeSceneProps{
  scene:SceneState;floats:ArgoFloat[];filteredFloats?:ArgoFloat[]
  onFloatSelect:(f:SelectedFloat)=>void;selectedFloat:SelectedFloat|null
  region:BBox;onRegionSelect?:(b:BBox)=>void
}

function wp(lat:number,lon:number,depth_m=0):THREE.Vector3{
  return new THREE.Vector3(
    (lon-LON_MIN)/(LON_MAX-LON_MIN)*TERR_W-TERR_W/2,
    -depth_m*OCEAN_SCALE,
    TERR_D/2-(lat-LAT_MIN)/(LAT_MAX-LAT_MIN)*TERR_D)
}
function xzll(x:number,z:number):{lat:number;lon:number}{
  return{lat:LAT_MIN+(TERR_D/2-z)/TERR_D*(LAT_MAX-LAT_MIN),lon:LON_MIN+(x+TERR_W/2)/TERR_W*(LON_MAX-LON_MIN)}
}
function lerp(val:number,stops:CS[]):THREE.Color{
  if(val<=stops[0].v)return stops[0].c.clone()
  if(val>=stops[stops.length-1].v)return stops[stops.length-1].c.clone()
  for(let i=0;i<stops.length-1;i++)if(val>=stops[i].v&&val<=stops[i+1].v)
    return new THREE.Color().lerpColors(stops[i].c,stops[i+1].c,(val-stops[i].v)/(stops[i+1].v-stops[i].v))
  return stops[0].c.clone()
}
function bilin(elev:number[][],lf:number,of:number,rows:number,cols:number):number{
  const i0=Math.max(0,Math.min(rows-2,Math.floor(lf*(rows-1))))
  const j0=Math.max(0,Math.min(cols-2,Math.floor(of*(cols-1))))
  const t=lf*(rows-1)-i0,s=of*(cols-1)-j0
  return(elev[i0]?.[j0]??-1000)*(1-t)*(1-s)+(elev[i0+1]?.[j0]??-1000)*t*(1-s)+(elev[i0]?.[j0+1]??-1000)*(1-t)*s+(elev[i0+1]?.[j0+1]??-1000)*t*s
}
const TEMP=[{v:2,c:new THREE.Color(0x2c1654)},{v:8,c:new THREE.Color(0x1a237e)},{v:14,c:new THREE.Color(0x0288d1)},{v:20,c:new THREE.Color(0x00897b)},{v:26,c:new THREE.Color(0xcddc39)},{v:32,c:new THREE.Color(0xc62828)}]
const SAL =[{v:30,c:new THREE.Color(0x4a0e8f)},{v:33,c:new THREE.Color(0x1565c0)},{v:35,c:new THREE.Color(0x0288d1)},{v:37,c:new THREE.Color(0x26a69a)},{v:38,c:new THREE.Color(0xf9a825)}]
const SPD =[{v:0,c:new THREE.Color(0x000033)},{v:0.4,c:new THREE.Color(0x003087)},{v:0.8,c:new THREE.Color(0x0088bb)},{v:1.2,c:new THREE.Color(0x00dd88)},{v:1.5,c:new THREE.Color(0xffffff)}]
const LAND=[{v:0,c:new THREE.Color(0xd4b483)},{v:30,c:new THREE.Color(0x6aaa4a)},{v:150,c:new THREE.Color(0x4a7c35)},{v:400,c:new THREE.Color(0x8b7040)},{v:1000,c:new THREE.Color(0x888888)}]
const FLOOR=[{v:0,c:new THREE.Color(0x1a7090)},{v:200,c:new THREE.Color(0x0e4d6e)},{v:1000,c:new THREE.Color(0x071c30)},{v:4000,c:new THREE.Color(0x030810)}]
function dColor(norm:number,v:string,mn:number,mx:number):THREE.Color{
  const val=mn+norm*(mx-mn)
  return v==="salinity"?lerp(val,SAL):v==="current_speed"?lerp(val,SPD):lerp(val,TEMP)
}
// ── Photorealistic Gerstner Ocean Surface Shaders ─────────────────────────
const WVERT = /* glsl */`
  uniform float uTime;
  varying vec2  vUv;
  varying float vWaveHeight;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  // Gerstner wave function — steepness Q, amplitude A, direction (kx,kz)
  vec3 gerstner(vec3 pos, float Q, float A, float kx, float kz, float speed) {
    float k = length(vec2(kx,kz));
    float w = sqrt(9.81 * k);
    float phi = kx * pos.x + kz * pos.z - w * uTime * speed;
    float Qa = Q * A;
    return vec3(
      Qa * kx/k * cos(phi),
      A  * sin(phi),
      Qa * kz/k * cos(phi)
    );
  }

  void main() {
    vUv = uv;
    vec3 p = position;

    // 6 layered Gerstner waves — creates realistic choppy ocean
    vec3 d = vec3(0.0);
    d += gerstner(p, 0.6, 1.4,  0.28, 0.12, 1.10);  // Long swell NE
    d += gerstner(p, 0.5, 0.9, -0.18, 0.35, 0.95);  // Cross swell NW
    d += gerstner(p, 0.4, 0.6,  0.55, 0.25, 1.30);  // Short chop
    d += gerstner(p, 0.3, 0.4,  0.10,-0.48, 1.60);  // Ripple S
    d += gerstner(p, 0.2, 0.3,  0.72, 0.08, 2.00);  // High-freq chop
    d += gerstner(p, 0.2, 0.2, -0.35, 0.60, 1.75);  // Texture

    p += d;
    vWaveHeight = d.y;   // for foam detection
    vWorldPos   = p;

    // Finite-difference normals
    float eps = 0.5;
    vec3 px = position + vec3(eps,0,0);
    vec3 pz = position + vec3(0,0,eps);
    vec3 dx = vec3(eps,0,0);
    vec3 dz = vec3(0,0,eps);
    // simple normal approximation
    dx += gerstner(px,0.6,1.4,0.28,0.12,1.10)+gerstner(px,0.5,0.9,-0.18,0.35,0.95);
    dz += gerstner(pz,0.6,1.4,0.28,0.12,1.10)+gerstner(pz,0.5,0.9,-0.18,0.35,0.95);
    vNormal = normalize(cross(dz - d, dx - d));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const WFRAG = /* glsl */`
  uniform float uTime;
  varying vec2  vUv;
  varying float vWaveHeight;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    // Deep ocean gradient — abyss dark to shallow turquoise
    vec3 deepCol    = vec3(0.008, 0.035, 0.12);
    vec3 midCol     = vec3(0.015, 0.12,  0.35);
    vec3 shallowCol = vec3(0.03,  0.48,  0.72);
    vec3 foamCol    = vec3(0.80,  0.92,  1.00);

    // Blend by wave height
    float hFac = clamp(vWaveHeight / 2.0, 0.0, 1.0);
    vec3 baseColor = mix(deepCol, midCol, 0.5 + hFac * 0.5);
    baseColor = mix(baseColor, shallowCol, hFac * 0.35);

    // Specular highlight — sun-like glint
    vec3 lightDir  = normalize(vec3(0.6, 1.0, 0.4));
    vec3 viewDir   = normalize(vec3(0.0, 1.0, 0.3));
    vec3 halfVec   = normalize(lightDir + viewDir);
    float spec     = pow(max(dot(vNormal, halfVec), 0.0), 180.0);
    float spec2    = pow(max(dot(vNormal, halfVec), 0.0), 40.0) * 0.15;
    vec3 specColor = vec3(0.95, 0.97, 1.00) * (spec + spec2);

    // Foam on wave crests
    float foamFac = smoothstep(0.8, 1.8, vWaveHeight);
    // Micro-foam pattern
    float foamNoise =
      sin(vUv.x * 120.0 + uTime * 2.5) * sin(vUv.y * 95.0 + uTime * 2.0) * 0.5 + 0.5;
    foamFac = mix(foamFac, foamFac * foamNoise, 0.6);
    vec3 color = mix(baseColor, foamCol, foamFac * 0.75);

    // Caustic shimmer texture across whole surface
    float caustic1 = abs(sin(vUv.x * 22.0 + uTime * 1.2) * sin(vUv.y * 18.0 + uTime * 0.9));
    float caustic2 = abs(sin(vUv.x * 35.0 - uTime * 1.8) * sin(vUv.y * 28.0 + uTime * 1.4));
    float caustic  = pow(mix(caustic1, caustic2, 0.4), 3.0) * 0.12;
    color += vec3(caustic * 0.4, caustic * 0.8, caustic * 1.0);

    // Horizon fade — water gets darker/bluer at distance
    float distFade = clamp(length(vWorldPos.xz) / 70.0, 0.0, 1.0);
    color = mix(color, deepCol * 0.8, distFade * 0.55);

    // Add specular on top
    color += specColor;

    // Alpha: slightly transparent at edges, opaque in centre
    float alpha = mix(0.92, 0.78, distFade);

    gl_FragColor = vec4(color, alpha);
  }
`

export default function OceanCubeScene({scene,floats,filteredFloats,onFloatSelect,selectedFloat,region,onRegionSelect}:OceanCubeSceneProps){
  const mountRef=useRef<HTMLDivElement>(null),rendererRef=useRef<THREE.WebGLRenderer|null>(null)
  const scene3Ref=useRef<THREE.Scene|null>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null)
  const controlsRef=useRef<OrbitControls|null>(null),terrainGeoRef=useRef<THREE.BufferGeometry|null>(null)
  const terrainMshRef=useRef<THREE.Mesh|null>(null),waveUni=useRef({uTime:{value:0}})
  const sliceGrpRef=useRef<THREE.Group|null>(null),floatGrpRef=useRef<THREE.Group|null>(null)
  const gliderGrpRef=useRef<THREE.Group|null>(null),arrowGrpRef=useRef<THREE.Group|null>(null)
  const labelsGrpRef=useRef<THREE.Group|null>(null),floatMeshRef=useRef<THREE.InstancedMesh|null>(null)
  const floatDataRef=useRef<ArgoFloat[]>([]),rayRef=useRef(new THREE.Raycaster())
  const keysRef=useRef<Set<string>>(new Set()),walkModeRef=useRef(false),lookDragRef=useRef(false)
  const yawRef=useRef(0),pitchRef=useRef(-0.35),regionRef=useRef(region),slicePctRef=useRef(0)
  const billboards=useRef<THREE.Object3D[]>([])
  const[slicePct,setSlicePct]=useState(0),[walkMode,setWalkMode]=useState(false)
  const[probe,setProbe]=useState<Probe|null>(null),[walkPos,setWalkPos]=useState<{lat:number;lon:number;depth_m:number}|null>(null)
  const displayFloats=filteredFloats??floats
  useEffect(()=>{regionRef.current=region},[region])
  useEffect(()=>{slicePctRef.current=slicePct},[slicePct])
  useEffect(()=>{walkModeRef.current=walkMode},[walkMode])

  useEffect(()=>{
    const mount=mountRef.current;if(!mount)return
    const W=mount.clientWidth||900,H=mount.clientHeight||600
    const renderer=new THREE.WebGLRenderer({antialias:true})
    renderer.setSize(W,H);renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    renderer.setClearColor(0x060c18,1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2
    mount.appendChild(renderer.domElement);rendererRef.current=renderer
    const cam=new THREE.PerspectiveCamera(52,W/H,0.05,600)
    cam.position.set(0,18,28);cam.lookAt(0,0,0);cameraRef.current=cam
    // Ocean-blue night sky gradient background
    const s=new THREE.Scene()
    // Create gradient sky using a large sphere
    const skyGeo=new THREE.SphereGeometry(500,16,8)
    const skyMat=new THREE.ShaderMaterial({
      vertexShader:`varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 vPos;void main(){float t=clamp((normalize(vPos).y+0.1)/1.1,0.0,1.0);vec3 horizon=vec3(0.012,0.06,0.18);vec3 zenith=vec3(0.003,0.016,0.06);gl_FragColor=vec4(mix(horizon,zenith,t),1.0);}`,
      side:THREE.BackSide
    })
    s.add(new THREE.Mesh(skyGeo,skyMat))
    s.fog=new THREE.Fog(0x060c18,300,550);scene3Ref.current=s
    const ctrl=new OrbitControls(cam,renderer.domElement)
    ctrl.enableDamping=true;ctrl.dampingFactor=0.07;ctrl.rotateSpeed=0.6;ctrl.panSpeed=1.5
    ctrl.zoomSpeed=1.2;ctrl.enablePan=true;ctrl.screenSpacePanning=true
    ctrl.minDistance=0.5;ctrl.maxDistance=220;ctrl.minPolarAngle=0;ctrl.maxPolarAngle=Math.PI*0.87
    ctrl.target.set(0,0,0);controlsRef.current=ctrl
    // Rich ocean lighting
    s.add(new THREE.HemisphereLight(0x6ab4ff, 0x001133, 1.2))  // sky=blue, ground=deep navy
    const sun=new THREE.DirectionalLight(0xfff2e0, 3.5)  // warm sun for wave speculars
    sun.position.set(60, 120, 40); s.add(sun)
    const fill=new THREE.DirectionalLight(0x0044aa, 0.8) // cool blue fill from below
    fill.position.set(-30, -5, -20); s.add(fill)
    const rim=new THREE.DirectionalLight(0x003366, 1.2)  // horizon rim light
    rim.position.set(0, 5, -80); s.add(rim)
    const sp=new Float32Array(800*3);for(let i=0;i<sp.length;i++)sp[i]=(Math.random()-0.5)*500
    const sg=new THREE.BufferGeometry();sg.setAttribute("position",new THREE.BufferAttribute(sp,3))
    s.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0x7799bb,size:0.5,transparent:true,opacity:0.3})))
    const tGeo=new THREE.PlaneGeometry(TERR_W,TERR_D,SEG_W,SEG_D);tGeo.rotateX(-Math.PI/2)
    const vc=(SEG_W+1)*(SEG_D+1),ca=new Float32Array(vc*3)
    for(let i=0;i<ca.length;i+=3){ca[i]=0.03;ca[i+1]=0.14;ca[i+2]=0.28}
    tGeo.setAttribute("color",new THREE.Float32BufferAttribute(ca,3))
    terrainGeoRef.current=tGeo
    const tMsh=new THREE.Mesh(tGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.82,metalness:0.06}))
    tMsh.name="terrain";terrainMshRef.current=tMsh;s.add(tMsh)
    // High-resolution ocean surface for smooth Gerstner waves
    const wGeo=new THREE.PlaneGeometry(TERR_W,TERR_D,220,130);wGeo.rotateX(-Math.PI/2)
    const wMat=new THREE.ShaderMaterial({
      vertexShader:WVERT,
      fragmentShader:WFRAG,
      uniforms:waveUni.current,
      transparent:true,
      depthWrite:false,
      side:THREE.DoubleSide,
    })
    const wMsh=new THREE.Mesh(wGeo,wMat);wMsh.position.y=0.05;wMsh.name="water";s.add(wMsh)
    // Second slightly-offset layer for depth/parallax illusion
    const wGeo2=new THREE.PlaneGeometry(TERR_W,TERR_D,80,50);wGeo2.rotateX(-Math.PI/2)
    const wMat2=new THREE.ShaderMaterial({
      vertexShader:WVERT,
      fragmentShader:WFRAG,
      uniforms:{uTime:{value:0.8}}, // phase-shifted
      transparent:true,
      depthWrite:false,
      side:THREE.DoubleSide,
    })
    const wMsh2=new THREE.Mesh(wGeo2,wMat2);wMsh2.position.y=-0.25;wMsh2.name="water2";s.add(wMsh2)
    const bb:THREE.Object3D[]=[]
    ;[0,200,500,1000,1500,2000].forEach(d=>{
      const y=-d*OCEAN_SCALE
      const cv=document.createElement("canvas");cv.width=200;cv.height=44
      const ctx=cv.getContext("2d")!;ctx.fillStyle=d===0?"#00d4ff":"rgba(180,215,235,0.9)"
      ctx.font=`bold ${d===0?16:13}px monospace`;ctx.textAlign="right";ctx.fillText(d===0?"Surface  ":`${d} m  `,195,28)
      const lbl=new THREE.Mesh(new THREE.PlaneGeometry(3.0,0.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}))
      lbl.position.set(-TERR_W/2-2.0,y,0);s.add(lbl);bb.push(lbl)
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-TERR_W/2-0.15,y,0),new THREE.Vector3(-TERR_W/2+0.1,y,0)]),new THREE.LineBasicMaterial({color:0x446688,transparent:true,opacity:0.5})))
    })
    billboards.current=bb
    const mk=(n:string)=>{const g=new THREE.Group();g.name=n;s.add(g);return g}
    sliceGrpRef.current=mk("slice");floatGrpRef.current=mk("floats");gliderGrpRef.current=mk("glider")
    arrowGrpRef.current=mk("arrows");labelsGrpRef.current=mk("labels")
    const onKD=(e:KeyboardEvent)=>{keysRef.current.add(e.key.toLowerCase());if(e.key==="Escape"&&walkModeRef.current){setWalkMode(false);walkModeRef.current=false;ctrl.enabled=true}}
    const onKU=(e:KeyboardEvent)=>keysRef.current.delete(e.key.toLowerCase())
    const onMD=(e:MouseEvent)=>{if(walkModeRef.current&&e.button===0)lookDragRef.current=true}
    const onMU=()=>{lookDragRef.current=false}
    const onMM=(e:MouseEvent)=>{if(walkModeRef.current&&lookDragRef.current){yawRef.current-=(e.movementX||0)*0.002;pitchRef.current=Math.max(-1.3,Math.min(0.7,pitchRef.current-(e.movementY||0)*0.002))}}
    window.addEventListener("keydown",onKD);window.addEventListener("keyup",onKU)
    renderer.domElement.addEventListener("mousedown",onMD);renderer.domElement.addEventListener("mouseup",onMU);renderer.domElement.addEventListener("mousemove",onMM)
    let animId=0,lastT=0
    const animate=(ts:number)=>{
      animId=requestAnimationFrame(animate)
      const dt=Math.min(0.05,(ts-lastT)/1000);lastT=ts
      waveUni.current.uTime.value+=dt*0.95
      // sync second wave layer
      const wMsh2=s.getObjectByName("water2") as THREE.Mesh|undefined
      if(wMsh2&&(wMsh2.material as THREE.ShaderMaterial).uniforms?.uTime){
        ;(wMsh2.material as THREE.ShaderMaterial).uniforms.uTime.value+=dt*0.95
      }
      const cy=cam.position.y
      if(cy<0){
        // Underwater: deep teal/navy fog with caustic blue tint
        const t=Math.min(1,Math.abs(cy)/8)
        const uwFog=new THREE.Color().lerpColors(new THREE.Color(0x001830),new THREE.Color(0x000510),t)
        renderer.setClearColor(uwFog.getHex(),1)
        s.fog=new THREE.FogExp2(uwFog.getHex(),0.018+t*0.03)
        // Fade ocean surface (hide from below)
        const wSurf=s.getObjectByName("water") as THREE.Mesh|undefined
        if(wSurf)wSurf.visible=false
      } else {
        renderer.setClearColor(0x060c18,1)
        s.fog=new THREE.Fog(0x060c18,300,550)
        const wSurf=s.getObjectByName("water") as THREE.Mesh|undefined
        if(wSurf)wSurf.visible=true
      }
      if(walkModeRef.current){
        ctrl.enabled=false
        const spd=0.25,fwd=new THREE.Vector3(-Math.sin(yawRef.current)*Math.cos(pitchRef.current),Math.sin(pitchRef.current),-Math.cos(yawRef.current)*Math.cos(pitchRef.current))
        const rgt=new THREE.Vector3(Math.cos(yawRef.current),0,-Math.sin(yawRef.current))
        const k=keysRef.current
        if(k.has("w"))cam.position.addScaledVector(fwd,spd);if(k.has("s"))cam.position.addScaledVector(fwd,-spd)
        if(k.has("a"))cam.position.addScaledVector(rgt,-spd);if(k.has("d"))cam.position.addScaledVector(rgt,spd)
        if(k.has("e"))cam.position.y+=spd*0.5;if(k.has("q"))cam.position.y-=spd*0.5
        cam.position.x=Math.max(-TERR_W/2-12,Math.min(TERR_W/2+12,cam.position.x))
        cam.position.z=Math.max(-TERR_D/2-12,Math.min(TERR_D/2+12,cam.position.z))
        cam.rotation.order="YXZ";cam.rotation.y=yawRef.current;cam.rotation.x=pitchRef.current
        const ll=xzll(cam.position.x,cam.position.z);setWalkPos({...ll,depth_m:Math.max(0,-cam.position.y/OCEAN_SCALE)})
      }else{ctrl.enabled=true;ctrl.update();setWalkPos(null)}
      bb.forEach(b=>b.quaternion.copy(cam.quaternion))
      labelsGrpRef.current?.children.forEach(b=>b.quaternion.copy(cam.quaternion))
      renderer.render(s,cam)
    }
    animate()
    const onR=()=>{const nw=mount.clientWidth,nh=mount.clientHeight;cam.aspect=nw/nh;cam.updateProjectionMatrix();renderer.setSize(nw,nh)}
    const obs=new ResizeObserver(onR);obs.observe(mount)
    return()=>{cancelAnimationFrame(animId);obs.disconnect();ctrl.dispose();window.removeEventListener("keydown",onKD);window.removeEventListener("keyup",onKU);renderer.domElement.removeEventListener("mousedown",onMD);renderer.domElement.removeEventListener("mouseup",onMU);renderer.domElement.removeEventListener("mousemove",onMM);renderer.dispose();if(mount.contains(renderer.domElement))mount.removeChild(renderer.domElement)}
  },[])

  // GEBCO terrain: bilinear interp + 5-pass smoothing + edge fade = smooth terrain
  useEffect(()=>{
    let cancelled=false
    const geo=terrainGeoRef.current;if(!geo)return
    api.gebcoGrid().then((data:any)=>{
      if(cancelled||!data.elevation?.length)return
      const rows=data.lat.length,cols=data.lon.length
      const posAttr=geo.attributes.position as THREE.BufferAttribute
      const colAttr=geo.attributes.color as THREE.BufferAttribute
      const vc=(SEG_W+1)*(SEG_D+1)
      const rawY=new Float32Array(vc),rawElev=new Float32Array(vc)
      for(let vi=0;vi<vc;vi++){
        const x=posAttr.getX(vi),z=posAttr.getZ(vi)
        const lon=LON_MIN+(x+TERR_W/2)/TERR_W*(LON_MAX-LON_MIN)
        const lat=LAT_MIN+(TERR_D/2-z)/TERR_D*(LAT_MAX-LAT_MIN)
        const lf=Math.max(0,Math.min(1,(lat-data.lat[0])/(data.lat[rows-1]-data.lat[0])))
        const of=Math.max(0,Math.min(1,(lon-data.lon[0])/(data.lon[cols-1]-data.lon[0])))
        // Edge fade: taper land height to 0 at terrain boundary
        const ex=Math.min(x+TERR_W/2,TERR_W/2-x)/8.0
        const ez=Math.min(z+TERR_D/2,TERR_D/2-z)/6.0
        const edgeFade=Math.min(1.0,Math.max(0,ex)*Math.max(0,ez))
        const elev=bilin(data.elevation,lf,of,rows,cols)
        rawElev[vi]=elev
        rawY[vi]=elev>=0?elev*LAND_SCALE*edgeFade:-Math.abs(elev)*OCEAN_SCALE
      }
      // 5-pass smoothing with 5x5 kernel
      const smooth=new Float32Array(rawY)
      for(let pass=0;pass<5;pass++){
        const tmp=new Float32Array(smooth)
        for(let i=0;i<=SEG_D;i++)for(let j=0;j<=SEG_W;j++){
          let sum=0,cnt=0
          for(let di=-2;di<=2;di++)for(let dj=-2;dj<=2;dj++){
            const ni=i+di,nj=j+dj
            if(ni>=0&&ni<=SEG_D&&nj>=0&&nj<=SEG_W){sum+=tmp[ni*(SEG_W+1)+nj];cnt++}
          }
          smooth[i*(SEG_W+1)+j]=sum/cnt
        }
      }
      for(let vi=0;vi<vc;vi++){
        posAttr.setY(vi,smooth[vi])
        const e=rawElev[vi]
        const col=e>=0?lerp(e,LAND):lerp(Math.abs(e),FLOOR)
        colAttr.setXYZ(vi,col.r,col.g,col.b)
      }
      posAttr.needsUpdate=true;colAttr.needsUpdate=true;geo.computeVertexNormals()
      // City labels
      const labGrp=labelsGrpRef.current;if(!labGrp)return;labGrp.clear()
      const cities=[
        {lat:13.1,lon:80.3,name:"Chennai",color:"#f87171"},
        {lat:19.1,lon:72.9,name:"Mumbai",color:"#fbbf24"},
        {lat:22.6,lon:88.4,name:"Kolkata",color:"#34d399"},
        {lat:6.9,lon:79.9,name:"Colombo",color:"#a78bfa"},
        {lat:17.4,lon:78.5,name:"Hyderabad",color:"#fb923c"},
        {lat:28.6,lon:77.2,name:"Delhi",color:"#f472b6"},
      ]
      cities.forEach(c=>{
        const lf2=Math.max(0,Math.min(1,(c.lat-data.lat[0])/(data.lat[rows-1]-data.lat[0])))
        const of2=Math.max(0,Math.min(1,(c.lon-data.lon[0])/(data.lon[cols-1]-data.lon[0])))
        const ce=bilin(data.elevation,lf2,of2,rows,cols)
        const baseY=ce>=0?ce*LAND_SCALE:0
        const p=wp(c.lat,c.lon)
        const cv=document.createElement("canvas");cv.width=200;cv.height=48
        const ctx=cv.getContext("2d")!;ctx.fillStyle=c.color;ctx.font="bold 15px Inter,sans-serif";ctx.textAlign="center";ctx.fillText(c.name,100,30)
        const lbl=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.58),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}))
        lbl.position.set(p.x,baseY+0.85,p.z);lbl.name="city-label";labGrp.add(lbl)
        labGrp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x,baseY+0.02,p.z),new THREE.Vector3(p.x,baseY+0.75,p.z)]),new THREE.LineBasicMaterial({color:c.color,transparent:true,opacity:0.85})))
        const dot=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),new THREE.MeshBasicMaterial({color:c.color}))
        dot.position.set(p.x,baseY+0.15,p.z);labGrp.add(dot)
      })
    }).catch(console.error)
    return()=>{cancelled=true}
  },[])

  useEffect(()=>{
    const grp=sliceGrpRef.current;if(!grp)return;grp.clear()
    if(!scene.show_model)return
    const depthM=(slicePct/100)*2000,sliceY=-depthM*OCEAN_SCALE
    const variable=scene.variable==="current_speed"?"temperature":scene.variable
    api.modelDepthSlice(variable,depthM,Math.round(scene.time_index/100*11)).then((data:any)=>{
      if(!data?.values?.length)return
      const{lat:lats,lon:lons,values,vmin,vmax}=data
      const sL=Math.max(1,Math.floor(lats.length/40)),sO=Math.max(1,Math.floor(lons.length/60))
      const pos:number[]=[],cols:number[]=[],idx:number[]=[]
      for(let i=0;i<lats.length-sL;i+=sL)for(let j=0;j<lons.length-sO;j+=sO){
        const val=values[i]?.[j];if(val==null)continue
        const norm=Math.max(0,Math.min(1,(val-vmin)/((vmax-vmin)||1)))
        const col=dColor(norm,variable,vmin,vmax)
        const x0=(lons[j]-LON_MIN)/(LON_MAX-LON_MIN)*TERR_W-TERR_W/2
        const x1=(lons[j+sO]-LON_MIN)/(LON_MAX-LON_MIN)*TERR_W-TERR_W/2
        const z0=TERR_D/2-(lats[i]-LAT_MIN)/(LAT_MAX-LAT_MIN)*TERR_D
        const z1=TERR_D/2-(lats[i+sL]-LAT_MIN)/(LAT_MAX-LAT_MIN)*TERR_D
        const base=pos.length/3
        ;[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].forEach(([x,z])=>{pos.push(x,sliceY,z);cols.push(col.r,col.g,col.b)})
        idx.push(base,base+1,base+2,base,base+2,base+3)
      }
      if(!pos.length)return
      const geo=new THREE.BufferGeometry()
      geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3))
      geo.setAttribute("color",new THREE.Float32BufferAttribute(cols,3))
      geo.setIndex(idx);geo.computeVertexNormals()
      grp.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:scene.opacity*0.88,side:THREE.DoubleSide,depthWrite:false})))
    }).catch(console.error)
  },[scene.show_model,scene.variable,scene.opacity,scene.time_index,slicePct])

  useEffect(()=>{
    const grp=floatGrpRef.current;if(!grp)return;grp.clear();floatDataRef.current=displayFloats
    if(!scene.show_argo||!displayFloats.length)return
    const src=displayFloats.slice(0,800);floatDataRef.current=src
    const mesh=new THREE.InstancedMesh(new THREE.SphereGeometry(0.22,10,10),new THREE.MeshPhongMaterial({shininess:110,transparent:true,opacity:Math.min(1,scene.opacity*1.2)}),src.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.name="argo-inst"
    const dummy=new THREE.Object3D(),tPos:number[]=[]
    src.forEach((f,i)=>{
      const p=wp(f.latitude,f.longitude,0);p.y=0.32
      dummy.position.copy(p);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)
      mesh.setColorAt(i,lerp(f.temp_surface??25,TEMP))
      tPos.push(p.x,0.32,p.z,p.x,-Math.min(2000,f.pres_max??500)*OCEAN_SCALE,p.z)
    })
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
    grp.add(mesh);floatMeshRef.current=mesh
    const tGeo=new THREE.BufferGeometry();tGeo.setAttribute("position",new THREE.Float32BufferAttribute(tPos,3))
    grp.add(new THREE.LineSegments(tGeo,new THREE.LineBasicMaterial({color:0x44aacc,transparent:true,opacity:0.2})))
  },[displayFloats,scene.show_argo,scene.opacity])

  useEffect(()=>{
    const grp=gliderGrpRef.current;if(!grp)return;grp.clear()
    if(!scene.show_glider)return
    api.gliderTrajectory().then((data:any)=>{
      if(!data?.waypoints?.length)return
      const pts=(data.waypoints as any[]).map((w:any)=>wp(w.lat,w.lon,w.depth_m??50))
      grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x00ff88,transparent:true,opacity:0.92})))
      pts.filter((_,i)=>i%7===0).forEach(p=>{const m=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),new THREE.MeshBasicMaterial({color:0x34d399}));m.position.copy(p);grp.add(m)})
    }).catch(console.error)
  },[scene.show_glider])

  useEffect(()=>{
    const grp=arrowGrpRef.current;if(!grp)return;grp.clear()
    if(!scene.show_currents)return
    const depthM=(slicePctRef.current/100)*2000,tIdx=Math.round(scene.time_index/100*11)
    Promise.all([api.modelDepthSlice("u_current",depthM,tIdx),api.modelDepthSlice("v_current",depthM,tIdx)]).then(([uF,vF]:any[])=>{
      if(!uF.values||!vF.values)return
      const{lat:lats,lon:lons}=uF,sL=Math.max(1,Math.floor(lats.length/10)),sO=Math.max(1,Math.floor(lons.length/14))
      for(let i=0;i<lats.length;i+=sL)for(let j=0;j<lons.length;j+=sO){
        const u=uF.values[i]?.[j],v=vF.values[i]?.[j];if(u==null||v==null)continue
        const spd=Math.sqrt(u*u+v*v);if(!isFinite(spd)||spd<0.005)continue
        grp.add(new THREE.ArrowHelper(new THREE.Vector3(u,0,-v).normalize(),wp(lats[i],lons[j],depthM),Math.min(1.8,spd*4),spd>0.35?0x00ffff:0x0077bb,0.35,0.2))
      }
    }).catch(console.error)
  },[scene.show_currents,scene.time_index,slicePct])

  useEffect(()=>{
    const grp=floatGrpRef.current;if(!grp)return
    grp.children.filter(c=>c.name==="sel-ring").forEach(c=>grp.remove(c))
    if(!selectedFloat)return
    const p=wp(selectedFloat.latitude,selectedFloat.longitude,0);p.y=0.35
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.36,0.55,32),new THREE.MeshBasicMaterial({color:0xffff00,side:THREE.DoubleSide,transparent:true,opacity:0.95}))
    ring.position.copy(p);ring.rotation.x=-Math.PI/2;ring.name="sel-ring";grp.add(ring)
  },[selectedFloat])

  const handleMouseMove=useCallback((e:React.MouseEvent<HTMLDivElement>)=>{
    if(walkModeRef.current)return
    const mount=mountRef.current,cam=cameraRef.current;if(!mount||!cam)return
    const rect=mount.getBoundingClientRect()
    const ndc=new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1)
    rayRef.current.setFromCamera(ndc,cam)
    const terr=terrainMshRef.current
    if(terr){
      const hits=rayRef.current.intersectObject(terr)
      if(hits.length>0){
        const pt=hits[0].point,ll=xzll(pt.x,pt.z),isLand=pt.y>0.04
        setProbe({...ll,depth_m:isLand?0:Math.max(0,-pt.y/OCEAN_SCALE),isLand,elev:isLand?Math.round(pt.y/LAND_SCALE):undefined,screenX:e.clientX,screenY:e.clientY})
        return
      }
    }
    setProbe(null)
  },[])

  const handleClick=useCallback((e:React.MouseEvent<HTMLDivElement>)=>{
    if(walkModeRef.current)return
    const mount=mountRef.current,cam=cameraRef.current;if(!mount||!cam||!floatMeshRef.current)return
    const rect=mount.getBoundingClientRect()
    rayRef.current.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1),cam)
    const hits=rayRef.current.intersectObject(floatMeshRef.current)
    if(hits.length>0){const idx=hits[0].instanceId??-1;if(idx>=0&&idx<floatDataRef.current.length){const f=floatDataRef.current[idx];onFloatSelect({platform_number:f.platform_number,cycle_number:f.cycle_number,latitude:f.latitude,longitude:f.longitude,time:f.time})}}
  },[onFloatSelect])

  const flyTo=useCallback((pos:THREE.Vector3,tgt=new THREE.Vector3(0,0,0))=>{
    const cam=cameraRef.current,ctrl=controlsRef.current;if(!cam||!ctrl)return
    if(walkMode){setWalkMode(false);walkModeRef.current=false;ctrl.enabled=true}
    const sp=cam.position.clone(),st=ctrl.target.clone();let t=0
    const step=()=>{t+=0.04;const e=0.5-Math.cos(Math.min(1,t)*Math.PI)/2;cam.position.lerpVectors(sp,pos,e);ctrl.target.lerpVectors(st,tgt,e);ctrl.update();if(t<1)requestAnimationFrame(step)}
    step()
  },[walkMode])

  const depthM=Math.round((slicePct/100)*2000)

  return(
    <div style={{position:"relative",width:"100%",height:"100%",background:"#060c18"}}>
      <div ref={mountRef} onClick={handleClick} onMouseMove={handleMouseMove} onMouseLeave={()=>setProbe(null)}
        style={{width:"100%",height:"100%",cursor:walkMode?"crosshair":"default"}}/>
      {walkMode&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:30}}><div style={{width:20,height:2,background:"rgba(255,255,255,0.85)",marginBottom:-2}}/><div style={{width:2,height:20,background:"rgba(255,255,255,0.85)",marginLeft:9}}/></div>}
      {walkMode&&walkPos&&(
        <div style={{position:"absolute",top:"50%",right:16,transform:"translateY(-50%)",zIndex:30,background:"rgba(6,12,26,0.94)",border:"1px solid rgba(0,255,120,0.45)",borderRadius:10,padding:"14px 18px",backdropFilter:"blur(10px)",minWidth:200}}>
          <div style={{color:"#00ff88",fontSize:10,fontFamily:"JetBrains Mono,monospace",fontWeight:700,marginBottom:10,letterSpacing:1}}>WALK MODE — ESC to exit</div>
          {[{k:"LAT",v:`${walkPos.lat.toFixed(3)}N`},{k:"LON",v:`${walkPos.lon.toFixed(3)}E`},{k:"DEPTH",v:walkPos.depth_m<1?"Surface":`${Math.round(walkPos.depth_m)} m`}].map(({k,v})=>(<div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{color:"#8ba7bb",fontSize:10,fontFamily:"monospace"}}>{k}</span><span style={{color:"#e0f0ff",fontSize:10,fontFamily:"monospace",fontWeight:600}}>{v}</span></div>))}
          <div style={{marginTop:8,borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:8}}>
            {[["W/S","Fwd/Back"],["A/D","Strafe"],["Q/E","Down/Up"],["Drag","Look"]].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{color:"#ffcc44",fontSize:9,fontFamily:"monospace",background:"rgba(255,200,60,0.12)",padding:"1px 4px",borderRadius:3}}>{k}</span><span style={{color:"#8ba7bb",fontSize:9,fontFamily:"monospace"}}>{v}</span></div>))}
          </div>
        </div>
      )}
      {probe&&!walkMode&&(
        <div style={{position:"fixed",left:probe.screenX+14,top:probe.screenY-10,zIndex:40,pointerEvents:"none",background:"rgba(6,12,26,0.97)",border:"1px solid rgba(0,212,255,0.38)",borderRadius:8,padding:"8px 13px",backdropFilter:"blur(10px)",fontSize:11,fontFamily:"JetBrains Mono,monospace",minWidth:185}}>
          <div style={{color:"#00d4ff",fontWeight:700,marginBottom:4}}>&#128205; {probe.lat.toFixed(3)}N  {probe.lon.toFixed(3)}E</div>
          {probe.isLand?<div style={{color:"#a3c98a"}}>Land  {probe.elev!=null?`+${probe.elev} m`:""}</div>:<div style={{color:"#7cc8e0"}}>{probe.depth_m<1?"Sea Surface":`${Math.round(probe.depth_m)} m depth`}</div>}
        </div>
      )}
      <div style={{position:"absolute",top:12,right:14,display:"flex",gap:5,zIndex:20,flexWrap:"wrap",justifyContent:"flex-end"}}>
        {[
          {id:"birds-eye",lbl:"Bird's Eye",px:0,py:80,pz:0.001,tx:0,ty:0,tz:0},
          {id:"india",    lbl:"India Coast",px:18,py:22,pz:8,  tx:14,ty:0,tz:5},
          {id:"arabian",  lbl:"Arabian Sea",px:-20,py:18,pz:5, tx:-15,ty:0,tz:-5},
          {id:"bengal",   lbl:"Bay of Bengal",px:32,py:18,pz:5,tx:28,ty:0,tz:-5},
          {id:"dive",     lbl:"Underwater",px:0,py:-3.5,pz:12, tx:0,ty:-2,tz:0},
          {id:"chennai",  lbl:"Chennai",px:22,py:2,pz:18,      tx:22,ty:0,tz:18},
        ].map(v=>(<button key={v.id} id={`view-${v.id}`} onClick={()=>flyTo(new THREE.Vector3(v.px,v.py,v.pz),new THREE.Vector3(v.tx,v.ty,v.tz))} style={{padding:"6px 10px",background:"rgba(6,12,26,0.92)",border:"1px solid rgba(0,212,255,0.32)",borderRadius:6,color:"#cde8f5",fontSize:10,fontFamily:"Inter,sans-serif",fontWeight:600,cursor:"pointer",backdropFilter:"blur(8px)"}}>{v.lbl}</button>))}
        <button onClick={()=>{const n=!walkMode;setWalkMode(n);walkModeRef.current=n;if(controlsRef.current)controlsRef.current.enabled=!n;if(n&&cameraRef.current)cameraRef.current.position.set(8,0.6,15)}} style={{padding:"6px 12px",background:walkMode?"rgba(0,255,120,0.18)":"rgba(6,12,26,0.92)",border:`1px solid ${walkMode?"rgba(0,255,120,0.6)":"rgba(255,255,255,0.18)"}`,borderRadius:6,color:walkMode?"#00ff88":"#8ba7bb",fontSize:10,fontFamily:"Inter,sans-serif",fontWeight:700,cursor:"pointer",backdropFilter:"blur(8px)"}}>WALK</button>
      </div>
      <div style={{position:"absolute",top:12,left:12,zIndex:20,display:"flex",flexDirection:"column",gap:5,pointerEvents:"none"}}>
        {[{k:"VIEW",v:"3D Ocean Terrain",hi:true},{k:"REGION",v:`${region.lat_min}-${region.lat_max}N  ${region.lon_min}-${region.lon_max}E`},{k:"BUOYS",v:`${Math.min(displayFloats.length,800).toLocaleString()}`}].map(({k,v,hi})=>(<div key={k} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:4,backdropFilter:"blur(6px)",background:hi?"rgba(0,212,255,0.15)":"rgba(6,12,26,0.85)",border:`1px solid ${hi?"rgba(0,212,255,0.5)":"rgba(255,255,255,0.1)"}`,fontSize:10,fontFamily:"JetBrains Mono,monospace"}}><span style={{color:"#8ba7bb"}}>{k}:</span><span style={{color:hi?"#00d4ff":"#dceeff",fontWeight:600}}>{v}</span></div>))}
      </div>
      {scene.show_model&&(
        <div style={{position:"absolute",bottom:54,left:14,zIndex:20,background:"rgba(6,12,26,0.93)",border:"1px solid rgba(0,212,255,0.3)",borderRadius:10,padding:"12px 16px",backdropFilter:"blur(10px)",minWidth:240}}>
          <div style={{color:"#00d4ff",fontFamily:"JetBrains Mono,monospace",fontSize:10,fontWeight:700,marginBottom:8}}>DEPTH SLICE — {depthM===0?"SURFACE":`${depthM} m`}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:"#8ba7bb",fontSize:9,fontFamily:"monospace",width:50}}>0 m</span><input id="cube-depth-slider" type="range" min={0} max={100} value={slicePct} onChange={e=>setSlicePct(Number(e.target.value))} style={{flex:1,accentColor:"#00d4ff",cursor:"pointer"}}/><span style={{color:"#8ba7bb",fontSize:9,fontFamily:"monospace",width:52,textAlign:"right"}}>2000 m</span></div>
        </div>
      )}
      <div style={{position:"absolute",bottom:185,right:14,zIndex:20,background:"rgba(6,12,26,0.9)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px",backdropFilter:"blur(8px)",minWidth:170}}>
        <div style={{color:"#8ba7bb",fontSize:9,fontFamily:"monospace",fontWeight:700,marginBottom:6}}>LEGEND</div>
        {[{c:"#38bdf8",l:"Argo Float"},{c:"#34d399",l:"Glider track"},{c:"#ffff00",l:"Selected float"},{c:"#00ffff",l:"Currents"},{c:"#6aaa4a",l:"Land terrain"},{c:"#1a7090",l:"Ocean floor"}].map(({c,l})=>(<div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><div style={{width:9,height:9,borderRadius:"50%",background:c,flexShrink:0}}/><span style={{color:"#c8dce8",fontSize:10,fontFamily:"monospace"}}>{l}</span></div>))}
        <div style={{marginTop:7}}><div style={{color:"#8ba7bb",fontSize:9,fontFamily:"monospace",marginBottom:3}}>{scene.variable==="salinity"?"SALINITY":"TEMPERATURE"}</div><div style={{height:8,borderRadius:4,background:scene.variable==="salinity"?"linear-gradient(to right,#4a0e8f,#1565c0,#0288d1,#26a69a,#f9a825)":"linear-gradient(to right,#2c1654,#1a237e,#0288d1,#00897b,#cddc39,#c62828)"}}/></div>
      </div>
      <Minimap region={region} onRegionSelect={onRegionSelect}/>
      <div style={{position:"absolute",bottom:14,left:"50%",transform:"translateX(-50%)",pointerEvents:"none",zIndex:10,fontSize:10,color:"rgba(139,167,187,0.78)",fontFamily:"Inter,sans-serif",background:"rgba(6,12,26,0.82)",padding:"4px 18px",borderRadius:6,backdropFilter:"blur(4px)",whiteSpace:"nowrap"}}>
        Left-drag: rotate  |  Right-drag: pan  |  Scroll: zoom  |  WALK: fly through
      </div>
    </div>
  )
}
