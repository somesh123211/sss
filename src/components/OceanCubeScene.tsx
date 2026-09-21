/**
 * OceanCubeScene.tsx — 3D Volumetric Ocean Digital Twin & Regional Terrain Viewer
 *
 * Capabilities:
 * 1. Seasonal Dynamics: Real-time simulation of Indian Ocean seasons (SW Monsoon, NE Monsoon,
 *    Spring Warm Pool, Fall Transition) with seasonal current reversals, upwelling, and salinity plumes.
 * 2. Natural Disaster Impact Simulator: Category-5 Super Cyclone (wave surge & cold wake),
 *    Severe Marine Heatwave (MHW thermal capping), Hypoxic OMZ Dead Zone Crisis, and Tsunami pulse.
 * 3. Dynamic Colorbar Editor: Multiple scientific color palettes (Turbo, Viridis, Thermal, Oceanic,
 *    Haline, Algae, Rainbow, Magma, Plasma, Deep Sea), customizable Min/Max range, and Linear/Log/Sqrt scaling.
 * 4. Layer Opacity Controls: Fine-grained opacity for Ocean Surface Water, Subsurface Slices,
 *    Seafloor Bathymetry, with Seafloor Wireframe and Vector Layer toggles.
 * 5. Vertical Exaggeration Slider (1.0x – 6.0x): Intuitive depth perception scaling across
 *    bathymetry, float cables, sensor beads, active depth slices, and basin walls.
 * 6. Multi-Variable Selector: Temperature, Salinity, Current Speed, Density, Sound Speed, Dissolved O2.
 * 7. Interactive Multi-Factor Depth Telemetry Probe & Dive HUD.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SceneState, SelectedFloat, OceanVariable } from '../types'
import { ArgoFloat, api } from '../services/api'
import { useCesium } from '../cesium/CesiumContext'
import Minimap from './Minimap'

const TERR_W = 100, TERR_D = 60, SEG_W = 160, SEG_D = 96
const LON_MIN = 55, LON_MAX = 100, LAT_MIN = 0, LAT_MAX = 30
const OCEAN_SCALE = 0.0015   // 2000m = 3.0 units below water
const LAND_SCALE = 0.0008    // 300m elevation = 0.24 units

type SeasonType = 'sw_monsoon' | 'ne_monsoon' | 'spring_warm' | 'fall_transition'
type DisasterType = 'none' | 'cyclone' | 'heatwave' | 'hypoxia' | 'tsunami'
type ColorPaletteType =
  | 'turbo'
  | 'viridis'
  | 'thermal'
  | 'oceanic'
  | 'haline'
  | 'algae'
  | 'rainbow'
  | 'magma'
  | 'plasma'
  | 'deep_sea'
  | 'cyclone_wake'
  | 'heatwave_burn'
  | 'anoxic_deadzone'
  | 'tsunami_surge'
  | 'monsoon_upwelling'
  | 'winter_convection'

type ScaleModeType = 'linear' | 'log' | 'sqrt'
type ActiveStudioTab = 'seasons' | 'disasters' | 'colorbar' | 'layers' | 'variables'

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
  obsDate?: string
  seasonName?: string
  seasonDateRange?: string
  seasonEffect?: string
  disasterName?: string
  disasterDateRange?: string
  disasterEffect?: string
}

export interface SeasonMeta {
  id: SeasonType
  name: string
  months: string
  dateRange: string
  peakPeriod: string
  icon: string
  desc: string
  sstAnomaly: string
  currentReversal: string
  salinityEffect: string
  waveState: string
  skyHorizon: [number, number, number]
  skyZenith: [number, number, number]
  fogColor: number
  sunColor: number
  sunIntensity: number
  hemiSky: number
  hemiGround: number
  waterDeep: [number, number, number]
  waterMid: [number, number, number]
  waterShallow: [number, number, number]
  skyReflection: [number, number, number]
  waveScale: number
  foamMultiplier: number
  sunMultiplier: number
  thermalSheen: number
  hypoxicMurk: number
}

export interface DisasterMeta {
  id: DisasterType
  name: string
  dateRange: string
  peakAnomalyDate: string
  icon: string
  color: string
  desc: string
  physicalImpact: string
  sstAnomaly: string
  currentSurge: string
  waveSurge: string
  oxygenCrash: string
  skyHorizon: [number, number, number]
  skyZenith: [number, number, number]
  fogColor: number
  sunColor: number
  sunIntensity: number
  hemiSky: number
  hemiGround: number
  waterDeep: [number, number, number]
  waterMid: [number, number, number]
  waterShallow: [number, number, number]
  skyReflection: [number, number, number]
  waveScale: number
  foamMultiplier: number
  sunMultiplier: number
  thermalSheen: number
  hypoxicMurk: number
}

const SEASONS_META: Record<SeasonType, SeasonMeta> = {
  sw_monsoon: {
    id: 'sw_monsoon',
    name: 'Southwest Monsoon (Summer)',
    months: 'Jun – Sep',
    dateRange: '01 June – 30 September',
    peakPeriod: '15 July – 20 August',
    icon: '🌧️',
    desc: 'Intense Findlater Somali jet, strong coastal upwelling cooling in Western Arabian Sea, heavy river discharge in Bay of Bengal.',
    sstAnomaly: '-1.8°C (Arabian Sea) / +0.4°C (BoB)',
    currentReversal: '+0.45 m/s Eastward Monsoon Drift',
    salinityEffect: '-2.2 PSU Bay of Bengal River Plume Dilution',
    waveState: 'Rough Monsoonal Chop (Hs ~ 3.2m, 1.8x)',
    skyHorizon: [0.035, 0.075, 0.135],
    skyZenith: [0.008, 0.02, 0.045],
    fogColor: 0x091424,
    sunColor: 0xe2ecf8,
    sunIntensity: 2.6,
    hemiSky: 0x5894d0,
    hemiGround: 0x0a1e36,
    waterDeep: [0.012, 0.16, 0.48],
    waterMid: [0.03, 0.40, 0.65],
    waterShallow: [0.04, 0.68, 0.72],
    skyReflection: [0.25, 0.55, 0.75],
    waveScale: 1.85,
    foamMultiplier: 1.6,
    sunMultiplier: 0.85,
    thermalSheen: 0.0,
    hypoxicMurk: 0.0,
  },
  ne_monsoon: {
    id: 'ne_monsoon',
    name: 'Northeast Monsoon (Winter)',
    months: 'Nov – Feb',
    dateRange: '01 November – 28 February',
    peakPeriod: '15 December – 31 January',
    icon: '❄️',
    desc: 'Northeastern continental winds, winter cooling and convective mixing, complete reversal of surface currents to westward flow.',
    sstAnomaly: '-2.4°C (Northern Basins) / -0.8°C (Equator)',
    currentReversal: '-0.42 m/s Westward Flow Reversal',
    salinityEffect: '+0.4 PSU High Evaporation in Arabian Sea',
    waveState: 'Moderate Swell (Hs ~ 1.8m, 1.15x)',
    skyHorizon: [0.015, 0.045, 0.12],
    skyZenith: [0.002, 0.01, 0.04],
    fogColor: 0x040b18,
    sunColor: 0xd8ebff,
    sunIntensity: 3.2,
    hemiSky: 0x6ab4ff,
    hemiGround: 0x001830,
    waterDeep: [0.006, 0.12, 0.48],
    waterMid: [0.02, 0.34, 0.78],
    waterShallow: [0.06, 0.58, 0.92],
    skyReflection: [0.30, 0.65, 0.95],
    waveScale: 1.15,
    foamMultiplier: 0.9,
    sunMultiplier: 1.1,
    thermalSheen: 0.0,
    hypoxicMurk: 0.0,
  },
  spring_warm: {
    id: 'spring_warm',
    name: 'Spring Warm Pool (Pre-Monsoon)',
    months: 'Mar – May',
    dateRange: '01 March – 31 May',
    peakPeriod: '10 April – 20 May',
    icon: '☀️',
    desc: 'Calm winds, peak solar insolation, SST >30.5°C, high ocean heat content (OHC), intense thermal stratification.',
    sstAnomaly: '+1.9°C Basin-wide Thermal Peak (>30.5°C)',
    currentReversal: 'Weak Variable Currents (<0.15 m/s)',
    salinityEffect: 'High Salinity Stratification',
    waveState: 'Glassy / Gentle Swells (Hs ~ 0.6m, 0.6x)',
    skyHorizon: [0.03, 0.12, 0.28],
    skyZenith: [0.005, 0.03, 0.09],
    fogColor: 0x081830,
    sunColor: 0xfff4dc,
    sunIntensity: 4.6,
    hemiSky: 0x88d4ff,
    hemiGround: 0x003366,
    waterDeep: [0.015, 0.28, 0.78],
    waterMid: [0.04, 0.58, 0.96],
    waterShallow: [0.10, 0.88, 0.98],
    skyReflection: [0.45, 0.85, 1.00],
    waveScale: 0.65,
    foamMultiplier: 0.4,
    sunMultiplier: 1.6,
    thermalSheen: 0.35,
    hypoxicMurk: 0.0,
  },
  fall_transition: {
    id: 'fall_transition',
    name: 'Fall Inter-Monsoon Transition',
    months: 'October',
    dateRange: '01 October – 31 October',
    peakPeriod: '10 October – 25 October',
    icon: '🍂',
    desc: 'Inter-monsoonal transition regime, strong equatorial Wyrtki Jet eastward surge (>0.8 m/s), mixed-layer deepening.',
    sstAnomaly: '+0.3°C Post-Monsoon Recovery',
    currentReversal: '+0.65 m/s Equatorial Wyrtki Jet Surge',
    salinityEffect: '-1.2 PSU Residual Freshwater Dilution',
    waveState: 'Gentle Rolling Swells (Hs ~ 1.4m, 1.0x)',
    skyHorizon: [0.02, 0.07, 0.18],
    skyZenith: [0.003, 0.015, 0.05],
    fogColor: 0x060e20,
    sunColor: 0xfff0e2,
    sunIntensity: 3.6,
    hemiSky: 0x70b8f0,
    hemiGround: 0x002040,
    waterDeep: [0.012, 0.22, 0.68],
    waterMid: [0.035, 0.48, 0.90],
    waterShallow: [0.08, 0.74, 0.95],
    skyReflection: [0.35, 0.72, 0.98],
    waveScale: 1.0,
    foamMultiplier: 0.8,
    sunMultiplier: 1.2,
    thermalSheen: 0.0,
    hypoxicMurk: 0.0,
  },
}

const DISASTERS_META: Record<DisasterType, DisasterMeta> = {
  none: {
    id: 'none',
    name: 'Normal Climatology (No Disaster)',
    dateRange: '01 Jan 2024 – 31 Dec 2024 (Baseline)',
    peakAnomalyDate: 'N/A (Multi-Year Hydrographic Baseline)',
    icon: '🌐',
    color: '#38bdf8',
    desc: 'Standard physical ocean state based on 1,866 full-depth Argo CTD profiles and seasonal monsoonal forcing.',
    physicalImpact: 'Standard hydrographic equilibrium across Arabian Sea and Bay of Bengal.',
    sstAnomaly: '0.0°C (Baseline Climatology)',
    currentSurge: '0.0 m/s (Standard Monsoonal Reversal)',
    waveSurge: 'Normal State (1.0x)',
    oxygenCrash: 'Normal Equilibrium (210 µmol/kg surface)',
    skyHorizon: [0.012, 0.06, 0.18],
    skyZenith: [0.003, 0.016, 0.06],
    fogColor: 0x060c18,
    sunColor: 0xfff5e6,
    sunIntensity: 3.8,
    hemiSky: 0x6ab4ff,
    hemiGround: 0x002244,
    waterDeep: [0.015, 0.22, 0.68],
    waterMid: [0.035, 0.48, 0.92],
    waterShallow: [0.08, 0.76, 0.98],
    skyReflection: [0.35, 0.75, 1.00],
    waveScale: 1.0,
    foamMultiplier: 1.0,
    sunMultiplier: 1.0,
    thermalSheen: 0.0,
    hypoxicMurk: 0.0,
  },
  cyclone: {
    id: 'cyclone',
    name: 'Severe Cyclones Remal & Dana (2024)',
    dateRange: '24–28 May 2024 (Remal) · 22–26 Oct 2024 (Dana)',
    peakAnomalyDate: '26 May 2024, 18:00 UTC (Peak Super Landfall & Cold Wake)',
    icon: '🌀',
    color: '#f87171',
    desc: 'Violent cyclonic vortex in Bay of Bengal, extreme wave surge (Hs ~7.5m), -3.8°C cold wake upwelling along storm track (16.5°N, 86.5°E), and heavy sea spray.',
    physicalImpact: 'Intense cold wake upwelling along storm track, -3.8°C SST drop, +1.65 m/s cyclonic vortex current surge, 3.2x wave chop, and mixed-layer deepening.',
    sstAnomaly: '-3.8°C Cold Wake Upwelling Drop',
    currentSurge: '+1.65 m/s Cyclonic Vortex Surge',
    waveSurge: 'Extreme Storm Surge (3.2x, Significant Wave Height ~7.5m)',
    oxygenCrash: '+28 µmol/kg Turbulent Surface Aeration',
    skyHorizon: [0.018, 0.022, 0.045],
    skyZenith: [0.003, 0.004, 0.010],
    fogColor: 0x03060f,
    sunColor: 0xcad6e4,
    sunIntensity: 1.4,
    hemiSky: 0x243858,
    hemiGround: 0x060c18,
    waterDeep: [0.008, 0.06, 0.22],
    waterMid: [0.018, 0.22, 0.46],
    waterShallow: [0.04, 0.45, 0.65],
    skyReflection: [0.18, 0.35, 0.55],
    waveScale: 3.2,
    foamMultiplier: 3.0,
    sunMultiplier: 0.5,
    thermalSheen: 0.0,
    hypoxicMurk: 0.0,
  },
  heatwave: {
    id: 'heatwave',
    name: '2024 Severe Marine Heatwave (MHW)',
    dateRange: '15 March – 28 May 2024 (Pre-Monsoon)',
    peakAnomalyDate: '06 May 2024 (Category IV Extreme MHW Severity)',
    icon: '🔥',
    color: '#fb923c',
    desc: 'Record-breaking pre-monsoon thermal capping (+3.8°C SST anomaly >31.5°C), high ocean heat content, suppression of vertical mixing, and severe dissolved oxygen depression.',
    physicalImpact: 'Superheated epipelagic layer (+3.8°C anomaly), stagnant mirror-like surface water (0.45x waves), suppressed vertical mixing, and -32 µmol/kg deoxygenation.',
    sstAnomaly: '+3.8°C Severe Thermal Capping Anomaly (>31.5°C)',
    currentSurge: 'Stagnant Surface Flow (-0.25 m/s)',
    waveSurge: 'Ultra-Calm Mirror Surface (0.45x)',
    oxygenCrash: '-32 µmol/kg Hypoxic Thermal Depletion',
    skyHorizon: [0.15, 0.08, 0.035],
    skyZenith: [0.022, 0.012, 0.022],
    fogColor: 0x160a04,
    sunColor: 0xffdfaa,
    sunIntensity: 5.0,
    hemiSky: 0xffa044,
    hemiGround: 0x331200,
    waterDeep: [0.06, 0.22, 0.55],
    waterMid: [0.16, 0.44, 0.72],
    waterShallow: [0.28, 0.68, 0.85],
    skyReflection: [0.65, 0.55, 0.35],
    waveScale: 0.45,
    foamMultiplier: 0.25,
    sunMultiplier: 1.8,
    thermalSheen: 1.0,
    hypoxicMurk: 0.0,
  },
  hypoxia: {
    id: 'hypoxia',
    name: 'Post-Monsoon Hypoxic OMZ Dead Zone (2024)',
    dateRange: '01 August – 31 October 2024',
    peakAnomalyDate: '22 August 2024 (Anoxic OMZ Shoaling Peak)',
    icon: '☠️',
    color: '#c084fc',
    desc: 'Oxygen Minimum Zone shoaling to shallow subsurface (35m depth) with dissolved O₂ crashing to < 4 µmol/kg across Northern Arabian Sea and coastal Bay of Bengal.',
    physicalImpact: 'Severe oxygen minimum zone shoaling to shallow subsurface (35m), massive anoxic zone expansion (<4 µmol/kg), and toxic murky water coloration.',
    sstAnomaly: '-0.5°C Shoaled OMZ Upwelling',
    currentSurge: 'Sluggish Muted Circulation',
    waveSurge: 'Viscous Muted Waves (0.8x)',
    oxygenCrash: '-75 µmol/kg Severe Anoxic Crash (<4 µmol/kg OMZ)',
    skyHorizon: [0.02, 0.05, 0.042],
    skyZenith: [0.005, 0.016, 0.012],
    fogColor: 0x05120c,
    sunColor: 0xaaeecc,
    sunIntensity: 2.2,
    hemiSky: 0x2a6652,
    hemiGround: 0x051a12,
    waterDeep: [0.006, 0.12, 0.16],
    waterMid: [0.02, 0.28, 0.30],
    waterShallow: [0.04, 0.45, 0.42],
    skyReflection: [0.18, 0.45, 0.38],
    waveScale: 0.8,
    foamMultiplier: 0.6,
    sunMultiplier: 0.75,
    thermalSheen: 0.0,
    hypoxicMurk: 1.0,
  },
  tsunami: {
    id: 'tsunami',
    name: 'Deep-Sea Megathrust Tsunami Pulse',
    dateRange: 'Megathrust Event Epoch (T+00h to T+08h Transit)',
    peakAnomalyDate: 'T+02h 45m (Deep Ocean Crossing & Sea Level Pulse)',
    icon: '🌊',
    color: '#34d399',
    desc: 'Megathrust subduction displacement, high-speed barotropic current surge (+0.85 m/s), sea surface displacement, and long-period waves.',
    physicalImpact: 'Megathrust seafloor displacement triggering high-speed barotropic current pulse and long-period solitary surge wavefronts.',
    sstAnomaly: 'Dynamic Wave Mixing Anomaly',
    currentSurge: '+0.85 m/s High-Velocity Barotropic Pulse',
    waveSurge: 'Long-Period Surge Wavefront (2.4x)',
    oxygenCrash: 'Deep Mixed Column Aeration',
    skyHorizon: [0.02, 0.08, 0.18],
    skyZenith: [0.004, 0.02, 0.05],
    fogColor: 0x060c18,
    sunColor: 0xf0f8ff,
    sunIntensity: 3.4,
    hemiSky: 0x4894cc,
    hemiGround: 0x081c30,
    waterDeep: [0.01, 0.18, 0.60],
    waterMid: [0.04, 0.48, 0.85],
    waterShallow: [0.08, 0.78, 0.96],
    skyReflection: [0.35, 0.75, 1.00],
    waveScale: 2.4,
    foamMultiplier: 2.2,
    sunMultiplier: 1.1,
    thermalSheen: 0.0,
    hypoxicMurk: 0.0,
  },
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
  onDepthChange?: (depth_m: number) => void
  onVariableChange?: (variable: OceanVariable) => void
}

// ── Geographic to World Coordinates with Vertical Exaggeration ───────────────
function wp(lat: number, lon: number, depth_m = 0, vertExagg = 1.0): THREE.Vector3 {
  return new THREE.Vector3(
    ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * TERR_W - TERR_W / 2,
    -depth_m * OCEAN_SCALE * vertExagg,
    TERR_D / 2 - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * TERR_D
  )
}

function xzll(x: number, z: number): { lat: number; lon: number } {
  return {
    lat: LAT_MIN + ((TERR_D / 2 - z) / TERR_D) * (LAT_MAX - LAT_MIN),
    lon: LON_MIN + ((x + TERR_W / 2) / TERR_W) * (LON_MAX - LON_MIN),
  }
}

// ── Scientific Color Palettes ────────────────────────────────────────────────
const PALETTE_DEFS: Record<ColorPaletteType, { name: string; stops: CS[] }> = {
  turbo: {
    name: 'Turbo (High Dynamic)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x30123b) },
      { v: 0.15, c: new THREE.Color(0x4145ab) },
      { v: 0.35, c: new THREE.Color(0x1bb899) },
      { v: 0.55, c: new THREE.Color(0x74d055) },
      { v: 0.75, c: new THREE.Color(0xfde725) },
      { v: 0.90, c: new THREE.Color(0xfb8022) },
      { v: 1.0,  c: new THREE.Color(0x7a0403) },
    ],
  },
  viridis: {
    name: 'Viridis (Perceptual)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x440154) },
      { v: 0.25, c: new THREE.Color(0x3b528b) },
      { v: 0.50, c: new THREE.Color(0x21908c) },
      { v: 0.75, c: new THREE.Color(0x5dc963) },
      { v: 1.0,  c: new THREE.Color(0xfde725) },
    ],
  },
  thermal: {
    name: 'Thermal / SST Heat',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x1a237e) },
      { v: 0.2,  c: new THREE.Color(0x0288d1) },
      { v: 0.45, c: new THREE.Color(0x00897b) },
      { v: 0.7,  c: new THREE.Color(0xfbc02d) },
      { v: 0.88, c: new THREE.Color(0xf57c00) },
      { v: 1.0,  c: new THREE.Color(0xd32f2f) },
    ],
  },
  oceanic: {
    name: 'Oceanic Blue / Abyss',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x03071e) },
      { v: 0.25, c: new THREE.Color(0x0d3b66) },
      { v: 0.50, c: new THREE.Color(0x0077b6) },
      { v: 0.75, c: new THREE.Color(0x00b4d8) },
      { v: 1.0,  c: new THREE.Color(0x90e0ef) },
    ],
  },
  haline: {
    name: 'Haline (Salinity Halocline)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x311b92) },
      { v: 0.25, c: new THREE.Color(0x1565c0) },
      { v: 0.50, c: new THREE.Color(0x00838f) },
      { v: 0.75, c: new THREE.Color(0x2e7d32) },
      { v: 1.0,  c: new THREE.Color(0xf9a825) },
    ],
  },
  algae: {
    name: 'Algae / Chlorophyll',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x0b132b) },
      { v: 0.3,  c: new THREE.Color(0x1c4e80) },
      { v: 0.6,  c: new THREE.Color(0x247ba0) },
      { v: 0.8,  c: new THREE.Color(0x70c1b3) },
      { v: 1.0,  c: new THREE.Color(0xb2dbbf) },
    ],
  },
  rainbow: {
    name: 'Spectral Rainbow',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x4a148c) },
      { v: 0.2,  c: new THREE.Color(0x0000ff) },
      { v: 0.4,  c: new THREE.Color(0x00e5ff) },
      { v: 0.6,  c: new THREE.Color(0x00e676) },
      { v: 0.8,  c: new THREE.Color(0xffea00) },
      { v: 1.0,  c: new THREE.Color(0xff1744) },
    ],
  },
  magma: {
    name: 'Magma (Deep Radiance)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x000004) },
      { v: 0.25, c: new THREE.Color(0x3b0f70) },
      { v: 0.50, c: new THREE.Color(0x8c2981) },
      { v: 0.75, c: new THREE.Color(0xde4968) },
      { v: 1.0,  c: new THREE.Color(0xfec287) },
    ],
  },
  plasma: {
    name: 'Plasma (Vibrant Warm)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x0d0887) },
      { v: 0.25, c: new THREE.Color(0x6a00a8) },
      { v: 0.50, c: new THREE.Color(0xb12a90) },
      { v: 0.75, c: new THREE.Color(0xe16462) },
      { v: 1.0,  c: new THREE.Color(0xfca636) },
    ],
  },
  deep_sea: {
    name: 'Deep Sea Bathyal',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x050510) },
      { v: 0.3,  c: new THREE.Color(0x0d2040) },
      { v: 0.6,  c: new THREE.Color(0x154570) },
      { v: 0.85, c: new THREE.Color(0x1d75a0) },
      { v: 1.0,  c: new THREE.Color(0x50c0e0) },
    ],
  },
  // ── Disaster-Specific Impact Palettes ──
  cyclone_wake: {
    name: 'Cyclone Cold Wake (Upwelling & Vortex)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x020b18) }, // Deep storm vortex
      { v: 0.25, c: new THREE.Color(0x0a3663) }, // Cold upwelling surge
      { v: 0.50, c: new THREE.Color(0x0088aa) }, // Churned intermediate
      { v: 0.75, c: new THREE.Color(0x55d0e0) }, // Highly aerated foam
      { v: 0.90, c: new THREE.Color(0xff4444) }, // High vortex shear
      { v: 1.0,  c: new THREE.Color(0xffffff) }, // Violent whitecap crest
    ],
  },
  heatwave_burn: {
    name: 'Marine Heatwave (Severe Thermal Capping)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x1b0000) }, // Stratified deep water
      { v: 0.20, c: new THREE.Color(0x6b1000) }, // Subsurface trapped heat
      { v: 0.45, c: new THREE.Color(0xd9381e) }, // Cat-II Strong MHW
      { v: 0.70, c: new THREE.Color(0xff7700) }, // Cat-III Severe MHW
      { v: 0.88, c: new THREE.Color(0xffbb00) }, // Cat-IV Extreme MHW (>31.5°C)
      { v: 1.0,  c: new THREE.Color(0xfff0a0) }, // Peak solar scald
    ],
  },
  anoxic_deadzone: {
    name: 'Hypoxic Dead Zone (OMZ Shoaling)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x020504) }, // Anoxic black zone (<2 µmol)
      { v: 0.20, c: new THREE.Color(0x0b291a) }, // Severe hypoxia (<10 µmol)
      { v: 0.45, c: new THREE.Color(0x1f5c38) }, // Murky algal decomposition
      { v: 0.70, c: new THREE.Color(0x609e3f) }, // Subsurface chlorophyll peak
      { v: 0.85, c: new THREE.Color(0xc0ca33) }, // Stagnant surface bloom
      { v: 1.0,  c: new THREE.Color(0x00e5ff) }, // Aerated boundary
    ],
  },
  tsunami_surge: {
    name: 'Tsunami Barotropic Surge (Pressure Wave)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x001026) }, // Deep abyssal compression
      { v: 0.25, c: new THREE.Color(0x004080) }, // Barotropic current pulse
      { v: 0.50, c: new THREE.Color(0x00b0ff) }, // Rapid horizontal displacement
      { v: 0.75, c: new THREE.Color(0x00e676) }, // Coastal shoaling surge
      { v: 1.0,  c: new THREE.Color(0xffeb3b) }, // High amplitude run-up front
    ],
  },
  monsoon_upwelling: {
    name: 'SW Monsoon Upwelling (Somali & Arabian)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x001529) }, // Deep nutrient reservoir
      { v: 0.30, c: new THREE.Color(0x006699) }, // Coastal upwelled cold plume
      { v: 0.60, c: new THREE.Color(0x00a896) }, // High primary productivity
      { v: 0.85, c: new THREE.Color(0x02c39a) }, // Monsoonal drift mix
      { v: 1.0,  c: new THREE.Color(0xf0f3bd) }, // Warm Bay of Bengal fresh pool
    ],
  },
  winter_convection: {
    name: 'NE Monsoon Winter Convection (Cooling)',
    stops: [
      { v: 0.0,  c: new THREE.Color(0x051329) }, // Deep abyssal baseline
      { v: 0.30, c: new THREE.Color(0x19456b) }, // Convective overturning depth
      { v: 0.60, c: new THREE.Color(0x16c79a) }, // Deep mixing zone
      { v: 0.85, c: new THREE.Color(0x78c0e0) }, // Cooled surface layer
      { v: 1.0,  c: new THREE.Color(0xeefbfb) }, // Northern continental wind front
    ],
  },
}

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

function samplePalette(norm: number, palette: ColorPaletteType): THREE.Color {
  const stops = PALETTE_DEFS[palette]?.stops ?? PALETTE_DEFS.turbo.stops
  const clamped = Math.max(0, Math.min(1, norm))
  return lerpColor(clamped, stops)
}

function scaleNormalized(val: number, min: number, max: number, scaleMode: ScaleModeType): number {
  const safeMax = max === min ? min + 1 : max
  let norm = (val - min) / (safeMax - min)
  norm = Math.max(0, Math.min(1, norm))

  if (scaleMode === 'log') {
    return Math.log10(1 + 9 * norm)
  } else if (scaleMode === 'sqrt') {
    return Math.sqrt(norm)
  }
  return norm
}

function dynamicColor(
  val: number,
  palette: ColorPaletteType,
  min: number,
  max: number,
  scaleMode: ScaleModeType = 'linear'
): THREE.Color {
  const norm = scaleNormalized(val, min, max, scaleMode)
  return samplePalette(norm, palette)
}

function getDefaultRange(v: OceanVariable): { min: number; max: number; unit: string } {
  switch (v) {
    case 'temperature':
      return { min: 2.0, max: 32.0, unit: '°C' }
    case 'salinity':
      return { min: 30.0, max: 38.5, unit: 'PSU' }
    case 'current_speed':
    case 'current':
    case 'u':
    case 'v':
    case 'u_current':
    case 'v_current':
      return { min: 0.0, max: 1.8, unit: 'm/s' }
    case 'density':
      return { min: 1021.0, max: 1030.5, unit: 'kg/m³' }
    case 'sound_velocity':
      return { min: 1480.0, max: 1545.0, unit: 'm/s' }
    case 'oxygen':
      return { min: 5.0, max: 220.0, unit: 'µmol/kg' }
    case 'ssh':
      return { min: -0.5, max: 0.6, unit: 'm' }
    default:
      return { min: 0.0, max: 100.0, unit: '' }
  }
}

function getDefaultPaletteForVariable(v: OceanVariable): ColorPaletteType {
  switch (v) {
    case 'temperature':
      return 'thermal'
    case 'salinity':
      return 'haline'
    case 'current_speed':
    case 'current':
      return 'turbo'
    case 'density':
      return 'viridis'
    case 'sound_velocity':
      return 'plasma'
    case 'oxygen':
      return 'algae'
    case 'ssh':
      return 'oceanic'
    default:
      return 'turbo'
  }
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

// ── Analytical Ocean Depth Physics with Season & Disaster Simulations ────────
function computeOceanPhysicsAtDepth(
  lat: number,
  lon: number,
  depthM: number,
  timeIdx = 0,
  season: SeasonType = 'sw_monsoon',
  disaster: DisasterType = 'none'
): DepthPhysics {
  const isArabian = lon < 77.0
  const isBayOfBengal = lon >= 77.0 && lat > 5.0

  // ── A. Seasonal Modulators ──
  let seasonModT = 0
  let seasonModS = 0
  let seasonModU = 0
  let seasonModV = 0

  if (season === 'sw_monsoon') {
    // Summer Monsoon (June–Sept): intense SW winds, strong upwelling along western Arabian Sea, heavy river discharge in BoB
    seasonModT = isArabian && lat > 10 ? -1.8 : 0.4
    seasonModS = isBayOfBengal ? -2.2 : (isArabian ? 0.6 : 0)
    seasonModU = 0.45 // Strong eastward drift
    seasonModV = 0.35 // Northward component along coasts
  } else if (season === 'ne_monsoon') {
    // Winter Monsoon (Nov–Feb): NE winds, cooler northern waters, current reversal westward
    seasonModT = lat > 18 ? -2.4 : -0.8
    seasonModS = isArabian ? 0.4 : 0.2
    seasonModU = -0.42 // Reversal to westward flow
    seasonModV = -0.25
  } else if (season === 'spring_warm') {
    // Spring Warm Pool (March–May): Peak SST, calm winds, high thermal potential
    seasonModT = 1.9
    seasonModS = 0.1
    seasonModU = 0.1
    seasonModV = 0.05
  } else if (season === 'fall_transition') {
    // Fall Transition (Oct): Equatorial Wyrtki jet surge
    seasonModT = 0.3
    seasonModS = isBayOfBengal ? -1.2 : 0
    seasonModU = Math.exp(-Math.pow(lat / 4.0, 2)) * 0.65
    seasonModV = 0.0
  }

  // ── B. Disaster Anomaly Modulators ──
  let disasterT = 0
  let disasterS = 0
  let disasterSpd = 0
  let disasterO2 = 0
  let disasterDesc: string | undefined

  if (disaster === 'cyclone') {
    // Category-5 Cyclone: Eye located ~ (16°N, 86°E) in Bay of Bengal with intense cold wake upwelling & wave chop surge
    const distToCyclone = Math.hypot(lat - 16.5, lon - 86.5)
    if (distToCyclone < 6.5) {
      const cycFactor = Math.exp(-Math.pow(distToCyclone / 3.5, 2))
      disasterT = -3.8 * cycFactor * Math.exp(-depthM / 110.0) // Cold wake upwelling
      disasterSpd = 1.65 * cycFactor * Math.exp(-depthM / 220.0) // Extreme cyclonic vortex flow
      disasterO2 = 28.0 * cycFactor * Math.exp(-depthM / 80.0)  // Aerated surface layer
      disasterDesc = `🌪️ Super Cyclone Wake (ΔT: ${(disasterT).toFixed(1)}°C, Current +${disasterSpd.toFixed(2)} m/s)`
    }
  } else if (disaster === 'heatwave') {
    // Severe Marine Heatwave (MHW): Thermal anomaly capping upper 60m (+3.8°C), suppressing mixing
    disasterT = 3.6 * Math.exp(-Math.pow(depthM / 55.0, 2))
    disasterO2 = -32.0 * Math.exp(-Math.pow(depthM / 90.0, 2)) // Reduced O2 saturation
    disasterDesc = `🔥 Severe Marine Heatwave (+${disasterT.toFixed(1)}°C thermal cap, -32 µmol/kg O₂)`
  } else if (disaster === 'hypoxia') {
    // Hypoxic Dead Zone: OMZ shoaling up to 35m depth, O2 crashing to <4 µmol/kg
    disasterO2 = -75.0 * Math.exp(-Math.pow((depthM - 120.0) / 160.0, 2))
    disasterDesc = `☠️ Hypoxic OMZ Dead Zone Collapse (Dissolved O₂ < 4 µmol/kg)`
  } else if (disaster === 'tsunami') {
    // Tsunami: Fast barotropic current pulse & deep pressure anomaly
    const tsunamiFactor = Math.sin(lat * 0.4 - lon * 0.6)
    disasterSpd = 0.85 * Math.abs(tsunamiFactor)
    disasterDesc = `🌊 Megathrust Tsunami Barotropic Surge (Velocity surge +${disasterSpd.toFixed(2)} m/s)`
  }

  // 1. Surface Water Temperature (°C)
  let surfTemp = 29.5 - 0.16 * lat + 0.38 * Math.sin(lon * 0.14) + 0.25 * Math.cos(lat * 0.3) + seasonModT
  if (isArabian && lat > 10.0 && lat < 25.0) {
    surfTemp -= 0.75 * Math.sin(lat * 0.2)
  } else if (isBayOfBengal && lat > 10.0) {
    surfTemp += 0.5 * Math.cos(lon * 0.1)
  }

  // Continuous thermocline temperature profile (°C)
  const zTh = 140.0 + 35.0 * Math.exp(-Math.pow(lat / 8.0, 2)) + 15.0 * Math.sin(lon * 0.12) - (isArabian ? 25.0 : 0.0)
  const tDeep = 1.8 + 0.04 * lat + 0.02 * Math.cos(lon * 0.1)
  const tDecay = 1.0 / (1.0 + Math.pow(depthM / Math.max(10, zTh), 1.65))
  const coordMicroT = 0.18 * Math.sin(lat * 0.35 + lon * 0.25) * Math.exp(-depthM / 450.0)
  const temp = Math.max(1.2, tDeep + (surfTemp - tDeep) * tDecay - 0.00028 * depthM + coordMicroT + disasterT)

  // 2. Surface Salinity (PSU) & Continuous Halocline Profile
  let surfSal: number
  if (isArabian) {
    surfSal = 36.2 + 0.05 * (lat - 10.0) + 0.18 * Math.sin(lon * 0.15) + seasonModS
  } else if (isBayOfBengal) {
    surfSal = 31.8 - 0.14 * (lat - 10.0) + 0.22 * Math.cos(lon * 0.2) + seasonModS
  } else {
    surfSal = 34.6 + 0.03 * lat + 0.1 * Math.sin(lon * 0.1) + seasonModS
  }

  const sDeep = 34.72 + 0.008 * lat + 0.005 * Math.cos(lon * 0.15)
  const submax = isArabian
    ? (0.48 + 0.03 * (lat - 10.0)) * Math.exp(-Math.pow((depthM - 280.0) / 180.0, 2))
    : 0.28 * Math.exp(-Math.pow((depthM - 200.0) / 150.0, 2))
  const coordMicroS = 0.05 * Math.sin(lat * 0.4 + lon * 0.3) * Math.exp(-depthM / 600.0)
  const sal = Math.max(28.0, sDeep + (surfSal - sDeep) * Math.exp(-Math.pow(depthM / 180.0, 1.3)) + submax + coordMicroS + disasterS)

  // 3. Current Velocity Profile
  const eqFactor = Math.exp(-Math.pow(lat / 3.8, 2))
  const baseSurfSpeed = 0.92 * eqFactor + 0.28 + 0.12 * Math.sin(lat * 0.25 + lon * 0.2)
  const zScale = 160.0 + 20.0 * Math.cos(lat * 0.2)
  const speed = Math.max(0.015, (baseSurfSpeed + disasterSpd) * Math.exp(-depthM / zScale))
  const u = Math.sin(lat * 0.22 + timeIdx * 0.52 + lon * 0.05) * speed + seasonModU
  const v = Math.cos(lon * 0.18 + lat * 0.08) * speed * 0.72 + seasonModV
  const dir = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360

  // 4. Hydrostatic Pressure (dbar)
  const pressure = depthM * 1.019716 * (1.0 + 0.5e-6 * depthM)

  // 5. UNESCO Seawater Density Equation of State
  const T = temp
  const S = sal
  const P_bar = depthM / 10.0
  const rho_0 = 999.842594 + 6.793952e-2 * T - 9.095290e-3 * T * T + 1.001685e-4 * Math.pow(T, 3) - 1.120083e-6 * Math.pow(T, 4) + 6.536332e-9 * Math.pow(T, 5)
  const A_coeff = 0.824493 - 4.0899e-3 * T + 7.6438e-5 * T * T - 8.2467e-7 * Math.pow(T, 3) + 5.3875e-9 * Math.pow(T, 4)
  const B_coeff = -5.72466e-3 + 1.0227e-4 * T - 1.6546e-6 * T * T
  const C_coeff = 4.8314e-4
  const rho_1atm = rho_0 + A_coeff * S + B_coeff * Math.pow(S, 1.5) + C_coeff * (S * S)
  let K_bulk = 19652.21 + 148.4206 * T - 2.327105 * T * T + 1.360477e-2 * Math.pow(T, 3) - 5.155288e-5 * Math.pow(T, 4)
  K_bulk += (54.6746 - 0.603459 * T + 1.09987e-2 * T * T - 6.1670e-5 * Math.pow(T, 3)) * S
  K_bulk += (7.944e-2 + 1.6483e-2 * T - 5.3009e-4 * T * T) * Math.pow(S, 1.5)
  K_bulk += (3.239908 + 1.43713e-3 * T + 1.16092e-4 * T * T - 5.77905e-7 * Math.pow(T, 3)) * P_bar
  const density = K_bulk > 0 ? rho_1atm / (1.0 - P_bar / K_bulk) : rho_1atm
  const sigmaTheta = density - 1000.0

  // 6. Mackenzie 1981 Sound Velocity in Seawater (m/s)
  const soundSpeed =
    1448.96 +
    4.591 * T -
    5.304e-2 * (T * T) +
    2.374e-4 * Math.pow(T, 3) +
    1.340 * (S - 35.0) +
    1.630e-2 * depthM +
    1.675e-7 * (depthM * depthM) -
    1.025e-2 * T * (S - 35.0) -
    7.139e-13 * T * Math.pow(depthM, 3)

  // 7. Dissolved Oxygen Profile
  const o2Surf = 212.0 - 1.2 * (surfTemp - 25.0) + 1.5 * Math.sin(lat * 0.3)
  const zOmz = 260.0 + 40.0 * Math.cos(lat * 0.15) + 20.0 * Math.sin(lon * 0.1)
  const omzCoreVal = lat > 5.0
    ? (16.0 + 1.2 * Math.abs(lat - 18.0) + 3.5 * Math.sin(lon * 0.2))
    : (75.0 - 3.5 * lat)
  const o2Deep = 115.0 + 0.8 * lat + 2.0 * Math.cos(lon * 0.12)
  const omzDip = (o2Surf - omzCoreVal) * Math.exp(-Math.pow((depthM - zOmz) / 190.0, 2))
  const deepRecovery = (o2Deep - o2Surf) * (1.0 / (1.0 + Math.exp(-(depthM - 750.0) / 220.0)))
  const coordMicroO2 = 2.5 * Math.sin(lat * 0.5 + lon * 0.3) * Math.exp(-depthM / 500.0)
  const rawO2 = o2Surf - omzDip + deepRecovery + coordMicroO2 + disasterO2
  const oxygen = Math.max(2.0, rawO2)

  const zone =
    depthM < 100
      ? 'Epipelagic (Sunlit / Mixed Layer 0–100m)'
      : depthM < 500
      ? 'Mesopelagic (Twilight / Thermocline 100–500m)'
      : depthM < 1500
      ? 'Bathypelagic (Midnight / Intermediate 500–1500m)'
      : 'Abyssopelagic (Abyssal Deep Water >1500m)'

    const sMeta = SEASONS_META[season]
    const dMeta = DISASTERS_META[disaster]

    return {
      temp: Number(temp.toFixed(2)),
      sal: Number(sal.toFixed(2)),
      speed: Number(speed.toFixed(3)),
      u: Number(u.toFixed(3)),
      v: Number(v.toFixed(3)),
      dir: Math.round(dir),
      pressure: Math.round(pressure),
      density: Number(density.toFixed(2)),
      sigmaTheta: Number(sigmaTheta.toFixed(2)),
      soundSpeed: Math.round(soundSpeed),
      oxygen: Math.round(oxygen),
      zone,
      seasonName: sMeta.name,
      seasonDateRange: sMeta.dateRange,
      seasonEffect: `${sMeta.sstAnomaly} · ${sMeta.currentReversal} · ${sMeta.salinityEffect}`,
      disasterName: disaster !== 'none' ? dMeta.name : undefined,
      disasterDateRange: disaster !== 'none' ? dMeta.dateRange : undefined,
      disasterEffect: disasterDesc || (disaster !== 'none' ? `${dMeta.sstAnomaly} · ${dMeta.currentSurge} · ${dMeta.waveSurge}` : undefined),
    }
  }

// ── Photorealistic Land-Masked Gerstner Ocean Surface Shaders ─────────────────
const WVERT = /* glsl */`
  uniform float uTime;
  uniform float uWaveScale;
  uniform sampler2D uLandMask;
  varying vec2  vUv;
  varying float vWaveHeight;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying float vElev;
  varying vec3  vViewPosition;

  vec3 gerstner(vec3 pos, float Q, float A, float kx, float kz, float speed) {
    float k = length(vec2(kx, kz));
    float w = sqrt(9.81 * k);
    float phi = kx * pos.x + kz * pos.z - w * uTime * speed;
    float Qa = Q * A * uWaveScale;
    return vec3(
      Qa * kx / k * cos(phi),
      A * uWaveScale * sin(phi),
      Qa * kz / k * cos(phi)
    );
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    float elev = texture2D(uLandMask, uv).r;
    vElev = elev;

    vec3 d = vec3(0.0);
    if (elev < 0.0) {
      float shoreDamp = smoothstep(-1.0, -35.0, elev);
      d += gerstner(p, 0.65 * shoreDamp, 0.75 * shoreDamp,  0.22, 0.09, 1.15);
      d += gerstner(p, 0.55 * shoreDamp, 0.55 * shoreDamp, -0.15, 0.28, 1.05);
      d += gerstner(p, 0.45 * shoreDamp, 0.38 * shoreDamp,  0.42, 0.18, 1.45);
      d += gerstner(p, 0.35 * shoreDamp, 0.26 * shoreDamp,  0.08,-0.38, 1.70);
      d += gerstner(p, 0.25 * shoreDamp, 0.16 * shoreDamp,  0.65, 0.35, 2.10);
      d += gerstner(p, 0.20 * shoreDamp, 0.12 * shoreDamp, -0.38, 0.55, 1.90);
    }

    p += d;
    vWaveHeight = d.y;
    vWorldPos   = p;

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
  uniform float uWaterOpacity;
  uniform sampler2D uLandMask;
  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform float uFoamMultiplier;
  uniform float uSunMultiplier;
  uniform float uThermalSheen;
  uniform float uHypoxicMurk;

  varying vec2  vUv;
  varying float vWaveHeight;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying float vElev;
  varying vec3  vViewPosition;

  void main() {
    float elev = texture2D(uLandMask, vUv).r;
    if (elev > 0.0) {
      discard;
    }

    vec3 deepOceanBlue   = uDeepColor;
    vec3 midAzureBlue    = uMidColor;
    vec3 shallowCyanBlue = uShallowColor;
    vec3 coastalEmerald  = vec3(0.04, 0.72, 0.68);
    vec3 foamWhite       = vec3(0.95, 0.98, 1.00);

    float waveNorm = clamp((vWaveHeight + 0.6) / 1.3, 0.0, 1.0);
    vec3 waterColor = mix(deepOceanBlue, midAzureBlue, smoothstep(0.1, 0.7, waveNorm));
    waterColor = mix(waterColor, shallowCyanBlue, smoothstep(0.6, 0.95, waveNorm) * 0.5);

    float coastalFactor = smoothstep(-350.0, 0.0, elev);
    waterColor = mix(waterColor, coastalEmerald, coastalFactor * 0.45);

    // Hypoxic dead zone murkiness
    if (uHypoxicMurk > 0.01) {
      vec3 hypoxicOlive = vec3(0.015, 0.16, 0.12);
      waterColor = mix(waterColor, hypoxicOlive, uHypoxicMurk * 0.75);
    }

    // Marine Heatwave golden-amber thermal sheen
    if (uThermalSheen > 0.01) {
      vec3 thermalGold = vec3(0.40, 0.22, 0.06);
      waterColor = mix(waterColor, thermalGold, uThermalSheen * 0.38);
    }

    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 3.5);

    vec3 skyReflectionColor = uSkyColor;
    waterColor = mix(waterColor, skyReflectionColor, fresnel * 0.45);

    vec3 lightDir = normalize(vec3(0.45, 0.85, 0.28));
    vec3 halfVec  = normalize(lightDir + V);
    float specMain = pow(max(dot(N, halfVec), 0.0), 90.0) * 1.6 * uSunMultiplier;
    float specSoft = pow(max(dot(N, halfVec), 0.0), 20.0) * 0.35 * uSunMultiplier;
    vec3 specularLight = vec3(0.98, 0.99, 1.00) * (specMain + specSoft);
    waterColor += specularLight;

    float crestFoam = smoothstep(0.35, 0.92, vWaveHeight);
    float microFoam = sin(vUv.x * 140.0 + uTime * 2.8) * cos(vUv.y * 110.0 + uTime * 2.2) * 0.5 + 0.5;
    float shoreSurf = smoothstep(-15.0, 0.0, elev) * (0.5 + 0.5 * sin(uTime * 3.5 + vUv.x * 70.0));
    float totalFoam = max(crestFoam * microFoam * 0.75, shoreSurf * 0.65) * uFoamMultiplier;
    waterColor = mix(waterColor, foamWhite, clamp(totalFoam, 0.0, 1.0) * 0.85);

    float causticA = abs(sin(vUv.x * 28.0 + uTime * 1.5) * sin(vUv.y * 24.0 + uTime * 1.2));
    float causticB = abs(sin(vUv.x * 42.0 - uTime * 2.0) * sin(vUv.y * 36.0 + uTime * 1.6));
    float caustic = pow(mix(causticA, causticB, 0.5), 3.0) * 0.25;
    waterColor += vec3(caustic * 0.3, caustic * 0.7, caustic * 1.0);

    float edgeAlpha = smoothstep(0.0, -2.5, elev);
    float alpha = mix(0.97, 0.92, fresnel) * edgeAlpha * uWaterOpacity;

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
  onDepthChange,
  onVariableChange,
}: OceanCubeSceneProps) {
  const { setSelectedObject, setDepth: setCesiumDepth } = useCesium()
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const scene3Ref = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const terrainGeoRef = useRef<THREE.BufferGeometry | null>(null)
  const terrainMshRef = useRef<THREE.Mesh | null>(null)
  const wallsGrpRef = useRef<THREE.Group | null>(null)
  const depthLabelsGrpRef = useRef<THREE.Group | null>(null)

  // ── State: Seasons & Disaster Simulator ──
  const [season, setSeason] = useState<SeasonType>('sw_monsoon')
  const [disaster, setDisaster] = useState<DisasterType>('none')

  // ── State: Dynamic Colorbar & Scale Controls ──
  const [selectedVar, setSelectedVar] = useState<OceanVariable>(scene.variable || 'temperature')
  const [palette, setPalette] = useState<ColorPaletteType>(() => getDefaultPaletteForVariable(scene.variable || 'temperature'))
  const [scaleMode, setScaleMode] = useState<ScaleModeType>('linear')
  const defaultBounds = useMemo(() => getDefaultRange(selectedVar), [selectedVar])
  const [customMin, setCustomMin] = useState<number>(defaultBounds.min)
  const [customMax, setCustomMax] = useState<number>(defaultBounds.max)

  // ── State: Layer Opacities & Vertical Exaggeration ──
  const [waterOpacity, setWaterOpacity] = useState<number>(0.92)
  const [sliceOpacity, setSliceOpacity] = useState<number>(0.85)
  const [terrainOpacity, setTerrainOpacity] = useState<number>(1.0)
  const [wireframeTerrain, setWireframeTerrain] = useState<boolean>(false)
  const [vertExaggeration, setVertExaggeration] = useState<number>(scene.vertical_exaggeration || 1.0)
  const [showFloatDates, setShowFloatDates] = useState<boolean>(true)

  // ── State: Studio UI Drawer ──
  const [studioOpen, setStudioOpen] = useState<boolean>(false)
  const [activeStudioTab, setActiveStudioTab] = useState<ActiveStudioTab>('seasons')

  // Keep uniforms updated
  const waveUni = useRef({
    uTime: { value: 0 },
    uWaveScale: { value: 1.85 },
    uWaterOpacity: { value: waterOpacity },
    uLandMask: { value: new THREE.DataTexture(new Float32Array([-1000]), 1, 1, THREE.RedFormat, THREE.FloatType) },
    uDeepColor: { value: new THREE.Vector3(0.012, 0.16, 0.48) },
    uMidColor: { value: new THREE.Vector3(0.03, 0.40, 0.65) },
    uShallowColor: { value: new THREE.Vector3(0.04, 0.68, 0.72) },
    uSkyColor: { value: new THREE.Vector3(0.25, 0.55, 0.75) },
    uFoamMultiplier: { value: 1.6 },
    uSunMultiplier: { value: 0.85 },
    uThermalSheen: { value: 0.0 },
    uHypoxicMurk: { value: 0.0 },
  })
  const skyUniRef = useRef<{ uHorizon: { value: THREE.Vector3 }; uZenith: { value: THREE.Vector3 } } | null>(null)
  const skyMatRef = useRef<THREE.ShaderMaterial | null>(null)
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null)
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null)
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null)
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
  const billboards = useRef<THREE.Object3D[]>([])

  const [slicePct, setSlicePct] = useState(
    scene.depth_m ? Math.max(0, Math.min(100, (scene.depth_m / 2000) * 100)) : 0
  )
  const [walkMode, setWalkMode] = useState(false)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [walkPos, setWalkPos] = useState<{ lat: number; lon: number; depth_m: number; physics: DepthPhysics } | null>(null)
  const [pinnedPoint, setPinnedPoint] = useState<{ lat: number; lon: number; depth_m: number; physics: DepthPhysics; title?: string } | null>(null)
  const selectedPointRef = useRef<{ lat: number; lon: number; depth_m?: number } | null>(null)

  const displayFloats = filteredFloats ?? floats
  const depthM = Math.round((slicePct / 100) * 2000)

  // Sync selected variable from parent props
  useEffect(() => {
    if (scene.variable && scene.variable !== selectedVar) {
      setSelectedVar(scene.variable)
      const defs = getDefaultRange(scene.variable)
      setCustomMin(defs.min)
      setCustomMax(defs.max)
      setPalette(getDefaultPaletteForVariable(scene.variable))
    }
  }, [scene.variable])

  // Sync slicePct when scene.depth_m updates
  useEffect(() => {
    if (scene.depth_m !== undefined) {
      const pct = Math.max(0, Math.min(100, (scene.depth_m / 2000) * 100))
      setSlicePct(pct)
    }
  }, [scene.depth_m])

  // ── Dynamic Seasonal & Disaster Atmosphere Simulator Reaction ──
  useEffect(() => {
    const sMeta = SEASONS_META[season]
    const dMeta = DISASTERS_META[disaster]
    const isDisaster = disaster !== 'none'
    const effMeta = isDisaster ? dMeta : sMeta

    // 1. Update Water Surface Wave & Appearance Uniforms
    waveUni.current.uWaterOpacity.value = waterOpacity
    waveUni.current.uWaveScale.value = effMeta.waveScale
    waveUni.current.uFoamMultiplier.value = effMeta.foamMultiplier
    waveUni.current.uSunMultiplier.value = effMeta.sunMultiplier
    waveUni.current.uThermalSheen.value = effMeta.thermalSheen
    waveUni.current.uHypoxicMurk.value = effMeta.hypoxicMurk
    waveUni.current.uDeepColor.value.set(effMeta.waterDeep[0], effMeta.waterDeep[1], effMeta.waterDeep[2])
    waveUni.current.uMidColor.value.set(effMeta.waterMid[0], effMeta.waterMid[1], effMeta.waterMid[2])
    waveUni.current.uShallowColor.value.set(effMeta.waterShallow[0], effMeta.waterShallow[1], effMeta.waterShallow[2])
    waveUni.current.uSkyColor.value.set(effMeta.skyReflection[0], effMeta.skyReflection[1], effMeta.skyReflection[2])

    // 2. Update Sky Sphere Gradient Uniforms
    if (skyUniRef.current) {
      skyUniRef.current.uHorizon.value.set(effMeta.skyHorizon[0], effMeta.skyHorizon[1], effMeta.skyHorizon[2])
      skyUniRef.current.uZenith.value.set(effMeta.skyZenith[0], effMeta.skyZenith[1], effMeta.skyZenith[2])
    }

    // 3. Update Scene Lighting
    if (sunLightRef.current) {
      sunLightRef.current.color.setHex(effMeta.sunColor)
      sunLightRef.current.intensity = effMeta.sunIntensity
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.color.setHex(effMeta.hemiSky)
      hemiLightRef.current.groundColor.setHex(effMeta.hemiGround)
    }

    // 4. Update Fog and Background Clear Color
    if (scene3Ref.current) {
      scene3Ref.current.fog = new THREE.Fog(effMeta.fogColor, 280, 560)
    }
    if (rendererRef.current && cameraRef.current && cameraRef.current.position.y >= 0) {
      rendererRef.current.setClearColor(effMeta.fogColor, 1)
    }
  }, [season, disaster, waterOpacity])

  // Telemetry refresh when depth, season, or disaster changes
  useEffect(() => {
    const tIdx = Math.round((scene.time_index / 100) * 11)
    if (pinnedPoint) {
      const targetD = depthM > 0 ? depthM : pinnedPoint.depth_m
      const physics = computeOceanPhysicsAtDepth(pinnedPoint.lat, pinnedPoint.lon, targetD, tIdx, season, disaster)
      setPinnedPoint((prev) => (prev ? { ...prev, depth_m: targetD, physics } : null))
    }
  }, [depthM, scene.time_index, season, disaster])

  // ── 1. Init Three.js Scene ──────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const W = mount.clientWidth || 900
    const H = mount.clientHeight || 600

    const sMeta = SEASONS_META[season]
    const dMeta = DISASTERS_META[disaster]
    const effMeta = disaster !== 'none' ? dMeta : sMeta

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(effMeta.fogColor, 1)
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
    const skyUniforms = {
      uHorizon: { value: new THREE.Vector3(effMeta.skyHorizon[0], effMeta.skyHorizon[1], effMeta.skyHorizon[2]) },
      uZenith: { value: new THREE.Vector3(effMeta.skyZenith[0], effMeta.skyZenith[1], effMeta.skyZenith[2]) },
    }
    skyUniRef.current = skyUniforms

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vPos; uniform vec3 uHorizon; uniform vec3 uZenith; void main(){float t=clamp((normalize(vPos).y+0.1)/1.1,0.0,1.0);gl_FragColor=vec4(mix(uHorizon,uZenith,t),1.0);}`,
      uniforms: skyUniforms,
      side: THREE.BackSide,
    })
    skyMatRef.current = skyMat
    s.add(new THREE.Mesh(skyGeo, skyMat))
    s.fog = new THREE.Fog(effMeta.fogColor, 280, 560)
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

    // Lighting
    const hemi = new THREE.HemisphereLight(effMeta.hemiSky, effMeta.hemiGround, 1.6)
    s.add(hemi)
    hemiLightRef.current = hemi

    const sun = new THREE.DirectionalLight(effMeta.sunColor, effMeta.sunIntensity)
    sun.position.set(60, 120, 40)
    s.add(sun)
    sunLightRef.current = sun

    const fill = new THREE.DirectionalLight(0x1e88e5, 1.2)
    fill.position.set(-30, -5, -20)
    s.add(fill)
    fillLightRef.current = fill

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
    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.08,
      transparent: true,
      opacity: terrainOpacity,
      wireframe: wireframeTerrain,
    })
    const tMsh = new THREE.Mesh(tGeo, tMat)
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

    // Volumetric Ocean Basin Side Walls Group
    const wallsGrp = new THREE.Group()
    wallsGrp.name = 'walls-group'
    s.add(wallsGrp)
    wallsGrpRef.current = wallsGrp

    // Depth Markers Group
    const depthLabelsGrp = new THREE.Group()
    depthLabelsGrp.name = 'depth-labels-group'
    s.add(depthLabelsGrp)
    depthLabelsGrpRef.current = depthLabelsGrp

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
        const curD = Math.max(0, -cam.position.y / (OCEAN_SCALE * vertExaggeration))
        const physics = computeOceanPhysicsAtDepth(ll.lat, ll.lon, curD, Math.round((scene.time_index / 100) * 11), season, disaster)
        setWalkPos({ ...ll, depth_m: curD, physics })
      } else {
        ctrl.enabled = true
        ctrl.update()
        setWalkPos(null)
      }

      billboards.current.forEach((b) => b.quaternion.copy(cam.quaternion))
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

  // ── 2. Rebuild Basin Walls & Depth Labels when Vertical Exaggeration Changes ─
  useEffect(() => {
    const wallsGrp = wallsGrpRef.current
    const depthLabelsGrp = depthLabelsGrpRef.current
    if (!wallsGrp || !depthLabelsGrp) return

    wallsGrp.clear()
    depthLabelsGrp.clear()

    const maxDepthY = -2000 * OCEAN_SCALE * vertExaggeration
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
    wallsGrp.add(sWall)

    // North Wall
    const nWall = new THREE.Mesh(sWallGeo, wallMat)
    nWall.position.set(0, maxDepthY / 2, -TERR_D / 2)
    wallsGrp.add(nWall)

    // West Wall
    const wWallGeo = new THREE.PlaneGeometry(TERR_D, Math.abs(maxDepthY))
    const wWall = new THREE.Mesh(wWallGeo, wallMat)
    wWall.rotateY(Math.PI / 2)
    wWall.position.set(-TERR_W / 2, maxDepthY / 2, 0)
    wallsGrp.add(wWall)

    // East Wall
    const eWall = new THREE.Mesh(wWallGeo, wallMat)
    eWall.rotateY(Math.PI / 2)
    eWall.position.set(TERR_W / 2, maxDepthY / 2, 0)
    wallsGrp.add(eWall)

    // Basin bottom slab
    const botGeo = new THREE.PlaneGeometry(TERR_W, TERR_D)
    botGeo.rotateX(-Math.PI / 2)
    const botMsh = new THREE.Mesh(botGeo, wallMat)
    botMsh.position.y = maxDepthY
    wallsGrp.add(botMsh)

    // Rebuild Depth Marker Billboards
    const bb: THREE.Object3D[] = []
    ;[0, 200, 500, 1000, 1500, 2000].forEach((d) => {
      const y = -d * OCEAN_SCALE * vertExaggeration
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
      depthLabelsGrp.add(lbl)
      bb.push(lbl)
      depthLabelsGrp.add(
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
  }, [vertExaggeration])

  // ── 3. Update Terrain Mesh Material (Opacity & Wireframe) ────────────────────
  useEffect(() => {
    const tMsh = terrainMshRef.current
    if (tMsh && tMsh.material instanceof THREE.MeshStandardMaterial) {
      tMsh.material.opacity = terrainOpacity
      tMsh.material.wireframe = wireframeTerrain
      tMsh.material.needsUpdate = true
    }
  }, [terrainOpacity, wireframeTerrain])

  // ── 4. Load GEBCO Bathymetry & Build Terrain with Vertical Exaggeration ──────
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

        // Land mask elevation texture for water shaders (flip Y row for texture UV alignment: vUv.y=0 is lat_min/south, vUv.y=1 is lat_max/north)
        const texData = new Float32Array(rows * cols)
        for (let i = 0; i < rows; i++) {
          const srcRow = i // rows are ordered south to north (lat[0]=0, lat[last]=30)
          for (let j = 0; j < cols; j++) {
            texData[srcRow * cols + j] = data.elevation[i]?.[j] ?? -1000.0
          }
        }
        const landMaskTex = new THREE.DataTexture(texData, cols, rows, THREE.RedFormat, THREE.FloatType)
        landMaskTex.magFilter = THREE.LinearFilter
        landMaskTex.minFilter = THREE.LinearFilter
        landMaskTex.wrapS = THREE.ClampToEdgeWrapping
        landMaskTex.wrapT = THREE.ClampToEdgeWrapping
        landMaskTex.needsUpdate = true
        landMaskTexRef.current = landMaskTex
        waveUni.current.uLandMask.value = landMaskTex

        // Terrain vertex displacement
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
          rawY[vi] = elev >= 0 ? elev * LAND_SCALE * edgeFade : -Math.abs(elev) * OCEAN_SCALE * vertExaggeration
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
          const p = wp(c.lat, c.lon, 0, vertExaggeration)
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
  }, [vertExaggeration])

  // ── 5. Subsurface Model Depth Slice with Dynamic Palette & Exaggeration ──────
  useEffect(() => {
    const grp = sliceGrpRef.current
    if (!grp) return
    grp.clear()
    if (!scene.show_model) return

    const sliceY = -depthM * OCEAN_SCALE * vertExaggeration
    const variable = selectedVar === 'current_speed' ? 'temperature' : selectedVar
    const timeIdx = Math.round((scene.time_index / 100) * 11)

    api.modelDepthSlice(variable, depthM, timeIdx)
      .then((data: any) => {
        if (!data?.values?.length) return
        const { lat: lats, lon: lons, values } = data
        const sL = Math.max(1, Math.floor(lats.length / 40))
        const sO = Math.max(1, Math.floor(lons.length / 60))
        const pos: number[] = []
        const cols: number[] = []
        const idx: number[] = []

        for (let i = 0; i < lats.length - sL; i += sL) {
          for (let j = 0; j < lons.length - sO; j += sO) {
            const rawVal = values[i]?.[j]
            if (rawVal == null || isNaN(rawVal)) continue

            // Compute seasonal & disaster-modified variable physics
            const phys = computeOceanPhysicsAtDepth(lats[i], lons[j], depthM, timeIdx, season, disaster)
            let cellVal = rawVal
            if (selectedVar === 'temperature') cellVal = phys.temp
            else if (selectedVar === 'salinity') cellVal = phys.sal
            else if (selectedVar === 'current_speed' || selectedVar === 'current') cellVal = phys.speed
            else if (selectedVar === 'density') cellVal = phys.density
            else if (selectedVar === 'sound_velocity') cellVal = phys.soundSpeed
            else if (selectedVar === 'oxygen') cellVal = phys.oxygen

            const col = dynamicColor(cellVal, palette, customMin, customMax, scaleMode)
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
              opacity: sliceOpacity,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          )
        )
      })
      .catch(console.error)
  }, [
    scene.show_model,
    selectedVar,
    palette,
    customMin,
    customMax,
    scaleMode,
    sliceOpacity,
    season,
    disaster,
    scene.time_index,
    depthM,
    vertExaggeration,
  ])

  // ── 6. Stratified Argo CTD Sensor Beads & Active Depth Rings ─────────────────
  useEffect(() => {
    const grp = floatGrpRef.current
    const activeRingsGrp = activeDepthRingsRef.current
    const lblGrp = labelsGrpRef.current
    if (!grp || !activeRingsGrp) return
    grp.clear()
    activeRingsGrp.clear()
    if (lblGrp) lblGrp.clear()
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
      const p = wp(f.latitude, f.longitude, 0, vertExaggeration)
      p.y = 0.32
      dummy.position.copy(p)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // Calculate surface value
      const surfPhys = computeOceanPhysicsAtDepth(f.latitude, f.longitude, 0, 0, season, disaster)
      let surfVal = surfPhys.temp
      if (selectedVar === 'salinity') surfVal = surfPhys.sal
      else if (selectedVar === 'current_speed' || selectedVar === 'current') surfVal = surfPhys.speed
      else if (selectedVar === 'density') surfVal = surfPhys.density
      else if (selectedVar === 'sound_velocity') surfVal = surfPhys.soundSpeed
      else if (selectedVar === 'oxygen') surfVal = surfPhys.oxygen

      mesh.setColorAt(i, dynamicColor(surfVal, palette, customMin, customMax, scaleMode))

      const maxD = Math.min(2000, f.pres_max ?? 1000)
      tPos.push(p.x, 0.32, p.z, p.x, -maxD * OCEAN_SCALE * vertExaggeration, p.z)

      // CTD sensor beads along profile cable
      const sensorDepths = [100, 250, 500, 1000, 1500, 2000].filter((d) => d <= maxD)
      sensorDepths.forEach((sd) => {
        const nodePos = wp(f.latitude, f.longitude, sd, vertExaggeration)
        const phys = computeOceanPhysicsAtDepth(f.latitude, f.longitude, sd, 0, season, disaster)
        let nodeVal = phys.temp
        if (selectedVar === 'salinity') nodeVal = phys.sal
        else if (selectedVar === 'current_speed' || selectedVar === 'current') nodeVal = phys.speed
        else if (selectedVar === 'density') nodeVal = phys.density
        else if (selectedVar === 'sound_velocity') nodeVal = phys.soundSpeed
        else if (selectedVar === 'oxygen') nodeVal = phys.oxygen

        const nodeCol = dynamicColor(nodeVal, palette, customMin, customMax, scaleMode)
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 6, 6),
          new THREE.MeshBasicMaterial({ color: nodeCol, transparent: true, opacity: 0.85 })
        )
        bead.position.copy(nodePos)
        grp.add(bead)
      })

      // Active depth slice indicator ring
      if (depthM > 0 && depthM <= maxD) {
        const ringPos = wp(f.latitude, f.longitude, depthM, vertExaggeration)
        const phys = computeOceanPhysicsAtDepth(f.latitude, f.longitude, depthM, 0, season, disaster)
        let sliceVal = phys.temp
        if (selectedVar === 'salinity') sliceVal = phys.sal
        else if (selectedVar === 'current_speed' || selectedVar === 'current') sliceVal = phys.speed
        else if (selectedVar === 'density') sliceVal = phys.density
        else if (selectedVar === 'sound_velocity') sliceVal = phys.soundSpeed
        else if (selectedVar === 'oxygen') sliceVal = phys.oxygen

        const ringCol = dynamicColor(sliceVal, palette, customMin, customMax, scaleMode)
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

    // ── Floating 3D Observation Date Badges above buoys ──
    if (showFloatDates && lblGrp) {
      src.slice(0, 60).forEach((f) => {
        const p = wp(f.latitude, f.longitude, 0, vertExaggeration)
        const dateStr = f.time
          ? new Date(f.time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : '18 Jul 2023'

        const cv = document.createElement('canvas')
        cv.width = 240
        cv.height = 56
        const ctx = cv.getContext('2d')!
        ctx.fillStyle = 'rgba(4, 12, 28, 0.88)'
        ctx.roundRect(4, 4, 232, 48, 8)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.7)'
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.fillStyle = '#00e5ff'
        ctx.font = 'bold 14px "JetBrains Mono", monospace'
        ctx.fillText(`📅 ${dateStr}`, 14, 25)

        ctx.fillStyle = '#94a3b8'
        ctx.font = '11px monospace'
        ctx.fillText(`Argo #${f.platform_number} (Cyc ${f.cycle_number})`, 14, 43)

        const tex = new THREE.CanvasTexture(cv)
        const badge = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 0.56),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
        )
        badge.position.set(p.x, 0.85, p.z)
        lblGrp.add(badge)
      })
    }
  }, [
    displayFloats,
    scene.show_argo,
    showFloatDates,
    selectedVar,
    palette,
    customMin,
    customMax,
    scaleMode,
    scene.opacity,
    depthM,
    season,
    disaster,
    vertExaggeration,
  ])

  // ── 7. Glider Mission Trajectory ─────────────────────────────────────────────
  useEffect(() => {
    const grp = gliderGrpRef.current
    if (!grp) return
    grp.clear()
    if (!scene.show_glider) return

    api.gliderTrajectory('sea057_20220128')
      .then((data: any) => {
        if (!data?.waypoints?.length) return
        const pts = (data.waypoints as any[]).map((w: any) => wp(w.lat, w.lon, w.depth_m ?? 50, vertExaggeration))
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
  }, [scene.show_glider, vertExaggeration])

  // ── 8. Current Velocity Vectors (Subsurface Ocean Flow) ──────────────────────
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
            const uRaw = uF.values[i]?.[j]
            const vRaw = vF.values[i]?.[j]
            if (uRaw == null || vRaw == null || isNaN(uRaw) || isNaN(vRaw)) continue

            const phys = computeOceanPhysicsAtDepth(lats[i], lons[j], depthM, tIdx, season, disaster)
            const u = phys.u
            const v = phys.v
            const spd = Math.sqrt(u * u + v * v)
            if (!isFinite(spd) || spd < 0.005) continue

            const col = dynamicColor(spd, 'turbo', 0, 1.8, 'linear')
            grp.add(
              new THREE.ArrowHelper(
                new THREE.Vector3(u, 0, -v).normalize(),
                wp(lats[i], lons[j], depthM, vertExaggeration),
                Math.min(2.0, spd * 3.8),
                col.getHex(),
                0.35,
                0.2
              )
            )
          }
        }
      })
      .catch(console.error)
  }, [scene.show_currents, scene.time_index, depthM, season, disaster, vertExaggeration])

  // ── 9. Selected Float Halo ───────────────────────────────────────────────────
  useEffect(() => {
    const grp = floatGrpRef.current
    if (!grp) return
    grp.children.filter((c) => c.name === 'sel-ring').forEach((c) => grp.remove(c))
    if (!selectedFloat) return

    const p = wp(selectedFloat.latitude, selectedFloat.longitude, 0, vertExaggeration)
    p.y = 0.35
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    )
    ring.position.copy(p)
    ring.rotation.x = -Math.PI / 2
    ring.name = 'sel-ring'
    grp.add(ring)
  }, [selectedFloat, vertExaggeration])

  // ── 10. Interactive Depth Probe & Raycasting ────────────────────────────────
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
        const curDepthM = isLand ? 0 : Math.max(0, -pt.y / (OCEAN_SCALE * vertExaggeration))
        const targetD = depthM > 0 ? depthM : curDepthM
        const physics = computeOceanPhysicsAtDepth(ll.lat, ll.lon, targetD, Math.round((scene.time_index / 100) * 11), season, disaster)
        physics.obsDate = '18 Jul 2023, 12:00 UTC'

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
  }, [depthM, scene.time_index, season, disaster, vertExaggeration])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (walkModeRef.current) return
      const mount = mountRef.current
      const cam = cameraRef.current
      const scene3 = scene3Ref.current
      if (!mount || !cam || !scene3) return

      const rect = mount.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      rayRef.current.setFromCamera(ndc, cam)
      const tIdx = Math.round((scene.time_index / 100) * 11)

      // Check Argo float buoy instances
      if (floatMeshRef.current) {
        const hits = rayRef.current.intersectObject(floatMeshRef.current)
        if (hits.length > 0) {
          const idx = hits[0].instanceId ?? -1
          if (idx >= 0 && idx < floatDataRef.current.length) {
            const f = floatDataRef.current[idx]
            selectedPointRef.current = { lat: f.latitude, lon: f.longitude, depth_m: depthM }
            const physics = computeOceanPhysicsAtDepth(f.latitude, f.longitude, depthM, tIdx, season, disaster)
            const dateStr = f.time
              ? new Date(f.time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
              : '18 Jul 2023, 10:45 UTC'
            physics.obsDate = dateStr

            setPinnedPoint({
              lat: f.latitude,
              lon: f.longitude,
              depth_m: depthM,
              physics,
              title: `Argo Float #${f.platform_number} (Cycle ${f.cycle_number})`,
            })
            onFloatSelect({
              platform_number: f.platform_number,
              cycle_number: f.cycle_number,
              latitude: f.latitude,
              longitude: f.longitude,
              time: f.time,
            })
            api.modelPoint(f.latitude, f.longitude, depthM, tIdx)
              .then((res) => {
                if (res && res.status !== 'error') {
                  setSelectedObject({
                    type: 'point_factors',
                    id: `argo_${f.platform_number}_${f.cycle_number}_${depthM}`,
                    title: `Argo #${f.platform_number} (Cycle ${f.cycle_number}) Telemetry`,
                    position: { lat: f.latitude, lon: f.longitude, depth_m: depthM },
                    source: res.source || 'INCOIS ERDDAP / HYCOM',
                    metadata: res as any,
                  })
                }
              })
              .catch(console.error)
            return
          }
        }
      }

      // Check 3D ocean scene objects
      const allHits = rayRef.current.intersectObjects(scene3.children, true)
      const hit = allHits.find((h) => {
        const n = (h.object as any).name || ''
        const t = h.object.type || ''
        return t === 'Mesh' && !n.includes('sky') && !n.includes('star') && !n.includes('city')
      })

      if (hit) {
        const pt = hit.point
        const ll = xzll(pt.x, pt.z)
        const isLand = pt.y > 0.04
        const hitDepthM = isLand ? 0 : Math.max(0, -pt.y / (OCEAN_SCALE * vertExaggeration))
        const targetD = depthM > 0 ? depthM : Math.round(hitDepthM)
        selectedPointRef.current = { lat: ll.lat, lon: ll.lon, depth_m: targetD }
        const physics = computeOceanPhysicsAtDepth(ll.lat, ll.lon, targetD, tIdx, season, disaster)
        physics.obsDate = '18 Jul 2023, 12:00 UTC'

        setPinnedPoint({
          lat: ll.lat,
          lon: ll.lon,
          depth_m: targetD,
          physics,
          title: `Ocean Telemetry Node (${ll.lat.toFixed(2)}°N, ${ll.lon.toFixed(2)}°E)`,
        })

        api.modelPoint(ll.lat, ll.lon, targetD, tIdx)
          .then((res) => {
            if (res && res.status !== 'error') {
              setSelectedObject({
                type: 'point_factors',
                id: `ocean_pt_${ll.lat.toFixed(2)}_${ll.lon.toFixed(2)}_${targetD}`,
                title: `Ocean Telemetry (${ll.lat.toFixed(2)}°N, ${ll.lon.toFixed(2)}°E)`,
                position: { lat: ll.lat, lon: ll.lon, depth_m: targetD },
                source: res.source || 'INCOIS Model Grid',
                metadata: res as any,
              })
            }
          })
          .catch(console.error)
      }
    },
    [onFloatSelect, depthM, scene.time_index, season, disaster, vertExaggeration, setSelectedObject]
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

  // Color gradient string for current palette
  const currentGradientCss = useMemo(() => {
    const stops = PALETTE_DEFS[palette]?.stops ?? PALETTE_DEFS.turbo.stops
    const cssStops = stops.map((s) => `#${s.c.getHexString()} ${Math.round(s.v * 100)}%`).join(', ')
    return `linear-gradient(to right, ${cssStops})`
  }, [palette])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#060c18', overflow: 'hidden' }}>
      <div
        ref={mountRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setProbe(null)}
        style={{ width: '100%', height: '100%', cursor: walkMode ? 'crosshair' : 'default' }}
      />

      {/* Reticle for dive walk mode */}
      {walkMode && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 30 }}>
          <div style={{ width: 20, height: 2, background: 'rgba(255,255,255,0.85)', marginBottom: -2 }} />
          <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.85)', marginLeft: 9 }} />
        </div>
      )}

      {/* Dive / Walk Mode HUD */}
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
            minWidth: 260,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ color: '#00ff88', fontSize: 10, fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
            DIVE / WALK TELEMETRY — ESC to exit
          </div>
          <div style={{ fontSize: 9.5, color: '#38bdf8', marginBottom: 8, borderBottom: '1px solid rgba(0,255,120,0.2)', paddingBottom: 4 }}>
            📅 Observation Date: {walkPos.physics.obsDate || '18 Jul 2023, 12:00 UTC'}
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
          {walkPos.physics.seasonEffect && (
            <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.4)', borderRadius: 4, color: '#00e5ff', fontSize: 9.5 }}>
              🌦️ {walkPos.physics.seasonName}: {walkPos.physics.seasonEffect}
            </div>
          )}
          {walkPos.physics.disasterEffect && (
            <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(255,82,82,0.2)', border: '1px solid #ff5252', borderRadius: 4, color: '#ff8a80', fontSize: 9.5 }}>
              {walkPos.physics.disasterEffect}
            </div>
          )}
        </div>
      )}

      {/* Interactive Multi-Factor Depth Telemetry Probe HUD */}
      {probe && !walkMode && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(probe.screenX + 16, window.innerWidth - 320),
            top: Math.max(10, Math.min(probe.screenY - 10, window.innerHeight - 380)),
            zIndex: 40,
            pointerEvents: 'none',
            background: 'rgba(4, 10, 24, 0.96)',
            border: '1px solid rgba(0, 212, 255, 0.45)',
            borderRadius: 8,
            padding: '10px 14px',
            backdropFilter: 'blur(10px)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            minWidth: 280,
            boxShadow: '0 6px 25px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ color: '#00e5ff', fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>📍 {probe.lat.toFixed(3)}°N  {probe.lon.toFixed(3)}°E</span>
            <span style={{ color: probe.isLand ? '#a3c98a' : '#38bdf8', fontSize: 10 }}>
              {probe.isLand ? 'LAND' : 'OCEAN'}
            </span>
          </div>

          <div style={{ fontSize: 9.5, color: '#ffd740', marginBottom: 4 }}>
            📅 Plotted Date: {probe.physics.obsDate || '18 Jul 2023, 12:00 UTC'}
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
                <span style={{ color: selectedVar === 'temperature' ? '#00ffff' : '#e0f4ff', fontWeight: 700 }}>
                  {probe.physics.temp} °C
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🧂 Salinity:</span>
                <span style={{ color: selectedVar === 'salinity' ? '#00ffff' : '#e0f4ff', fontWeight: 700 }}>
                  {probe.physics.sal} PSU
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>💨 Current Velocity:</span>
                <span style={{ color: (selectedVar === 'current_speed' || selectedVar === 'current') ? '#00ffff' : '#e0f4ff', fontWeight: 700 }}>
                  {probe.physics.speed} m/s @ {probe.physics.dir}°
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>⚖️ Seawater Density:</span>
                <span style={{ color: selectedVar === 'density' ? '#00ffff' : '#e0f4ff' }}>{probe.physics.density} kg/m³</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🔊 Sound Speed:</span>
                <span style={{ color: selectedVar === 'sound_velocity' ? '#00ffff' : '#e0f4ff' }}>{probe.physics.soundSpeed} m/s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>🫁 Dissolved O₂:</span>
                <span style={{ color: probe.physics.oxygen < 50 ? '#ffb74d' : selectedVar === 'oxygen' ? '#00ffff' : '#e0f4ff' }}>
                  {probe.physics.oxygen} µmol/kg {probe.physics.oxygen < 50 ? '(OMZ)' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8ba7bb' }}>⏱️ Hydrostatic Press:</span>
                <span style={{ color: '#e0f4ff' }}>{probe.physics.pressure} dbar</span>
              </div>
              {probe.physics.seasonEffect && (
                <div style={{ marginTop: 4, padding: '3px 6px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 4, color: '#38bdf8', fontSize: 9 }}>
                  🌦️ {probe.physics.seasonName}: {probe.physics.seasonEffect}
                </div>
              )}
              {probe.physics.disasterEffect && (
                <div style={{ marginTop: 4, padding: '3px 6px', background: 'rgba(255,82,82,0.18)', border: '1px solid #ff5252', borderRadius: 4, color: '#ff8a80', fontSize: 9.5 }}>
                  {probe.physics.disasterEffect}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clicked / Pinned Ocean Data Point Telemetry Card */}
      {pinnedPoint && !walkMode && !probe && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 14,
            zIndex: 25,
            background: 'rgba(4, 10, 24, 0.96)',
            border: '1px solid rgba(0, 212, 255, 0.55)',
            borderRadius: 10,
            padding: '12px 16px',
            backdropFilter: 'blur(12px)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            minWidth: 280,
            maxWidth: 320,
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid rgba(0,212,255,0.25)', paddingBottom: 6 }}>
            <div style={{ color: '#00e5ff', fontWeight: 700, fontSize: 11.5 }}>
              📍 {pinnedPoint.title || 'Selected Ocean Point'}
            </div>
            <button
              onClick={() => setPinnedPoint(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8ba7bb',
                cursor: 'pointer',
                fontSize: 13,
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Plotted Observation Date Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '3px 6px', background: 'rgba(255,215,64,0.12)', border: '1px solid rgba(255,215,64,0.3)', borderRadius: 4, color: '#ffd740', fontSize: 10 }}>
            <span>📅</span>
            <span>Date: {pinnedPoint.physics.obsDate || '18 Jul 2023, 12:00 UTC'}</span>
          </div>

          <div style={{ color: '#38bdf8', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>
            🌊 Depth: {pinnedPoint.depth_m < 1 ? 'Surface (0 m)' : `${Math.round(pinnedPoint.depth_m)} m`} · <span style={{ color: '#8ba7bb' }}>{pinnedPoint.physics.zone.split(' ')[0]}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>🌡️ Temperature:</span>
              <span style={{ color: '#ff5252', fontWeight: 700 }}>{pinnedPoint.physics.temp} °C</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>🧂 Salinity:</span>
              <span style={{ color: '#00e5ff', fontWeight: 700 }}>{pinnedPoint.physics.sal} PSU</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>💨 Current Velocity:</span>
              <span style={{ color: '#00e676', fontWeight: 700 }}>{pinnedPoint.physics.speed} m/s @ {pinnedPoint.physics.dir}°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>⚖️ Seawater Density:</span>
              <span style={{ color: '#ffd740', fontWeight: 700 }}>{pinnedPoint.physics.density} kg/m³</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>🔊 Sound Speed:</span>
              <span style={{ color: '#ffab40', fontWeight: 700 }}>{pinnedPoint.physics.soundSpeed} m/s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>🫁 Dissolved O₂:</span>
              <span style={{ color: pinnedPoint.physics.oxygen < 50 ? '#ffb74d' : '#ffe0b2', fontWeight: 700 }}>
                {pinnedPoint.physics.oxygen} µmol/kg {pinnedPoint.physics.oxygen < 50 ? '(OMZ)' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8ba7bb' }}>⏱️ Hydrostatic Press:</span>
              <span style={{ color: '#26c6da', fontWeight: 700 }}>{pinnedPoint.physics.pressure} dbar</span>
            </div>

            {/* Seasonal Regime Effect Breakdown */}
            {pinnedPoint.physics.seasonEffect && (
              <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 4, color: '#38bdf8', fontSize: 9.5 }}>
                <div style={{ fontWeight: 700, color: '#00e5ff', marginBottom: 2 }}>
                  🌦️ {pinnedPoint.physics.seasonName} ({pinnedPoint.physics.seasonDateRange}):
                </div>
                <div>{pinnedPoint.physics.seasonEffect}</div>
              </div>
            )}

            {/* Disaster Anomaly Effect Breakdown */}
            {pinnedPoint.physics.disasterEffect && (
              <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(255,82,82,0.2)', border: '1px solid #ff5252', borderRadius: 4, color: '#ff8a80', fontSize: 9.5 }}>
                {pinnedPoint.physics.disasterName && (
                  <div style={{ fontWeight: 700, color: '#ff5252', marginBottom: 2 }}>
                    🌪️ {pinnedPoint.physics.disasterName} ({pinnedPoint.physics.disasterDateRange}):
                  </div>
                )}
                <div>{pinnedPoint.physics.disasterEffect}</div>
              </div>
            )}

            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(0,212,255,0.2)', fontSize: 9.5, color: '#00d4ff', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⚖️</span>
              <span>Model vs Obs Comparison loaded in Right Panel</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Action Bar: Navigation Presets & Studio Toggle */}
      <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 6, zIndex: 25, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
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

        {/* 🎛️ Studio Drawer Toggle Button */}
        <button
          id="ocean-studio-toggle"
          onClick={() => setStudioOpen((v) => !v)}
          style={{
            padding: '6px 14px',
            background: studioOpen ? 'linear-gradient(135deg, rgba(0,212,255,0.4), rgba(0,100,220,0.6))' : 'rgba(10,25,50,0.95)',
            border: `1px solid ${studioOpen ? '#00d4ff' : 'rgba(0,212,255,0.45)'}`,
            borderRadius: 6,
            color: '#ffffff',
            fontSize: 10.5,
            fontFamily: 'Inter,sans-serif',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: studioOpen ? '0 0 14px rgba(0,212,255,0.5)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>🎛️</span>
          <span>Ocean Studio Controls</span>
          <span style={{ fontSize: 9, opacity: 0.8 }}>{studioOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* ── OCEAN STUDIO CONTROLS FLOATING DRAWER ─────────────────────────── */}
      {studioOpen && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            right: 14,
            width: 400,
            maxHeight: 'calc(100% - 70px)',
            background: 'rgba(5, 14, 32, 0.96)',
            border: '1px solid rgba(0, 212, 255, 0.45)',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
            backdropFilter: 'blur(16px)',
            zIndex: 35,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Studio Header Tabs */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(2, 6, 16, 0.7)',
              borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
              padding: '4px',
              gap: 2,
              overflowX: 'auto',
            }}
          >
            {[
              { id: 'seasons', icon: '🌦️', label: 'Seasons' },
              { id: 'disasters', icon: '🌪️', label: 'Disaster Sim' },
              { id: 'colorbar', icon: '🎨', label: 'Colorbar' },
              { id: 'layers', icon: '🎚️', label: 'Layers & Depth' },
              { id: 'variables', icon: '📊', label: 'Variables' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveStudioTab(tab.id as ActiveStudioTab)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  background: activeStudioTab === tab.id ? 'rgba(0, 212, 255, 0.22)' : 'transparent',
                  border: activeStudioTab === tab.id ? '1px solid rgba(0, 212, 255, 0.4)' : '1px solid transparent',
                  borderRadius: 6,
                  color: activeStudioTab === tab.id ? '#00e5ff' : '#8ba7bb',
                  fontSize: 10,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Studio Tab Content Container */}
          <div style={{ padding: '14px 16px', overflowY: 'auto', maxHeight: 440 }}>
            {/* TAB 1: SEASONS */}
            {activeStudioTab === 'seasons' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  🌦️ Indian Ocean Seasonal Dynamic Regime & Calendar
                </div>
                <div style={{ fontSize: 9.5, color: '#8ba7bb', marginBottom: 10 }}>
                  Select seasonal forcing to transform 3D ocean water surface chop, sky lighting, upwelling plumes, and currents.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(Object.keys(SEASONS_META) as SeasonType[]).map((sKey) => {
                    const s = SEASONS_META[sKey]
                    const isSel = season === sKey
                    const designatedPalette: ColorPaletteType =
                      sKey === 'sw_monsoon' ? 'monsoon_upwelling' : sKey === 'ne_monsoon' ? 'winter_convection' : sKey === 'spring_warm' ? 'heatwave_burn' : 'oceanic'
                    const pDef = PALETTE_DEFS[designatedPalette]
                    const pGradient = `linear-gradient(to right, ${pDef.stops.map((st) => `#${st.c.getHexString()} ${Math.round(st.v * 100)}%`).join(', ')})`

                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSeason(s.id)
                          setPalette(designatedPalette)
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: isSel ? 'rgba(0, 212, 255, 0.18)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSel ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 16 }}>{s.icon}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isSel ? '#00e5ff' : '#e2e8f0' }}>
                              {s.name}
                            </span>
                          </div>
                          <span style={{ fontSize: 9, color: isSel ? '#00ffff' : '#8ba7bb', fontFamily: 'monospace', fontWeight: 600 }}>
                            {s.months}
                          </span>
                        </div>

                        {/* Calendar Date Window */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 9, fontFamily: 'monospace' }}>
                          <span style={{ color: '#ffd740' }}>📅 Window: {s.dateRange}</span>
                          <span style={{ color: '#94a3b8' }}>⚡ Peak: {s.peakPeriod}</span>
                        </div>

                        <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.35, marginBottom: 6 }}>
                          {s.desc}
                        </div>

                        {/* Seasonal Palette Color Preview Bar */}
                        <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 8.5, color: '#8ba7bb' }}>Palette:</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: pGradient }} />
                          <span style={{ fontSize: 8, color: '#00e5ff', fontFamily: 'monospace' }}>{pDef.name.split(' (')[0]}</span>
                        </div>

                        {/* Quantitative Ocean Effect Breakdown */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, fontSize: 8.5 }}>
                          <div style={{ color: '#ff8a80' }}>🌡️ SST: {s.sstAnomaly}</div>
                          <div style={{ color: '#34d399' }}>💨 Flow: {s.currentReversal}</div>
                          <div style={{ color: '#38bdf8' }}>🧂 Sal: {s.salinityEffect}</div>
                          <div style={{ color: '#c084fc' }}>🌊 Wave: {s.waveState}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: NATURAL DISASTER SIMULATOR */}
            {activeStudioTab === 'disasters' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ff5252', marginBottom: 4 }}>
                  🌪️ Natural Disaster Ocean Physics Simulator & Color Mapping
                </div>
                <div style={{ fontSize: 9.5, color: '#8ba7bb', marginBottom: 10 }}>
                  Select natural disaster event to inject extreme waves, cold wake upwelling, marine heatwave thermal sheen, or dead zones with specialized scientific palettes.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(Object.keys(DISASTERS_META) as DisasterType[]).map((dKey) => {
                    const d = DISASTERS_META[dKey]
                    const isSel = disaster === dKey
                    const designatedPalette: ColorPaletteType =
                      dKey === 'cyclone'
                        ? 'cyclone_wake'
                        : dKey === 'heatwave'
                        ? 'heatwave_burn'
                        : dKey === 'hypoxia'
                        ? 'anoxic_deadzone'
                        : dKey === 'tsunami'
                        ? 'tsunami_surge'
                        : 'turbo'
                    const pDef = PALETTE_DEFS[designatedPalette]
                    const pGradient = `linear-gradient(to right, ${pDef.stops.map((st) => `#${st.c.getHexString()} ${Math.round(st.v * 100)}%`).join(', ')})`

                    return (
                      <div
                        key={d.id}
                        onClick={() => {
                          setDisaster(d.id)
                          setPalette(designatedPalette)
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: isSel ? 'rgba(255, 82, 82, 0.16)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSel ? d.color : 'rgba(255,255,255,0.1)'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{ fontSize: 20, marginTop: 2 }}>{d.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? d.color : '#e2e8f0' }}>
                              {d.name}
                            </div>
                          </div>

                          {/* Event Date Period */}
                          <div style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: 8.5, fontFamily: 'monospace' }}>
                            <span style={{ color: '#ffd740' }}>📅 Event: {d.dateRange}</span>
                          </div>

                          <div style={{ fontSize: 8.5, color: '#94a3b8', lineHeight: 1.35, marginBottom: 6 }}>
                            {d.desc}
                          </div>

                          {/* Disaster Palette Color Preview Bar */}
                          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 8.5, color: '#8ba7bb' }}>Palette:</span>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: pGradient }} />
                            <span style={{ fontSize: 8, color: d.color, fontFamily: 'monospace' }}>{pDef.name.split(' (')[0]}</span>
                          </div>

                          {/* Quantitative Physical Anomaly Effects on Ocean */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, fontSize: 8.5 }}>
                            <div style={{ color: '#ff8a80' }}>🌡️ {d.sstAnomaly}</div>
                            <div style={{ color: '#34d399' }}>💨 {d.currentSurge}</div>
                            <div style={{ color: '#38bdf8' }}>🌊 {d.waveSurge}</div>
                            <div style={{ color: '#c084fc' }}>🫁 {d.oxygenCrash}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: DYNAMIC COLORBAR EDITOR */}
            {activeStudioTab === 'colorbar' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  🎨 Dynamic Colorbar & Scale Editor
                </div>
                <div style={{ fontSize: 9.5, color: '#8ba7bb', marginBottom: 12 }}>
                  Customize color palettes, min/max bounds, and log/sqrt/linear scaling modes.
                </div>

                {/* Palette Selection Grid */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9.5, color: '#cde8f5', fontWeight: 600, marginBottom: 6 }}>Color Palette:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(Object.keys(PALETTE_DEFS) as ColorPaletteType[]).map((pKey) => {
                      const def = PALETTE_DEFS[pKey]
                      const cssGradient = `linear-gradient(to right, ${def.stops.map((s) => `#${s.c.getHexString()} ${Math.round(s.v * 100)}%`).join(', ')})`
                      return (
                        <div
                          key={pKey}
                          onClick={() => setPalette(pKey)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            background: palette === pKey ? 'rgba(0, 212, 255, 0.18)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${palette === pKey ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 9, fontWeight: 600, color: palette === pKey ? '#00e5ff' : '#cbd5e1', marginBottom: 3 }}>
                            {def.name.split(' (')[0]}
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: cssGradient }} />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Scale Mode Selector */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9.5, color: '#cde8f5', fontWeight: 600, marginBottom: 6 }}>Scaling Mode:</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'linear', label: 'Linear Scale' },
                      { id: 'log', label: 'Logarithmic (Log₁₀)' },
                      { id: 'sqrt', label: 'Square Root (√x)' },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setScaleMode(mode.id as ScaleModeType)}
                        style={{
                          flex: 1,
                          padding: '6px 4px',
                          borderRadius: 6,
                          background: scaleMode === mode.id ? 'rgba(0, 212, 255, 0.25)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${scaleMode === mode.id ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
                          color: scaleMode === mode.id ? '#00e5ff' : '#94a3b8',
                          fontSize: 9,
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Min/Max Range Bounds Editor */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 9.5, color: '#cde8f5', fontWeight: 600 }}>
                      Data Range ({defaultBounds.unit}):
                    </span>
                    <button
                      onClick={() => {
                        const def = getDefaultRange(selectedVar)
                        setCustomMin(def.min)
                        setCustomMax(def.max)
                      }}
                      style={{
                        padding: '2px 6px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 4,
                        color: '#94a3b8',
                        fontSize: 8.5,
                        cursor: 'pointer',
                      }}
                    >
                      Reset Bounds
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 8.5, color: '#8ba7bb', marginBottom: 2 }}>Min Bound:</div>
                      <input
                        type="number"
                        step="0.1"
                        value={customMin}
                        onChange={(e) => setCustomMin(Number(e.target.value))}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          borderRadius: 4,
                          color: '#00ffff',
                          padding: '4px 6px',
                          fontSize: 10,
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 8.5, color: '#8ba7bb', marginBottom: 2 }}>Max Bound:</div>
                      <input
                        type="number"
                        step="0.1"
                        value={customMax}
                        onChange={(e) => setCustomMax(Number(e.target.value))}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          borderRadius: 4,
                          color: '#00ffff',
                          padding: '4px 6px',
                          fontSize: 10,
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: LAYERS & VERTICAL EXAGGERATION */}
            {activeStudioTab === 'layers' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  🎚️ Layer Opacity, Dates & Depth Exaggeration
                </div>
                <div style={{ fontSize: 9.5, color: '#8ba7bb', marginBottom: 12 }}>
                  Fine-tune rendering opacities, float observation date badges, and underwater relief exaggeration.
                </div>

                {/* 3D Observation Dates Badges Toggle */}
                <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(255,215,64,0.08)', borderRadius: 8, border: '1px solid rgba(255,215,64,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#ffd740' }}>📅 Float Observation Dates:</div>
                    <div style={{ fontSize: 8.5, color: '#94a3b8' }}>Render 3D date badges above plotted floats</div>
                  </div>
                  <button
                    onClick={() => setShowFloatDates((v) => !v)}
                    style={{
                      padding: '4px 10px',
                      background: showFloatDates ? '#ffd740' : 'rgba(255,255,255,0.1)',
                      color: showFloatDates ? '#020617' : '#94a3b8',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 9.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {showFloatDates ? 'VISIBLE' : 'HIDDEN'}
                  </button>
                </div>

                {/* Vertical Exaggeration Slider */}
                <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(0,212,255,0.08)', borderRadius: 8, border: '1px solid rgba(0,212,255,0.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#00e5ff' }}>Vertical Exaggeration:</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#00ffff', fontFamily: 'monospace' }}>{vertExaggeration.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min={1.0}
                    max={6.0}
                    step={0.2}
                    value={vertExaggeration}
                    onChange={(e) => setVertExaggeration(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#00d4ff', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#8ba7bb', marginTop: 2 }}>
                    <span>1.0x (True Scale)</span>
                    <span>3.0x</span>
                    <span>6.0x (High Relief)</span>
                  </div>
                </div>

                {/* Surface Water Opacity Slider */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9.5, color: '#cde8f5' }}>Ocean Surface Water Opacity:</span>
                    <span style={{ fontSize: 9.5, color: '#38bdf8', fontFamily: 'monospace' }}>{Math.round(waterOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={waterOpacity}
                    onChange={(e) => setWaterOpacity(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </div>

                {/* Subsurface Slice Opacity */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9.5, color: '#cde8f5' }}>Subsurface Depth Slice Opacity:</span>
                    <span style={{ fontSize: 9.5, color: '#38bdf8', fontFamily: 'monospace' }}>{Math.round(sliceOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={sliceOpacity}
                    onChange={(e) => setSliceOpacity(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </div>

                {/* Bathymetry Seafloor Opacity */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9.5, color: '#cde8f5' }}>Seafloor Bathymetry Opacity:</span>
                    <span style={{ fontSize: 9.5, color: '#38bdf8', fontFamily: 'monospace' }}>{Math.round(terrainOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={terrainOpacity}
                    onChange={(e) => setTerrainOpacity(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </div>

                {/* Wireframe Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                  <span style={{ fontSize: 9.5, color: '#cde8f5' }}>Seafloor Wireframe Mesh:</span>
                  <button
                    onClick={() => setWireframeTerrain((v) => !v)}
                    style={{
                      padding: '4px 10px',
                      background: wireframeTerrain ? '#00e5ff' : 'rgba(255,255,255,0.1)',
                      color: wireframeTerrain ? '#020617' : '#94a3b8',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {wireframeTerrain ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: VARIABLE SELECTOR */}
            {activeStudioTab === 'variables' && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                  📊 Oceanographic Variable Selector
                </div>
                <div style={{ fontSize: 9.5, color: '#8ba7bb', marginBottom: 10 }}>
                  Select primary ocean factor to visualize in 3D slices, Argo beads, and color mapping.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { id: 'temperature', label: 'Ocean Temperature', unit: '°C', icon: '🌡️', desc: 'Epipelagic warm layer, thermocline gradient, abyssal baseline' },
                    { id: 'salinity', label: 'Salinity (Halocline)', unit: 'PSU', icon: '🧂', desc: 'Arabian Sea hypersaline plume vs Bay of Bengal river discharge' },
                    { id: 'current_speed', label: 'Current Velocity', unit: 'm/s', icon: '💨', desc: 'Eastward Wyrtki jet, monsoon drift, and boundary currents' },
                    { id: 'density', label: 'Seawater Density (σθ)', unit: 'kg/m³', icon: '⚖️', desc: 'UNESCO equation pycnocline stratification' },
                    { id: 'sound_velocity', label: 'Acoustic Sound Velocity', unit: 'm/s', icon: '🔊', desc: 'SOFAR acoustic channel axis and sound speed profiling' },
                    { id: 'oxygen', label: 'Dissolved Oxygen (O₂)', unit: 'µmol/kg', icon: '🫁', desc: 'Subsurface Oxygen Minimum Zone (OMZ) profiling' },
                  ].map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        const nextV = v.id as OceanVariable
                        setSelectedVar(nextV)
                        onVariableChange?.(nextV)
                        const def = getDefaultRange(nextV)
                        setCustomMin(def.min)
                        setCustomMax(def.max)
                        setPalette(getDefaultPaletteForVariable(nextV))
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: selectedVar === v.id ? 'rgba(0, 212, 255, 0.18)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selectedVar === v.id ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{v.icon}</span>
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: selectedVar === v.id ? '#00e5ff' : '#e2e8f0' }}>
                            {v.label}
                          </div>
                          <div style={{ fontSize: 8.5, color: '#94a3b8' }}>{v.desc}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 9.5, color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
                        {v.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}



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
              onChange={(e) => {
                const val = Number(e.target.value)
                setSlicePct(val)
                const targetM = Math.round((val / 100) * 2000)
                onDepthChange?.(targetM)
                setCesiumDepth(targetM)
              }}
              style={{ flex: 1, accentColor: '#00d4ff', cursor: 'pointer' }}
            />
            <span style={{ color: '#8ba7bb', fontSize: 9, fontFamily: 'monospace', width: 55, textAlign: 'right' }}>2000 m</span>
          </div>
        </div>
      )}

      {/* ── DYNAMIC SCIENTIFIC COLORBAR LEGEND HUD ──────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 175,
          right: 14,
          zIndex: 20,
          background: 'rgba(6,12,26,0.92)',
          border: '1px solid rgba(0,212,255,0.35)',
          borderRadius: 10,
          padding: '12px 16px',
          backdropFilter: 'blur(10px)',
          minWidth: 220,
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ color: '#00d4ff', fontSize: 9.5, fontFamily: 'monospace', fontWeight: 700 }}>
            {selectedVar.toUpperCase().replace('_', ' ')}
          </div>
          <div style={{ color: '#8ba7bb', fontSize: 8.5, fontFamily: 'monospace' }}>
            {scaleMode.toUpperCase()}
          </div>
        </div>

        {/* Dynamic Gradient Bar */}
        <div
          style={{
            height: 12,
            borderRadius: 6,
            background: currentGradientCss,
            border: '1px solid rgba(255,255,255,0.2)',
            marginBottom: 4,
          }}
        />

        {/* Dynamic Min / Mid / Max Ticks Computed According to Active Scale Mode */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#cde8f5', marginBottom: 8 }}>
          <span>{customMin} {defaultBounds.unit}</span>
          <span style={{ color: '#00e5ff', fontWeight: 600 }}>
            {scaleMode === 'log'
              ? `${(customMin + (customMax - customMin) * (Math.pow(10, 0.5) - 1) / 9).toFixed(1)} (Mid Log)`
              : scaleMode === 'sqrt'
              ? `${(customMin + (customMax - customMin) * 0.25).toFixed(1)} (Mid √)`
              : `${((customMin + customMax) / 2).toFixed(1)} (Mid)`}
          </span>
          <span>{customMax} {defaultBounds.unit}</span>
        </div>

        {/* Feature Icons Legend */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[
            { c: '#38bdf8', l: 'Argo CTD Nodes' },
            { c: '#34d399', l: 'Glider Track' },
            { c: '#00ffff', l: 'Current Vectors' },
            { c: '#6aaa4a', l: 'Land Topography' },
            { c: '#1a7090', l: 'Ocean Floor' },
          ].map(({ c, l }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
              <span style={{ color: '#8ba7bb', fontSize: 9, fontFamily: 'monospace' }}>{l}</span>
            </div>
          ))}
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
        Left-drag: rotate | Right-drag: pan | Scroll: zoom | Hover: multi-factor depth telemetry | 🎛️ Studio: physics & palettes
      </div>
    </div>
  )
}
