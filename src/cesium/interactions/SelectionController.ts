import { SelectedObject } from '../types'

export class SelectionController {
  private selectedObject: SelectedObject | null = null
  private listeners: Array<(obj: SelectedObject | null) => void> = []

  public select(obj: SelectedObject | null): void {
    this.selectedObject = obj
    this.notify()
  }

  public getSelected(): SelectedObject | null {
    return this.selectedObject
  }

  public subscribe(listener: (obj: SelectedObject | null) => void): () => void {
    this.listeners.push(listener)
    listener(this.selectedObject)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.selectedObject)
    }
  }

  public clear(): void {
    this.select(null)
  }
}
