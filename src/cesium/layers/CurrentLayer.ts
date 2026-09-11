import * as Cesium from 'cesium'
import { api } from '../../services/api'
import { oceanDepthToCartesian } from '../utils/coordinates'
import { SPEED_SCALE, valueToCesiumColor } from '../utils/colors'

interface FlowParticle {
  lat: number
  lon: number
  age: number
  maxAge: number
  speed: number
}

export class CurrentLayer {
  private viewer: Cesium.Viewer
  private vectorCollection: Cesium.PolylineCollection | null = null
  private particleCollection: Cesium.PointPrimitiveCollection | null = null
  private visible = false
  private particlesVisible = false
  private depth_m = 0
  private time_index = 0
  private verticalExaggeration = 1.0
  private particles: FlowParticle[] = []
  private uGrid: (number | null)[][] | null = null
  private vGrid: (number | null)[][] | null = null
  private lats: number[] = []
  private lons: number[] = []
  private animationFrameId: number | null = null

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer
    this.vectorCollection = new Cesium.PolylineCollection()
    this.particleCollection = new Cesium.PointPrimitiveCollection()
    this.viewer.scene.primitives.add(this.vectorCollection)
    this.viewer.scene.primitives.add(this.particleCollection)
  }

  public async update(params: {
    depth_m?: number
    time_index?: number
    verticalExaggeration?: number
    visible?: boolean
    particlesVisible?: boolean
  }): Promise<void> {
    if (params.depth_m !== undefined) this.depth_m = params.depth_m
    if (params.time_index !== undefined) this.time_index = params.time_index
    if (params.verticalExaggeration !== undefined) this.verticalExaggeration = params.verticalExaggeration
    if (params.visible !== undefined) this.visible = params.visible
    if (params.particlesVisible !== undefined) this.particlesVisible = params.particlesVisible

    if (this.vectorCollection) this.vectorCollection.show = this.visible
    if (this.particleCollection) this.particleCollection.show = this.particlesVisible

    if (!this.visible && !this.particlesVisible) {
      this.stopParticleAnimation()
      return
    }

    try {
      const [uData, vData] = await Promise.all([
        api.modelDepthSlice('u_current', this.depth_m, this.time_index).catch(() => null),
        api.modelDepthSlice('v_current', this.depth_m, this.time_index).catch(() => null),
      ])

      if (!uData || !vData || !uData.values || !vData.values || !uData.lat || !uData.lon) {
        return
      }

      this.uGrid = uData.values
      this.vGrid = vData.values
      this.lats = uData.lat
      this.lons = uData.lon

      this.renderVectors()
      if (this.particlesVisible) {
        this.startParticleAnimation()
      } else {
        this.stopParticleAnimation()
      }
    } catch (err) {
      console.warn('CurrentLayer update warning:', err)
    }
  }

  private renderVectors(): void {
    if (!this.vectorCollection || !this.uGrid || !this.vGrid) return
    this.vectorCollection.removeAll()

    const nLat = this.lats.length
    const nLon = this.lons.length
    const step = 4 // Spatial sampling interval to keep performance crisp

    for (let i = 0; i < nLat; i += step) {
      const lat = this.lats[i]
      for (let j = 0; j < nLon; j += step) {
        const lon = this.lons[j]
        const u = this.uGrid[i]?.[j]
        const v = this.vGrid[i]?.[j]
        if (u === null || v === null || u === undefined || v === undefined) continue

        const speed = Math.sqrt(u * u + v * v)
        if (speed < 0.05) continue // Skip stagnant water

        // Scale vector line: 1 m/s ≈ 0.8 degrees displacement
        const scale = 0.5
        const dLat = (v / speed) * Math.min(speed, 1.5) * scale
        const dLon = (u / speed) * Math.min(speed, 1.5) * scale

        const p0 = oceanDepthToCartesian(lat, lon, this.depth_m, this.verticalExaggeration)
        const p1 = oceanDepthToCartesian(lat + dLat, lon + dLon, this.depth_m, this.verticalExaggeration)

        const color = valueToCesiumColor(speed, 0, 1.5, SPEED_SCALE, 0.8)

        this.vectorCollection.add({
          positions: [p0, p1],
          width: 2.0,
          material: Cesium.Material.fromType('Color', { color }),
          id: {
            type: 'current_vector',
            u,
            v,
            speed: Math.round(speed * 100) / 100,
            depth_m: this.depth_m,
          },
        })
      }
    }
  }

  private initParticles(count = 600): void {
    if (this.lats.length === 0 || this.lons.length === 0) return
    const latMin = this.lats[0]
    const latMax = this.lats[this.lats.length - 1]
    const lonMin = this.lons[0]
    const lonMax = this.lons[this.lons.length - 1]

    this.particles = []
    for (let i = 0; i < count; i++) {
      this.particles.push({
        lat: latMin + Math.random() * (latMax - latMin),
        lon: lonMin + Math.random() * (lonMax - lonMin),
        age: Math.random() * 80,
        maxAge: 60 + Math.random() * 60,
        speed: 0.1,
      })
    }
  }

  private startParticleAnimation(): void {
    this.stopParticleAnimation()
    this.initParticles(500)

    const step = () => {
      if (!this.particlesVisible || !this.particleCollection) return

      this.particleCollection.removeAll()
      const latMin = this.lats[0]
      const latMax = this.lats[this.lats.length - 1]
      const lonMin = this.lons[0]
      const lonMax = this.lons[this.lons.length - 1]

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i]
        p.age += 1

        if (p.age >= p.maxAge || p.lat < latMin || p.lat > latMax || p.lon < lonMin || p.lon > lonMax) {
          p.lat = latMin + Math.random() * (latMax - latMin)
          p.lon = lonMin + Math.random() * (lonMax - lonMin)
          p.age = 0
          p.maxAge = 60 + Math.random() * 60
        }

        // Interpolate velocity at particle position
        const iLat = Math.min(
          this.lats.length - 1,
          Math.max(0, Math.floor(((p.lat - latMin) / (latMax - latMin)) * (this.lats.length - 1)))
        )
        const iLon = Math.min(
          this.lons.length - 1,
          Math.max(0, Math.floor(((p.lon - lonMin) / (lonMax - lonMin)) * (this.lons.length - 1)))
        )

        const u = this.uGrid?.[iLat]?.[iLon] ?? 0
        const v = this.vGrid?.[iLat]?.[iLon] ?? 0

        p.lon += (u * 0.08)
        p.lat += (v * 0.08)
        p.speed = Math.sqrt(u * u + v * v)

        const alpha = Math.sin((p.age / p.maxAge) * Math.PI) * 0.9
        const color = valueToCesiumColor(p.speed, 0, 1.5, SPEED_SCALE, alpha)

        const pos = oceanDepthToCartesian(p.lat, p.lon, this.depth_m, this.verticalExaggeration)
        this.particleCollection.add({
          position: pos,
          color,
          pixelSize: 4.5,
        })
      }

      this.animationFrameId = requestAnimationFrame(step)
    }

    this.animationFrameId = requestAnimationFrame(step)
  }

  private stopParticleAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    if (this.particleCollection) {
      this.particleCollection.removeAll()
    }
  }

  public destroy(): void {
    this.stopParticleAnimation()
    if (this.vectorCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.vectorCollection)
      this.vectorCollection = null
    }
    if (this.particleCollection && !this.viewer.scene.isDestroyed()) {
      this.viewer.scene.primitives.remove(this.particleCollection)
      this.particleCollection = null
    }
  }
}
