/**
 * OceanWorld3D.tsx — Full Immersive 3D Ocean World
 *
 * GEOGRAPHY: The mesh is geo-referenced to the real Indian Ocean.
 *   - Land masses (India, Arabia, Africa, SE Asia) are raised above sea level
 *   - Ocean floor follows realistic GEBCO-style bathymetry
 *   - Gerstner waves are masked to ocean areas only (no waves over land)
 *   - Lat/Lon grid perfectly aligned to geographic coordinates
 *
 * Camera starts at ~Google Earth "tilt" angle over the Indian Ocean.
 * WASD + mouse drag + scroll to navigate freely. Dive underwater with Q.
 *
 * Coordinate system:
 *   World X = Longitude mapped to [-WORLD_W/2, +WORLD_W/2] over [LON_MIN, LON_MAX]
 *   World Y = Height. Y=0 = sea surface. Y<0 = underwater. Y>0 = land/above sea.
 *   World Z = Latitude mapped to [-WORLD_D/2, +WORLD_D/2] over [LAT_MIN, LAT_MAX]
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { ArgoFloat, api } from '../services/api'
import { SceneState, SelectedFloat } from '../types'

// ── Geographic bounds ────────────────────────────────────────────────────────
const LON_MIN = 40,  LON_MAX = 110   // 70° of longitude
const LAT_MIN = -30, LAT_MAX = 35    // 65° of latitude
const WORLD_W = 4200                 // world units (width)
const WORLD_D = 3900                 // world units (depth)
const VERT_SCALE = 0.30              // 1m = 0.30 world units vertical
const LAND_RISE  = 120               // land surfaces raised 120 world units above Y=0

// ── Geo ↔ World conversions ──────────────────────────────────────────────────
function geoToWorld(lat: number, lon: number, depthM = 0): THREE.Vector3 {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * WORLD_W - WORLD_W / 2
  const z = ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * WORLD_D - WORLD_D / 2
  const y = -depthM * VERT_SCALE
  return new THREE.Vector3(x, y, z)
}
function worldToGeo(wx: number, wy: number, wz: number) {
  const lon    = LON_MIN + ((wx + WORLD_W / 2) / WORLD_W) * (LON_MAX - LON_MIN)
  const lat    = LAT_MIN + ((wz + WORLD_D / 2) / WORLD_D) * (LAT_MAX - LAT_MIN)
  const depthM = Math.max(0, -wy / VERT_SCALE)
  return { lat, lon, depthM }
}

// ── Indian Ocean Heightmap Generation ───────────────────────────────────────
// Returns a Float32Array (SIZE×SIZE) where:
//   0.0  = very deep ocean (5500m)
//   0.5  = sea level / shallow coast
//   >0.5 = land (higher = higher elevation)
// Also returns a separate Uint8Array land mask (0=ocean, 255=land)
function generateIndianOceanHeightmap(SIZE: number): { height: Float32Array; landMask: Uint8Array } {
  const height   = new Float32Array(SIZE * SIZE)
  const landMask = new Uint8Array(SIZE * SIZE)

  // Detailed Indian Ocean geography - land vs ocean classification
  function isLand(lat: number, lon: number): boolean {
    // ─── AFRICA (East coast) ──────────────────────────────────────────
    if (lon < 40) return false // outside domain — ocean
    // East Africa mainland
    if (lat > -30 && lat < 12 && lon > 29 && lon < 42) return true
    // Somalia / Horn of Africa
    if (lat > 2 && lat < 12 && lon > 41 && lon < 52) return true
    // Mozambique
    if (lat > -26 && lat < -15 && lon > 32 && lon < 36) return true
    // Madagascar
    if (lat > -26 && lat < -12 && lon > 43 && lon < 51) return true
    // Tanzania coast
    if (lat > -12 && lat < 0 && lon > 34 && lon < 41) return true
    // Kenya coast
    if (lat > 0 && lat < 5 && lon > 37 && lon < 42) return true

    // ─── ARABIAN PENINSULA ───────────────────────────────────────────
    // Yemen / Oman / UAE coast
    if (lat > 12 && lat < 24 && lon > 44 && lon < 60) return true
    // Oman (wraps east coast)
    if (lat > 16 && lat < 26 && lon > 56 && lon < 60) return true
    // UAE / Saudi coast (Gulf of Oman area)
    if (lat > 22 && lat < 27 && lon > 54 && lon < 59) return true

    // ─── IRAN / PAKISTAN ─────────────────────────────────────────────
    if (lat > 24 && lat < 32 && lon > 57 && lon < 68) return true
    // Makran coast
    if (lat > 23 && lat < 26 && lon > 60 && lon < 67) return true

    // ─── INDIA (main peninsula) ──────────────────────────────────────
    // Northern India / Himalayas
    if (lat > 22 && lat < 37 && lon > 68 && lon < 97) return true
    // Peninsula body (lat 8–22, lon 72–82)
    if (lat > 8 && lat < 22 && lon > 72 && lon < 82) return true
    // Kerala / Malabar coast (western narrow strip)
    if (lat > 8 && lat < 14 && lon > 74 && lon < 77) return true
    // Tamil Nadu / Coromandel coast
    if (lat > 8 && lat < 13 && lon > 77 && lon < 81) return true
    // Andhra / Odisha east coast (lon 80–86)
    if (lat > 13 && lat < 22 && lon > 80 && lon < 87) return true
    // Gujarat / Kutch (northwestern India)
    if (lat > 21 && lat < 25 && lon > 69 && lon < 75) return true
    // Kutch peninsula
    if (lat > 22 && lat < 24 && lon > 68 && lon < 72) return true
    // Saurashtra peninsula
    if (lat > 21 && lat < 23 && lon > 70 && lon < 73) return true

    // ─── SRI LANKA ───────────────────────────────────────────────────
    if (lat > 5.8 && lat < 10 && lon > 79.5 && lon < 82) return true

    // ─── ANDAMAN & NICOBAR (small islands — skip for simplicity) ─────

    // ─── MYANMAR / BANGLADESH / THAILAND ─────────────────────────────
    if (lat > 14 && lat < 28 && lon > 92 && lon < 100) return true
    if (lat > 20 && lat < 30 && lon > 87 && lon < 93) return true
    // Bangladesh coast
    if (lat > 21 && lat < 24 && lon > 88 && lon < 92) return true
    // Irrawaddy delta
    if (lat > 14 && lat < 18 && lon > 94 && lon < 98) return true

    // ─── MALAYSIA / INDONESIA (western tip) ──────────────────────────
    if (lat > 0 && lat < 8 && lon > 99 && lon < 110) return true
    if (lat > -10 && lat < 0 && lon > 104 && lon < 110) return true
    // Sumatra (western coast)
    if (lat > -6 && lat < 6 && lon > 95 && lon < 105) return true
    // Java (western part)
    if (lat > -8 && lat < -5 && lon > 104 && lon < 110) return true

    // ─── PAKISTAN coast ───────────────────────────────────────────────
    if (lat > 22 && lat < 27 && lon > 62 && lon < 68) return true

    return false
  }

  function oceanDepth(lat: number, lon: number): number {
    // Returns realistic ocean depth (0–5500m) for ocean areas
    // Based on known Indian Ocean bathymetry features

    // Arabian Sea (deep basin ~3500m average)
    if (lon > 56 && lon < 74 && lat > 5 && lat < 22) {
      return 3200 + Math.sin(lon * 0.4 + lat * 0.3) * 400
    }
    // Bay of Bengal (deep ~3500m)
    if (lon > 82 && lon < 96 && lat > 5 && lat < 20) {
      return 2800 + Math.sin(lon * 0.3 - lat * 0.25) * 500
    }
    // Mid-Indian Ocean (deep basin ~4000m)
    if (lat > -15 && lat < 5 && lon > 65 && lon < 90) {
      return 4200 + Math.sin(lon * 0.2 + lat * 0.15) * 600
    }
    // Southern Indian Ocean (very deep ~4500m)
    if (lat < -10) {
      return 4000 + (-lat) * 18 + Math.sin(lon * 0.15 + lat * 0.1) * 500
    }
    // Mid-ocean ridge (shallower ~2000m)
    if (Math.abs(lon - 67) < 5 && lat < 10) {
      return 1800 + Math.sin(lat * 0.8) * 400
    }
    // Coastal shallow (<200m)
    const distIndia = Math.sqrt(Math.pow(lat - 14, 2) * 0.7 + Math.pow(lon - 77, 2) * 0.7)
    if (distIndia < 4) return Math.max(20, distIndia * 50)
    // Gulf of Aden (moderate ~2500m)
    if (lat > 10 && lat < 15 && lon > 44 && lon < 52) return 2200
    // Red Sea (shallow ~500m)
    if (lat > 12 && lat < 30 && lon > 32 && lon < 44) return 500
    // Gulf of Oman (~3000m)
    if (lat > 22 && lat < 26 && lon > 57 && lon < 63) return 2800
    // Lakshadweep / Maldives shelf (shallow ~300m)
    if (Math.abs(lon - 73) < 2 && lat > -1 && lat < 12) return 300 + Math.random() * 200
    // Default
    return 3500 + Math.sin(lat * 0.2 + lon * 0.15) * 700
      + Math.sin(lat * 0.45 - lon * 0.3) * 350
      + Math.sin(lat * 0.9 + lon * 0.6) * 180
  }

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const lat = LAT_MIN + (row / (SIZE - 1)) * (LAT_MAX - LAT_MIN)
      const lon = LON_MIN + (col / (SIZE - 1)) * (LON_MAX - LON_MIN)
      const idx = row * SIZE + col

      if (isLand(lat, lon)) {
        // Land: height > 0.5 — scaled for visual effect
        // Approximate land elevation: India has Deccan Plateau ~600m, Ghats ~2000m
        let elev = 0.0
        // India Himalayas / high terrain
        if (lat > 25 && lon > 70 && lon < 97) elev = 0.4 + Math.sin(lat * 0.8 + lon * 0.5) * 0.15
        // Deccan plateau
        else if (lat > 15 && lat < 23 && lon > 73 && lon < 82) elev = 0.15 + Math.sin(lat * 2 + lon) * 0.06
        // Arabian Peninsula (mostly flat desert)
        else elev = 0.08 + Math.sin(lat * 1.2 + lon * 0.9) * 0.04
        height[idx]   = 0.55 + Math.min(0.4, elev)  // > 0.5 = land
        landMask[idx] = 255
      } else {
        // Ocean: depth-based 0→0.5 mapping
        const depth = oceanDepth(lat, lon)
        // Add high-frequency noise for terrain texture
        const noise = Math.sin(lat * 14.3 + lon * 11.7) * 80
                    + Math.sin(lat * 28.6 - lon * 22.1) * 40
                    + Math.sin(lat * 57.2 + lon * 45.3) * 20
        const finalDepth = Math.max(10, Math.min(5500, depth + noise))
        // Encode: 0=5500m deep, 0.5=sea level
        height[idx]   = Math.max(0, 0.5 - finalDepth / 11000.0)
        landMask[idx] = 0
      }
    }
  }
  return { height, landMask }
}

// ── GLSL Shaders ────────────────────────────────────────────────────────────

const WAVE_VERT = /* glsl */`
uniform float     uTime;
uniform float     uWaveScale;
uniform sampler2D uLandMask;   // 0=ocean, 1=land
varying vec2      vUv;
varying float     vHeight;
varying vec3      vWorldPos;
varying vec3      vNormal3;
varying float     vIsLand;

vec3 gerstner(vec3 pos, float Q, float A, float kx, float kz, float spd) {
  float k   = length(vec2(kx, kz)) + 0.0001;
  float w   = sqrt(9.81 * k);
  float phi = kx * pos.x + kz * pos.z - w * uTime * spd;
  float Qa  = Q * A * uWaveScale;
  float As  = A * uWaveScale;
  return vec3(Qa * (kx/k) * cos(phi), As * sin(phi), Qa * (kz/k) * cos(phi));
}

void main() {
  vUv      = uv;
  vIsLand  = texture2D(uLandMask, uv).r;  // 1.0 = land, 0.0 = ocean

  vec3 p = position;
  if (vIsLand < 0.5) {
    // Ocean area: apply Gerstner waves
    vec3 d = vec3(0.0);
    d += gerstner(p, 0.65, 2.8,  0.022,  0.010, 1.10);
    d += gerstner(p, 0.55, 1.8, -0.015,  0.028, 0.95);
    d += gerstner(p, 0.45, 1.2,  0.040,  0.018, 1.30);
    d += gerstner(p, 0.35, 0.9,  0.008, -0.035, 1.60);
    d += gerstner(p, 0.25, 0.6,  0.055,  0.006, 2.00);
    d += gerstner(p, 0.20, 0.4, -0.028,  0.048, 1.75);
    p += d;
    vHeight = d.y;

    // Compute wave normal
    float eps = 0.5;
    vec3 px = position + vec3(eps, 0, 0);
    vec3 pz = position + vec3(0, 0, eps);
    vec3 dx = vec3(0.0), dz = vec3(0.0);
    dx += gerstner(px, 0.65, 2.8, 0.022, 0.010, 1.10);
    dx += gerstner(px, 0.55, 1.8,-0.015, 0.028, 0.95);
    dz += gerstner(pz, 0.65, 2.8, 0.022, 0.010, 1.10);
    dz += gerstner(pz, 0.55, 1.8,-0.015, 0.028, 0.95);
    px += dx; pz += dz;
    vNormal3 = normalize(cross(pz - p, px - p));
  } else {
    // Land area: flat, above sea level
    vHeight  = 0.0;
    vNormal3 = vec3(0.0, 1.0, 0.0);
  }

  vWorldPos   = p;
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
varying float vIsLand;

void main() {
  // Land: discard entirely — the terrain mesh below will handle it
  if (vIsLand > 0.5) discard;

  // Ocean water colors
  vec3 abyss   = vec3(0.002, 0.010, 0.058);
  vec3 deep    = vec3(0.005, 0.040, 0.178);
  vec3 mid     = vec3(0.010, 0.130, 0.385);
  vec3 shallow = vec3(0.030, 0.480, 0.680);
  vec3 foam    = vec3(0.88,  0.94,  1.00);

  float h = clamp((vHeight + 2.0) / 6.0, 0.0, 1.0);
  vec3 col = mix(abyss, deep,    smoothstep(0.00, 0.22, h));
  col = mix(col, mid,    smoothstep(0.18, 0.52, h));
  col = mix(col, shallow, smoothstep(0.48, 0.85, h));

  // Foam on wave crests
  float foamMask  = smoothstep(1.2, 2.8, vHeight);
  float fn1 = sin(vUv.x * 180.0 + uTime * 2.8) * sin(vUv.y * 140.0 + uTime * 2.2);
  float fn2 = sin(vUv.x * 240.0 - uTime * 3.5) * sin(vUv.y * 190.0 + uTime * 1.9);
  col = mix(col, foam, foamMask * ((fn1 * 0.6 + fn2 * 0.4) * 0.5 + 0.5) * 0.85);

  // Specular highlight
  vec3 N       = normalize(vNormal3);
  vec3 lightDir= normalize(vec3(0.4, 1.0, 0.3));
  vec3 viewDir = normalize(uCamPos - vWorldPos);
  vec3 halfV   = normalize(lightDir + viewDir);
  float spec   = pow(max(dot(N, halfV), 0.0), 260.0) * 2.2
               + pow(max(dot(N, halfV), 0.0), 50.0)  * 0.35;
  col += vec3(0.96, 0.98, 1.0) * spec;

  // Caustic shimmer
  float c1 = abs(sin(vUv.x * 32.0 + uTime * 1.5) * sin(vUv.y * 26.0 + uTime * 1.1));
  float c2 = abs(sin(vUv.x * 52.0 - uTime * 2.3) * sin(vUv.y * 41.0 + uTime * 1.8));
  float caustic = pow(mix(c1, c2, 0.4), 3.5) * 0.18;
  col += vec3(caustic * 0.3, caustic * 0.75, caustic);

  // Horizon fog
  float dist  = clamp(length(vWorldPos.xz) / 2000.0, 0.0, 1.0);
  col = mix(col, abyss, dist * 0.55);

  if (uUnderwater) col = mix(col, vec3(0.01, 0.08, 0.32), 0.5);

  float alpha = uUnderwater ? 0.65 : mix(0.93, 0.70, dist);
  gl_FragColor = vec4(col, alpha);
}
`

// Ocean floor / terrain shader — shows both bathymetry AND land
const FLOOR_VERT = /* glsl */`
uniform sampler2D uHeightMap;
uniform float     uVertScale;
uniform float     uLandRise;
uniform float     uTime;
varying vec2  vUv;
varying float vHeight01;   // raw 0..1 value from texture
varying float vDepth;      // meters below surface for ocean
varying vec3  vWorldPos;
varying vec3  vNormal3;

void main() {
  vUv = uv;
  float h = texture2D(uHeightMap, uv).r;  // 0=deepest ocean, 0.5=sea level, >0.5=land
  vHeight01 = h;

  vec3 p = position;
  if (h > 0.5) {
    // LAND: raise above Y=0
    float landElev = (h - 0.5) * 2.0;  // 0→1 land elevation scale
    p.y = uLandRise * landElev;
  } else {
    // OCEAN: push below Y=0
    float depth = (0.5 - h) * 11000.0;  // 0→5500m depth
    vDepth  = depth;
    p.y     = -depth * uVertScale;
  }
  vWorldPos = p;

  // Compute normal from neighbours
  vec2 texel = vec2(1.0 / 512.0);
  float hL = texture2D(uHeightMap, uv - vec2(texel.x, 0)).r;
  float hR = texture2D(uHeightMap, uv + vec2(texel.x, 0)).r;
  float hD = texture2D(uHeightMap, uv - vec2(0, texel.y)).r;
  float hU = texture2D(uHeightMap, uv + vec2(0, texel.y)).r;
  vNormal3 = normalize(vec3((hL - hR) * 80.0, 1.6, (hD - hU) * 80.0));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const FLOOR_FRAG = /* glsl */`
uniform float uTime;
varying vec2  vUv;
varying float vHeight01;
varying float vDepth;
varying vec3  vWorldPos;
varying vec3  vNormal3;

void main() {
  vec3 col;

  if (vHeight01 > 0.5) {
    // ── LAND COLORING ─────────────────────────────────────────────────
    float landElev = (vHeight01 - 0.5) * 2.0; // 0..1
    // India / land gradient: lowland green → highlands brown → peaks grey
    vec3 lowland  = vec3(0.08, 0.12, 0.04);  // very dark olive/green
    vec3 midland  = vec3(0.14, 0.10, 0.06);  // dark brown plateau
    vec3 highland = vec3(0.20, 0.16, 0.12);  // rocky mountains
    vec3 snow     = vec3(0.55, 0.55, 0.58);  // snow caps (Himalayas)
    col = mix(lowland, midland,  smoothstep(0.0, 0.25, landElev));
    col = mix(col, highland, smoothstep(0.2, 0.65, landElev));
    col = mix(col, snow,     smoothstep(0.6, 1.0,  landElev));
    // Texture noise
    float n = sin(vUv.x * 420.0 + vUv.y * 380.0) * 0.012
            + sin(vUv.x * 180.0 - vUv.y * 210.0) * 0.018;
    col += vec3(n * 0.6, n * 0.5, n * 0.35);
  } else {
    // ── OCEAN FLOOR COLORING ─────────────────────────────────────────
    vec3 shallow = vec3(0.04, 0.40, 0.55);
    vec3 mid     = vec3(0.01, 0.12, 0.30);
    vec3 deep    = vec3(0.003, 0.022, 0.10);
    vec3 abyss   = vec3(0.001, 0.005, 0.025);

    float d = clamp(vDepth / 5500.0, 0.0, 1.0);
    col = mix(shallow, mid,   smoothstep(0.0,  0.12, d));
    col = mix(col, deep,   smoothstep(0.10, 0.48, d));
    col = mix(col, abyss,  smoothstep(0.45, 1.0,  d));

    // Sediment noise
    float n1 = sin(vUv.x * 390.0) * sin(vUv.y * 330.0) * 0.025;
    float n2 = sin(vUv.x * 98.0 + vUv.y * 83.0 + 0.6) * 0.020;
    col += vec3(n1 + n2) * 0.5;

    // Caustics on shallow floor
    if (vDepth < 600.0) {
      float ct = 1.0 - vDepth / 600.0;
      float c1 = abs(sin(vWorldPos.x * 0.08 + uTime * 1.4) * sin(vWorldPos.z * 0.07 + uTime * 1.1));
      float c2 = abs(sin(vWorldPos.x * 0.13 - uTime * 1.8) * sin(vWorldPos.z * 0.10 + uTime * 1.5));
      col += vec3(pow(mix(c1, c2, 0.4), 2.8) * 0.22 * ct) * vec3(0.4, 0.85, 1.0);
    }
  }

  // Diffuse light
  vec3 lightDir = normalize(vec3(0.35, 1.0, 0.25));
  float diff = max(dot(normalize(vNormal3), lightDir), 0.08);
  col *= (0.35 + 0.65 * diff);

  gl_FragColor = vec4(col, 1.0);
}
`

const SLICE_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const SLICE_FRAG = /* glsl */`
uniform sampler2D uDataTex;
uniform sampler2D uLandMask;
uniform float     uOpacity;
uniform int       uVariable;
varying vec2 vUv;

vec3 tempColor(float t) {
  vec3 stops[6];
  stops[0] = vec3(0.17,0.09,0.33); stops[1] = vec3(0.10,0.14,0.49);
  stops[2] = vec3(0.01,0.53,0.82); stops[3] = vec3(0.00,0.54,0.48);
  stops[4] = vec3(0.80,0.86,0.22); stops[5] = vec3(0.78,0.16,0.16);
  float s = t * 5.0; int i = int(s); float f = s - float(i);
  i = clamp(i, 0, 4);
  if (i == 0) return mix(stops[0], stops[1], f);
  if (i == 1) return mix(stops[1], stops[2], f);
  if (i == 2) return mix(stops[2], stops[3], f);
  if (i == 3) return mix(stops[3], stops[4], f);
  return mix(stops[4], stops[5], f);
}
vec3 salColor(float t) {
  if (t < 0.25) return mix(vec3(0.29,0.05,0.56), vec3(0.08,0.40,0.75), t/0.25);
  if (t < 0.50) return mix(vec3(0.08,0.40,0.75), vec3(0.01,0.53,0.82), (t-0.25)/0.25);
  if (t < 0.75) return mix(vec3(0.01,0.53,0.82), vec3(0.15,0.65,0.60), (t-0.50)/0.25);
  return mix(vec3(0.15,0.65,0.60), vec3(0.98,0.66,0.14), (t-0.75)/0.25);
}

void main() {
  // Don't render data slices over land
  float land = texture2D(uLandMask, vUv).r;
  if (land > 0.5) discard;

  float raw = texture2D(uDataTex, vUv).r;
  if (raw < 0.005) discard;
  vec3 col = uVariable == 1 ? salColor(raw) : tempColor(raw);
  gl_FragColor = vec4(col, uOpacity);
}
`

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
  gl_FragColor = vec4(0.55, 0.80, 0.95, (1.0 - d) * vAlpha * 0.55);
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

const DEPTH_SLICES = [0, 50, 100, 200, 400, 800, 1500, 2000]
const FLY_SPEED    = 7.0

export default function OceanWorld3D({
  scene, floats, filteredFloats, onFloatSelect, selectedFloat,
}: Props) {
  const displayFloats = filteredFloats ?? floats

  const mountRef      = useRef<HTMLDivElement>(null)
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null)
  const cssRendRef    = useRef<CSS2DRenderer | null>(null)
  const sceneRef      = useRef<THREE.Scene | null>(null)
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef   = useRef<OrbitControls | null>(null)
  const clockRef      = useRef(new THREE.Clock())
  const animRef       = useRef<number>(0)
  const waveUniRef    = useRef<any>(null)
  const sliceGroupRef = useRef<THREE.Group | null>(null)
  const floatGroupRef = useRef<THREE.Group | null>(null)
  const gridGroupRef  = useRef<THREE.Group | null>(null)
  const particleUniRef= useRef<{ uTime: { value: number } } | null>(null)
  const floorMatRef   = useRef<THREE.ShaderMaterial | null>(null)
  const landMaskTexRef= useRef<THREE.Texture | null>(null)
  const keysRef       = useRef<Record<string, boolean>>({})
  const mouseRef      = useRef(new THREE.Vector2())
  const underwaterRef = useRef(false)
  const raycasterRef  = useRef(new THREE.Raycaster())

  const [hud, setHud]               = useState({ lat: 12.0, lon: 77.0, depthM: 0, altitude: 800 })
  const [underwater, setUnderwater] = useState(false)
  const [tooltip, setTooltip]       = useState<{ text: string; x: number; y: number } | null>(null)
  const [showSlices, setShowSlices] = useState(false)
  const [showGrid,   setShowGrid]   = useState(true)
  const [showFloats, setShowFloats] = useState(true)
  const [waveScale,  setWaveScale]  = useState(1.0)
  const [varMode,    setVarMode]    = useState<'temperature' | 'salinity'>('temperature')

  // ── Init Scene ──────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const W = mount.clientWidth || window.innerWidth
    const H = mount.clientHeight || window.innerHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled  = true
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // CSS2D labels
    const cssRend = new CSS2DRenderer()
    cssRend.setSize(W, H)
    Object.assign(cssRend.domElement.style, { position:'absolute', top:'0', left:'0', pointerEvents:'none' })
    mount.appendChild(cssRend.domElement)
    cssRendRef.current = cssRend

    // Scene
    const scene3 = new THREE.Scene()
    scene3.background = new THREE.Color(0x020912)
    sceneRef.current = scene3

    // Camera — starts at a tilted "Google Earth" view over Indian Ocean center
    const camera = new THREE.PerspectiveCamera(52, W / H, 1, 25000)
    const startPos = geoToWorld(5, 75, 0)     // center of Indian Ocean
    camera.position.set(startPos.x - 200, 1200, startPos.z + 1600)
    camera.lookAt(startPos.x, 0, startPos.z)
    cameraRef.current = camera

    // Orbit controls
    const ctrl = new OrbitControls(camera, renderer.domElement)
    ctrl.target.set(startPos.x, 0, startPos.z)
    ctrl.enableDamping   = true
    ctrl.dampingFactor   = 0.06
    ctrl.minDistance     = 2
    ctrl.maxDistance     = 10000
    ctrl.panSpeed        = 1.4
    ctrl.rotateSpeed     = 0.55
    ctrl.zoomSpeed       = 1.1
    ctrl.enablePan       = true
    controlsRef.current  = ctrl

    // Lighting
    const hemi = new THREE.HemisphereLight(0x6090c8, 0x101820, 0.85)
    scene3.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2d0, 1.6)
    sun.position.set(1500, 2500, 900)
    sun.castShadow = true
    scene3.add(sun)
    const fill = new THREE.DirectionalLight(0x203060, 0.4)
    fill.position.set(-800, 600, -500)
    scene3.add(fill)
    const deepPoint = new THREE.PointLight(0x0025aa, 0.55, 3500)
    deepPoint.position.set(0, -700, 0)
    scene3.add(deepPoint)

    // Sky dome
    buildSkyDome(scene3)

    // ── Generate Indian Ocean heightmap ─────────────────────────────
    const HMAP_SIZE = 512
    const { height: hData, landMask: lData } = generateIndianOceanHeightmap(HMAP_SIZE)

    // Height texture for floor
    const heightTex = new THREE.DataTexture(hData, HMAP_SIZE, HMAP_SIZE, THREE.RedFormat, THREE.FloatType)
    heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping
    heightTex.minFilter = THREE.LinearFilter
    heightTex.magFilter = THREE.LinearFilter
    heightTex.needsUpdate = true

    // Land mask texture (for wave surface + data slices)
    const maskBuf = new Float32Array(HMAP_SIZE * HMAP_SIZE)
    for (let i = 0; i < lData.length; i++) maskBuf[i] = lData[i] / 255.0
    const landMaskTex = new THREE.DataTexture(maskBuf, HMAP_SIZE, HMAP_SIZE, THREE.RedFormat, THREE.FloatType)
    landMaskTex.wrapS = landMaskTex.wrapT = THREE.ClampToEdgeWrapping
    landMaskTex.minFilter = THREE.LinearFilter
    landMaskTex.magFilter = THREE.LinearFilter
    landMaskTex.needsUpdate = true
    landMaskTexRef.current = landMaskTex

    // ── Ocean floor terrain mesh ─────────────────────────────────────
    const floorMat = new THREE.ShaderMaterial({
      vertexShader:   FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        uHeightMap: { value: heightTex },
        uVertScale: { value: VERT_SCALE },
        uLandRise:  { value: LAND_RISE },
        uTime:      { value: 0 },
      },
      side: THREE.FrontSide,
    })
    floorMatRef.current = floorMat

    const floorGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 320, 300)
    floorGeo.rotateX(-Math.PI / 2)
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.position.y = 0
    floor.receiveShadow = true
    scene3.add(floor)

    // ── Animated ocean wave surface ──────────────────────────────────
    const waveUnis = {
      uTime:       { value: 0 },
      uWaveScale:  { value: 1.0 },
      uCamPos:     { value: new THREE.Vector3() },
      uUnderwater: { value: false },
      uLandMask:   { value: landMaskTex },
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
    const waveGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 320, 300)
    waveGeo.rotateX(-Math.PI / 2)
    const waveMesh = new THREE.Mesh(waveGeo, waveMat)
    waveMesh.position.y = 2   // slightly above floor's Y=0
    scene3.add(waveMesh)

    // ── Lat/Lon grid + labels ─────────────────────────────────────────
    const grid = buildLatLonGrid(scene3)
    gridGroupRef.current = grid

    // ── Data slices group ─────────────────────────────────────────────
    const sliceGrp = new THREE.Group(); sliceGrp.name = 'depth-slices'
    scene3.add(sliceGrp); sliceGroupRef.current = sliceGrp

    // ── Argo float markers ────────────────────────────────────────────
    const floatGrp = new THREE.Group(); floatGrp.name = 'argo-floats'
    scene3.add(floatGrp); floatGroupRef.current = floatGrp

    // ── Underwater particles ──────────────────────────────────────────
    particleUniRef.current = buildParticles(scene3)

    // Fog
    scene3.fog = new THREE.Fog(0x020912, 4000, 12000)

    // ── Input events ──────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true }
    const onKeyUp   = (e: KeyboardEvent) => { delete keysRef.current[e.code] }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)

    const onClick = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect()
      mouseRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycasterRef.current.setFromCamera(mouseRef.current, camera)
      const hits = raycasterRef.current.intersectObjects(floatGrp.children, true)
      if (hits.length > 0) {
        const f = (hits[0].object as any).userData?.float as ArgoFloat
        if (f) onFloatSelect({ platform_number: f.platform_number, cycle_number: f.cycle_number, latitude: f.latitude, longitude: f.longitude, time: f.time })
      }
    }
    renderer.domElement.addEventListener('click', onClick)

    const onResize = () => {
      if (!mount) return
      const w = mount.clientWidth, h = mount.clientHeight
      camera.aspect = w / h; camera.updateProjectionMatrix()
      renderer.setSize(w, h); cssRend.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // ── Animation loop ────────────────────────────────────────────────
    const animate = () => {
      animRef.current = requestAnimationFrame(animate)
      const dt  = Math.min(clockRef.current.getDelta(), 0.05)
      const t   = clockRef.current.getElapsedTime()

      // Fly keys
      flyCamera(camera, ctrl, dt)
      ctrl.update()

      // Wave + floor time
      if (waveUniRef.current) {
        waveUniRef.current.uTime.value    += dt
        waveUniRef.current.uCamPos.value.copy(camera.position)
        const isUnder = camera.position.y < 2
        waveUniRef.current.uUnderwater.value = isUnder
        if (isUnder !== underwaterRef.current) {
          underwaterRef.current = isUnder
          setUnderwater(isUnder)
          scene3.fog = isUnder
            ? new THREE.FogExp2(0x000d28, 0.00042)
            : new THREE.Fog(0x020912, 4000, 12000)
          scene3.background = new THREE.Color(isUnder ? 0x000d28 : 0x020912)
          hemi.color.set(isUnder ? 0x001133 : 0x6090c8)
          hemi.groundColor.set(isUnder ? 0x000008 : 0x101820)
        }
      }
      if (floorMatRef.current) floorMatRef.current.uniforms.uTime.value = t
      if (particleUniRef.current) particleUniRef.current.uTime.value = t

      // HUD
      if (Math.round(t * 60) % 8 === 0) {
        const g = worldToGeo(camera.position.x, camera.position.y, camera.position.z)
        setHud({ lat: parseFloat(g.lat.toFixed(3)), lon: parseFloat(g.lon.toFixed(3)),
                 depthM: parseFloat(g.depthM.toFixed(0)), altitude: parseFloat((Math.max(0, camera.position.y) / VERT_SCALE).toFixed(0)) })
      }

      renderer.render(scene3, camera)
      cssRend.render(scene3, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
      window.removeEventListener('resize',  onResize)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      if (cssRend.domElement.parentNode  === mount) mount.removeChild(cssRend.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fly camera with keyboard ──────────────────────────────────────────────
  const flyCamera = (cam: THREE.PerspectiveCamera, ctrl: OrbitControls, dt: number) => {
    const k = keysRef.current
    const sprint = k['ShiftLeft'] || k['ShiftRight']
    const spd = FLY_SPEED * (sprint ? 14 : 1) * dt
    const dir   = new THREE.Vector3()
    const right = new THREE.Vector3()
    cam.getWorldDirection(dir)
    right.crossVectors(dir, new THREE.Vector3(0,1,0)).normalize()
    const move = new THREE.Vector3()
    if (k['KeyW'] || k['ArrowUp'])    move.addScaledVector(dir,    spd)
    if (k['KeyS'] || k['ArrowDown'])  move.addScaledVector(dir,   -spd)
    if (k['KeyA'] || k['ArrowLeft'])  move.addScaledVector(right, -spd)
    if (k['KeyD'] || k['ArrowRight']) move.addScaledVector(right,  spd)
    if (k['KeyQ'] || k['PageDown'])   move.y -= spd
    if (k['KeyE'] || k['PageUp'])     move.y += spd
    if (move.lengthSq() > 0) {
      cam.position.add(move)
      ctrl.target.add(move)
    }
  }

  // ── Argo float markers ────────────────────────────────────────────────────
  useEffect(() => {
    const group  = floatGroupRef.current
    if (!group) return
    while (group.children.length) {
      const c = group.children[0] as any
      c.geometry?.dispose(); c.material?.dispose(); group.remove(c)
    }
    if (!showFloats || !displayFloats.length) return

    const sGeo = new THREE.SphereGeometry(5, 10, 7)
    displayFloats.forEach(f => {
      const pos = geoToWorld(f.latitude, f.longitude, 0)
      // Check if position is in ocean range
      if (f.latitude < LAT_MIN || f.latitude > LAT_MAX || f.longitude < LON_MIN || f.longitude > LON_MAX) return
      const t   = Math.max(0, Math.min(1, ((f.temp_surface ?? 25) - 2) / 30))
      const col = new THREE.Color().setHSL(0.65 - t * 0.65, 0.9, 0.55)

      const glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25 })
      const glow    = new THREE.Mesh(new THREE.SphereGeometry(12, 8, 6), glowMat)
      glow.position.copy(pos)
      group.add(glow)

      const core = new THREE.Mesh(sGeo, new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, shininess: 90 }))
      core.position.copy(pos);
      core.userData.float = f
      group.add(core)

      // Depth line
      if (f.pres_max && f.pres_max > 10) {
        const d = Math.min(f.pres_max, 2000)
        const pts = [pos.clone(), geoToWorld(f.latitude, f.longitude, d)]
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.45 })))
      }

      if (selectedFloat?.platform_number === f.platform_number) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(20, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, wireframe: true }))
        hl.position.copy(pos); group.add(hl)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFloats, showFloats, selectedFloat])

  // ── Grid visibility ───────────────────────────────────────────────────────
  useEffect(() => { if (gridGroupRef.current) gridGroupRef.current.visible = showGrid }, [showGrid])

  // ── Slice visibility ──────────────────────────────────────────────────────
  useEffect(() => { if (sliceGroupRef.current) sliceGroupRef.current.visible = showSlices }, [showSlices])

  // ── Wave scale uniform ────────────────────────────────────────────────────
  useEffect(() => { if (waveUniRef.current) waveUniRef.current.uWaveScale.value = waveScale }, [waveScale])

  // ── Fetch HYCOM slices ────────────────────────────────────────────────────
  useEffect(() => {
    const group = sliceGroupRef.current
    const lmTex = landMaskTexRef.current
    if (!group || !showSlices) return

    while (group.children.length) {
      const c = group.children[0] as any
      c.geometry?.dispose(); c.material?.dispose(); group.remove(c)
    }

    const varStr = scene.variable === 'current_speed' ? 'temperature' : scene.variable
    const varIdx = varStr === 'salinity' ? 1 : 0

    DEPTH_SLICES.forEach((depthM, idx) => {
      api.modelDepthSlice(varStr, depthM, 0).then(data => {
        if (!data?.values?.length) return
        const { lat: lats, lon: lons, values } = data
        const rows = lats.length, cols = lons.length
        const buf  = new Float32Array(rows * cols)
        let k = 0
        const span = data.vmax - data.vmin || 1
        for (let i = 0; i < rows; i++)
          for (let j = 0; j < cols; j++) {
            const v = values[i]?.[j]
            buf[k++] = (v != null && isFinite(v)) ? Math.max(0, Math.min(1, (v - data.vmin) / span)) : 0
          }
        const tex = new THREE.DataTexture(buf, cols, rows, THREE.RedFormat, THREE.FloatType)
        tex.needsUpdate = true
        const mat = new THREE.ShaderMaterial({
          vertexShader: SLICE_VERT, fragmentShader: SLICE_FRAG,
          uniforms: {
            uDataTex:  { value: tex },
            uLandMask: { value: lmTex },
            uOpacity:  { value: Math.max(0.05, 0.17 - idx * 0.015) },
            uVariable: { value: varIdx },
          },
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
        })
        const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, 1, 1)
        geo.rotateX(-Math.PI / 2)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.y = -depthM * VERT_SCALE
        group.add(mesh)
      }).catch(() => {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.variable, showSlices])

  // ── Scale bar ─────────────────────────────────────────────────────────────
  const camAlt = Math.max(1, hud.altitude + hud.depthM)
  const scaleKm = camAlt < 500 ? 10 : camAlt < 2000 ? 50 : camAlt < 5000 ? 100 : 500
  const scaleBarPx = Math.min(190, Math.max(25, (scaleKm / (camAlt * 0.08)) * 150))

  return (
    <div style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden', background:'#020912' }}>
      <div ref={mountRef} style={{ width:'100%', height:'100%' }} />

      {/* ── Position HUD ────────────────────────────────────────── */}
      <div style={{
        position:'absolute', top:80, left:16, zIndex:20,
        background:'rgba(2,9,20,0.88)', border:'1px solid rgba(0,180,255,0.45)',
        borderRadius:8, padding:'10px 14px', backdropFilter:'blur(10px)',
        fontFamily:"'JetBrains Mono','Courier New',monospace", fontSize:12, color:'#a0d8f8', minWidth:210,
      }}>
        <div style={{ fontWeight:700, color:'#00e5ff', marginBottom:6, fontSize:11, letterSpacing:2 }}>📍 POSITION</div>
        <div>LAT: <b style={{color:'#fff'}}>{hud.lat >= 0 ? `${hud.lat.toFixed(3)}°N` : `${Math.abs(hud.lat).toFixed(3)}°S`}</b></div>
        <div>LON: <b style={{color:'#fff'}}>{hud.lon >= 0 ? `${hud.lon.toFixed(3)}°E` : `${Math.abs(hud.lon).toFixed(3)}°W`}</b></div>
        <div style={{ marginTop:4, paddingTop:4, borderTop:'1px solid rgba(0,180,255,0.2)' }}>
          {underwater
            ? <span style={{color:'#4fc3f7'}}>🌊 DEPTH: <b style={{color:'#00e5ff'}}>{hud.depthM}m</b></span>
            : <span style={{color:'#81d4fa'}}>🌤️ ALT: <b style={{color:'#80deea'}}>{hud.altitude}m</b></span>}
        </div>
      </div>

      {/* ── Controls Panel ─────────────────────────────────────── */}
      <div style={{
        position:'absolute', top:80, right:16, zIndex:20,
        background:'rgba(2,9,20,0.88)', border:'1px solid rgba(0,180,255,0.4)',
        borderRadius:8, padding:'10px 14px', backdropFilter:'blur(10px)',
        display:'flex', flexDirection:'column', gap:8, minWidth:195,
      }}>
        <div style={{ fontWeight:700, color:'#00e5ff', fontSize:11, letterSpacing:2 }}>⚙️ SCENE</div>
        <div style={{ display:'flex', gap:4 }}>
          {(['temperature','salinity'] as const).map(v => (
            <button key={v} onClick={() => setVarMode(v)} style={{
              flex:1, padding:'4px 6px', fontSize:9, fontWeight:700, borderRadius:4, cursor:'pointer',
              border:`1px solid ${varMode===v ? '#00e5ff' : 'rgba(0,180,255,0.3)'}`,
              background: varMode===v ? 'rgba(0,229,255,0.15)' : 'rgba(2,8,20,0.6)',
              color: varMode===v ? '#00e5ff' : '#5090b0',
            }}>{v === 'temperature' ? '🌡 TEMP' : '🧂 SAL'}</button>
          ))}
        </div>
        {[
          { label:'🗺️ Lat/Lon Grid', on: showGrid,   tog: () => setShowGrid(v => !v) },
          { label:'📡 Argo Floats',  on: showFloats, tog: () => setShowFloats(v => !v) },
          { label:'📊 Data Slices',  on: showSlices, tog: () => setShowSlices(v => !v) },
        ].map(({label, on, tog}) => (
          <button key={label} onClick={tog} style={{
            padding:'5px 10px', fontSize:10, fontWeight:600, borderRadius:5, cursor:'pointer', textAlign:'left',
            border:`1px solid ${on ? 'rgba(0,229,255,0.5)' : 'rgba(80,120,160,0.4)'}`,
            background: on ? 'rgba(0,229,255,0.12)' : 'rgba(2,8,20,0.6)',
            color: on ? '#80f0ff' : '#407090',
          }}>{on ? '✅' : '⬜'} {label}</button>
        ))}
        <div>
          <div style={{ fontSize:10, color:'#5090b0', marginBottom:3 }}>Wave Scale: {waveScale.toFixed(1)}×</div>
          <input type="range" min={0.1} max={3.0} step={0.1} value={waveScale}
            onChange={e => setWaveScale(parseFloat(e.target.value))}
            style={{ width:'100%', accentColor:'#00b4ff' }} />
        </div>
      </div>

      {/* ── Scale bar ──────────────────────────────────────────── */}
      <div style={{ position:'absolute', bottom:52, left:16, zIndex:20, display:'flex', flexDirection:'column', gap:2 }}>
        <div style={{ fontSize:10, color:'#70b0d8', fontFamily:'monospace' }}>
          {scaleKm >= 1 ? `${scaleKm} km` : `${scaleKm * 1000} m`}
        </div>
        <div style={{
          width: scaleBarPx, height:4, borderRadius:2,
          border:'1px solid #00b4ff',
          background:'linear-gradient(90deg, #00e5ff 50%, rgba(0,180,255,0.2) 50%)',
          backgroundSize:`${scaleBarPx/4}px 4px`,
        }} />
      </div>

      {/* ── Compass ────────────────────────────────────────────── */}
      <div style={{
        position:'absolute', bottom:52, right:20, zIndex:20,
        width:52, height:52, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', fontFamily:'monospace', fontSize:10, color:'#60a0c0',
        background:'rgba(2,9,20,0.82)', border:'1px solid rgba(0,180,255,0.35)', backdropFilter:'blur(8px)',
      }}>
        <div style={{ color:'#ff4444', fontWeight:700, lineHeight:1 }}>N</div>
        <div style={{ display:'flex', gap:10, lineHeight:1 }}><span>W</span><span>E</span></div>
        <div style={{ lineHeight:1 }}>S</div>
      </div>

      {/* ── Key hints ──────────────────────────────────────────── */}
      <div style={{
        position:'absolute', bottom:52, left:'50%', transform:'translateX(-50%)', zIndex:20,
        background:'rgba(2,9,20,0.75)', border:'1px solid rgba(0,180,255,0.25)',
        borderRadius:6, padding:'5px 16px', color:'#3870a0', fontSize:10,
        fontFamily:'monospace', whiteSpace:'nowrap', backdropFilter:'blur(6px)',
      }}>
        🖱 Drag: Orbit &nbsp;|&nbsp; Scroll: Zoom &nbsp;|&nbsp; WASD: Fly &nbsp;|&nbsp; Q: Dive &nbsp;|&nbsp; E: Rise &nbsp;|&nbsp; Shift: Sprint
      </div>

      {/* ── Underwater overlay ─────────────────────────────────── */}
      {underwater && (
        <div style={{ position:'absolute', inset:0, zIndex:3, pointerEvents:'none',
          background:'radial-gradient(ellipse at center, transparent 45%, rgba(0,10,50,0.45) 100%)' }} />
      )}

      {/* ── Tooltip ────────────────────────────────────────────── */}
      {tooltip && (
        <div style={{
          position:'absolute', left:tooltip.x+12, top:tooltip.y-12, zIndex:30,
          background:'rgba(2,10,24,0.94)', border:'1px solid #00b4ff',
          borderRadius:6, padding:'8px 12px', color:'#fff', fontSize:11,
          pointerEvents:'none', backdropFilter:'blur(8px)',
        }}>{tooltip.text}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sky dome
// ─────────────────────────────────────────────────────────────────────────────
function buildSkyDome(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader:   `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vPos;
      void main(){
        float h = clamp((normalize(vPos).y+0.08)/1.08, 0.0, 1.0);
        vec3 col = mix(vec3(0.04,0.10,0.28), vec3(0.01,0.04,0.18), smoothstep(0.0,0.5,h));
        gl_FragColor = vec4(col, 1.0);
      }`,
    uniforms:{},
  })
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(11000, 32, 16), mat))
}

// ─────────────────────────────────────────────────────────────────────────────
// Lat/Lon grid with labels at Y=1 (just above sea surface)
// ─────────────────────────────────────────────────────────────────────────────
function buildLatLonGrid(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group(); group.name = 'lat-lon-grid'
  const latMat = new THREE.LineBasicMaterial({ color: 0x004499, transparent: true, opacity: 0.55 })
  const lonMat = new THREE.LineBasicMaterial({ color: 0x003377, transparent: true, opacity: 0.50 })
  const depMat = new THREE.LineBasicMaterial({ color: 0x002255, transparent: true, opacity: 0.30 })

  // Latitude lines every 5°
  for (let lat = Math.ceil(LAT_MIN/5)*5; lat <= LAT_MAX; lat += 5) {
    const pts: THREE.Vector3[] = []
    for (let lon = LON_MIN; lon <= LON_MAX; lon += 1) pts.push(geoToWorld(lat, lon, 0).setY(1))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), latMat))
    // Label
    const el = document.createElement('div')
    el.style.cssText = 'color:rgba(80,160,255,0.75);font-size:10px;font-family:monospace;pointer-events:none;white-space:nowrap'
    el.textContent = lat >= 0 ? `${lat}°N` : `${Math.abs(lat)}°S`
    const lbl = new CSS2DObject(el)
    lbl.position.copy(geoToWorld(lat, LON_MIN - 0.5, 0).setY(3))
    group.add(lbl)
  }

  // Longitude lines every 5°
  for (let lon = Math.ceil(LON_MIN/5)*5; lon <= LON_MAX; lon += 5) {
    const pts: THREE.Vector3[] = []
    for (let lat = LAT_MIN; lat <= LAT_MAX; lat += 1) pts.push(geoToWorld(lat, lon, 0).setY(1))
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lonMat))
    const el = document.createElement('div')
    el.style.cssText = 'color:rgba(60,140,255,0.70);font-size:10px;font-family:monospace;pointer-events:none;white-space:nowrap'
    el.textContent = lon >= 0 ? `${lon}°E` : `${Math.abs(lon)}°W`
    const lbl = new CSS2DObject(el)
    lbl.position.copy(geoToWorld(LAT_MIN - 0.5, lon, 0).setY(3))
    group.add(lbl)
  }

  // Depth rings (horizontal squares at key depths)
  ;[200, 500, 1000, 2000, 4000].forEach(depthM => {
    const y = -depthM * VERT_SCALE
    const corners = [
      geoToWorld(LAT_MIN, LON_MIN, depthM), geoToWorld(LAT_MAX, LON_MIN, depthM),
      geoToWorld(LAT_MAX, LON_MAX, depthM), geoToWorld(LAT_MIN, LON_MAX, depthM),
      geoToWorld(LAT_MIN, LON_MIN, depthM),
    ]
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners), depMat))
    const el = document.createElement('div')
    el.style.cssText = 'color:rgba(40,100,200,0.6);font-size:9px;font-family:monospace;pointer-events:none'
    el.textContent = `—${depthM}m`
    const lbl = new CSS2DObject(el)
    lbl.position.set(geoToWorld(LAT_MIN, LON_MIN).x - 20, y, geoToWorld(LAT_MIN, LON_MIN).z)
    group.add(lbl)
  })

  scene.add(group)
  return group
}

// ─────────────────────────────────────────────────────────────────────────────
// Underwater suspended particles
// ─────────────────────────────────────────────────────────────────────────────
function buildParticles(scene: THREE.Scene): { uTime: { value: number } } {
  const COUNT  = 3500
  const pos    = new Float32Array(COUNT * 3)
  const sizes  = new Float32Array(COUNT)
  const vel    = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i++) {
    pos[i*3]   = (Math.random() - 0.5) * WORLD_W
    pos[i*3+1] = -(Math.random() * 2400)
    pos[i*3+2] = (Math.random() - 0.5) * WORLD_D
    sizes[i]   = 1.5 + Math.random() * 3
    vel[i*3]   = 0.3 + Math.random() * 0.8
    vel[i*3+1] = 0.2 + Math.random() * 0.6
    vel[i*3+2] = 0.25 + Math.random() * 0.7
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position',  new THREE.BufferAttribute(pos,   3))
  geo.setAttribute('aSize',     new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aVelocity', new THREE.BufferAttribute(vel,   3))
  const unis = { uTime: { value: 0 } }
  const mat  = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
    uniforms: unis, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  scene.add(new THREE.Points(geo, mat))
  return unis
}
