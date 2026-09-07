/**
 * Minimap.tsx - 2D SVG Indian Ocean minimap
 * Shows selected region as yellow highlight + city labels
 * Click minimap to select new region
 */
import { useCallback } from "react"

interface BBox { lat_min: number; lat_max: number; lon_min: number; lon_max: number }
interface MinimapProps {
  region: BBox
  onRegionSelect?: (bbox: BBox) => void
}

// SVG canvas: 200 x 140 px
// Covers: lon 55-100E, lat 0-30N
const W = 200, H = 140
const LON_MIN = 55, LON_MAX = 100
const LAT_MIN = 0,  LAT_MAX = 30

function toSVG(lat: number, lon: number): [number, number] {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * W
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

function bboxToSVG(b: BBox) {
  const [x1, y1] = toSVG(b.lat_max, b.lon_min)
  const [x2, y2] = toSVG(b.lat_min, b.lon_max)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

// Simplified India polygon (lat, lon pairs)
const INDIA_POLY: [number, number][] = [
  [23.5,68.5],[21,69.5],[20,73],[17,73.5],[15,74.5],[10,76.5],[8.1,77.6],
  [8.5,78.2],[11,80],[13.1,80.3],[16,81],[20,86.5],[22,88],[23,92],
  [26,92],[27,89],[28,85],[27,80],[26,74],[24,69],[23.5,68.5],
]

// Sri Lanka polygon
const SLANKA_POLY: [number, number][] = [
  [10,80],[9,81],[7,81.5],[6.5,80.5],[7,79.8],[9,79.5],[10,80],
]

const CITIES: Array<{ lat: number; lon: number; name: string; color: string }> = [
  { lat: 19.1, lon: 72.9, name: "Mumbai",    color: "#fbbf24" },
  { lat: 13.1, lon: 80.3, name: "Chennai",   color: "#f87171" },
  { lat: 22.6, lon: 88.4, name: "Kolkata",   color: "#34d399" },
  { lat: 6.9,  lon: 79.9, name: "Colombo",   color: "#a78bfa" },
  { lat: 11.7, lon: 92.7, name: "Port Blair",color: "#60a5fa" },
  { lat: 17.4, lon: 78.5, name: "Hyderabad", color: "#fb923c" },
]

export default function Minimap({ region, onRegionSelect }: MinimapProps) {
  const indiaPath = INDIA_POLY.map((p, i) => {
    const [x, y] = toSVG(p[0], p[1])
    return `${i === 0 ? "M" : "L"} ${x},${y}`
  }).join(" ") + " Z"

  const slankaPath = SLANKA_POLY.map((p, i) => {
    const [x, y] = toSVG(p[0], p[1])
    return `${i === 0 ? "M" : "L"} ${x},${y}`
  }).join(" ") + " Z"

  const box = bboxToSVG(region)

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onRegionSelect) return
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const svgY = ((e.clientY - rect.top)  / rect.height) * H
    const lon = svgX / W * (LON_MAX - LON_MIN) + LON_MIN
    const lat = LAT_MAX - svgY / H * (LAT_MAX - LAT_MIN)
    const spanLat = 4, spanLon = 6
    onRegionSelect({
      lat_min: Math.max(LAT_MIN, lat - spanLat / 2),
      lat_max: Math.min(LAT_MAX, lat + spanLat / 2),
      lon_min: Math.max(LON_MIN, lon - spanLon / 2),
      lon_max: Math.min(LON_MAX, lon + spanLon / 2),
    })
  }, [onRegionSelect])

  return (
    <div style={{
      position: "absolute", bottom: 58, right: 14, zIndex: 25,
      background: "rgba(6,12,26,0.92)",
      border: "1px solid rgba(0,212,255,0.35)",
      borderRadius: 8, padding: 6,
      backdropFilter: "blur(8px)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "#00d4ff", fontSize: 9, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
        📍 REGION MAP — click to select
      </div>
      <svg
        width={W} height={H}
        viewBox={`0 0 ${W} ${H}`}
        onClick={handleClick}
        style={{ cursor: "crosshair", display: "block", borderRadius: 4 }}
      >
        {/* Ocean background */}
        <rect x={0} y={0} width={W} height={H} fill="#0a2540" />

        {/* Grid lines */}
        {[60, 70, 80, 90, 100].map(lon => {
          const [x] = toSVG(0, lon)
          return <line key={lon} x1={x} y1={0} x2={x} y2={H} stroke="rgba(0,212,255,0.12)" strokeWidth={0.5} />
        })}
        {[5, 10, 15, 20, 25].map(lat => {
          const [,y] = toSVG(lat, 0)
          return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="rgba(0,212,255,0.12)" strokeWidth={0.5} />
        })}

        {/* India */}
        <path d={indiaPath} fill="#2d4a1e" stroke="#4a7c59" strokeWidth={0.8} fillOpacity={0.85} />

        {/* Sri Lanka */}
        <path d={slankaPath} fill="#2d4a1e" stroke="#4a7c59" strokeWidth={0.6} fillOpacity={0.85} />

        {/* Selected region highlight */}
        <rect
          x={box.x} y={box.y} width={box.w} height={box.h}
          fill="rgba(255, 220, 0, 0.15)"
          stroke="#ffdc00"
          strokeWidth={1.5}
          strokeDasharray="3,2"
        />
        <rect
          x={box.x} y={box.y} width={box.w} height={box.h}
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={0.5}
        />

        {/* City dots + labels */}
        {CITIES.map(c => {
          const [cx, cy] = toSVG(c.lat, c.lon)
          const isRight = cx < W * 0.65
          return (
            <g key={c.name}>
              <circle cx={cx} cy={cy} r={2.5} fill={c.color} opacity={0.9} />
              <circle cx={cx} cy={cy} r={4.5} fill="none" stroke={c.color} strokeWidth={0.6} opacity={0.5} />
              <text
                x={isRight ? cx + 5 : cx - 5}
                y={cy + 3}
                fill={c.color}
                fontSize={7}
                fontFamily="JetBrains Mono, monospace"
                textAnchor={isRight ? "start" : "end"}
                opacity={0.9}
              >
                {c.name}
              </text>
            </g>
          )
        })}

        {/* Corner lat/lon labels */}
        <text x={2}   y={H - 3} fill="rgba(0,212,255,0.6)" fontSize={6} fontFamily="monospace">0°N 55°E</text>
        <text x={W-2} y={H - 3} fill="rgba(0,212,255,0.6)" fontSize={6} fontFamily="monospace" textAnchor="end">0°N 100°E</text>
        <text x={2}   y={8}     fill="rgba(0,212,255,0.6)" fontSize={6} fontFamily="monospace">30°N</text>
      </svg>
    </div>
  )
}
