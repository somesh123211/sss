import * as Cesium from 'cesium'

export class OceanClockController {
  private viewer: Cesium.Viewer
  private startDate: Date
  private endDate: Date
  private onTimeChangeCallback: (timeMs: number, timeIso: string, timeIndex: number) => void
  private removeTickListener: Cesium.Event.RemoveCallback | null = null

  constructor(
    viewer: Cesium.Viewer,
    startDateStr = '2018-01-01',
    endDateStr = '2025-04-01',
    onTimeChange: (timeMs: number, timeIso: string, timeIndex: number) => void
  ) {
    this.viewer = viewer
    this.startDate = new Date(startDateStr)
    this.endDate = new Date(endDateStr)
    this.onTimeChangeCallback = onTimeChange
    this.initialize()
  }

  private initialize(): void {
    const clock = this.viewer.clock
    const startJulian = Cesium.JulianDate.fromDate(this.startDate)
    const endJulian = Cesium.JulianDate.fromDate(this.endDate)

    clock.startTime = startJulian
    clock.stopTime = endJulian
    clock.currentTime = startJulian
    clock.clockRange = Cesium.ClockRange.LOOP_STOP
    clock.multiplier = 86400 * 15 // 15 days per real second
    clock.shouldAnimate = false

    this.removeTickListener = clock.onTick.addEventListener(() => {
      const currentDate = Cesium.JulianDate.toDate(clock.currentTime)
      const currentMs = currentDate.getTime()
      const totalSpan = this.endDate.getTime() - this.startDate.getTime()
      const elapsed = Math.max(0, currentMs - this.startDate.getTime())
      const timeIndex = Math.min(100, Math.max(0, Math.round((elapsed / totalSpan) * 100)))

      this.onTimeChangeCallback(currentMs, currentDate.toISOString(), timeIndex)
    })
  }

  public setTimeRange(startIso: string, endIso: string): void {
    this.startDate = new Date(startIso)
    this.endDate = new Date(endIso)
    const clock = this.viewer.clock
    clock.startTime = Cesium.JulianDate.fromDate(this.startDate)
    clock.stopTime = Cesium.JulianDate.fromDate(this.endDate)
  }

  public setTimeFraction(fraction: number): void {
    const totalSpan = this.endDate.getTime() - this.startDate.getTime()
    const targetMs = this.startDate.getTime() + totalSpan * Math.max(0, Math.min(1, fraction))
    const targetDate = new Date(targetMs)
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(targetDate)
  }

  public togglePlay(): boolean {
    this.viewer.clock.shouldAnimate = !this.viewer.clock.shouldAnimate
    return this.viewer.clock.shouldAnimate
  }

  public setPlaying(playing: boolean): void {
    this.viewer.clock.shouldAnimate = playing
  }

  public stepForward(days = 15): void {
    const current = Cesium.JulianDate.toDate(this.viewer.clock.currentTime)
    current.setDate(current.getDate() + days)
    if (current > this.endDate) current.setTime(this.endDate.getTime())
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(current)
  }

  public stepBackward(days = 15): void {
    const current = Cesium.JulianDate.toDate(this.viewer.clock.currentTime)
    current.setDate(current.getDate() - days)
    if (current < this.startDate) current.setTime(this.startDate.getTime())
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(current)
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.viewer.clock.multiplier = 86400 * multiplier
  }

  public destroy(): void {
    if (this.removeTickListener) {
      this.removeTickListener()
      this.removeTickListener = null
    }
  }
}
