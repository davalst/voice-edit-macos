/**
 * Controls Popover Manager
 *
 * Google Meet-style dropdown that appears when clicking tray icon.
 * Shows:
 * - Last captured frame (static screenshot, no real-time updates)
 * - Selected text preview
 * - Multimodal toggle (synced with app settings)
 * - Microphone mute toggle (hardware mute like F10)
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

export class ControlsPopover {
  private popoverWindow: BrowserWindow | null = null
  private lastCapturedFrame: string | null = null // Base64 data URL
  private lastSelectedText: string = ''

  /**
   * Create the popover window
   */
  create() {
    if (this.popoverWindow) {
      return // Already created
    }

    this.popoverWindow = new BrowserWindow({
      width: 320,
      height: 450,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      show: false, // Hidden by default
      focusable: true, // Need focus to receive clicks
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    // Load popover HTML
    if (process.env.VITE_DEV_SERVER_URL) {
      this.popoverWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/controls-popover.html`)
    } else {
      this.popoverWindow.loadFile(join(__dirname, '../../dist/controls-popover.html'))
    }

    // Auto-hide when losing focus (click outside)
    this.popoverWindow.on('blur', () => {
      this.hide()
    })

    console.log('[ControlsPopover] Popover window created')
  }

  /**
   * Show popover below tray icon
   */
  show(trayBounds: Electron.Rectangle, config: {
    screenshot: string | null
    selectedText: string
    multimodalEnabled: boolean
    microphoneMuted: boolean
  }) {
    if (!this.popoverWindow) {
      this.create()
    }

    // Position below tray icon
    const windowBounds = this.popoverWindow!.getBounds()
    const primaryDisplay = screen.getPrimaryDisplay()
    const displayBounds = primaryDisplay.bounds

    // Calculate X position (center under tray icon)
    let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2))

    // Calculate Y position (below tray icon)
    let y = Math.round(trayBounds.y + trayBounds.height + 5)

    // Keep within screen bounds
    if (x + windowBounds.width > displayBounds.x + displayBounds.width) {
      x = displayBounds.x + displayBounds.width - windowBounds.width - 10
    }
    if (x < displayBounds.x) {
      x = displayBounds.x + 10
    }

    this.popoverWindow!.setPosition(x, y)

    // Send current state to popover
    this.popoverWindow!.webContents.send('popover-data', config)

    this.popoverWindow!.show()
    console.log('[ControlsPopover] Popover shown')
  }

  /**
   * Hide popover
   */
  hide() {
    if (this.popoverWindow && this.popoverWindow.isVisible()) {
      this.popoverWindow.hide()
      console.log('[ControlsPopover] Popover hidden')
    }
  }

  /**
   * Check if popover is visible
   */
  isVisible(): boolean {
    return this.popoverWindow?.isVisible() ?? false
  }

  /**
   * Update last captured frame
   */
  updateLastFrame(frameDataUrl: string) {
    this.lastCapturedFrame = frameDataUrl
  }

  /**
   * Update selected text
   */
  updateSelectedText(text: string) {
    this.lastSelectedText = text
  }

  /**
   * Get last captured frame
   */
  getLastFrame(): string | null {
    return this.lastCapturedFrame
  }

  /**
   * Get last selected text
   */
  getSelectedText(): string {
    return this.lastSelectedText
  }

  /**
   * Destroy popover window
   */
  destroy() {
    if (this.popoverWindow) {
      this.popoverWindow.destroy()
      this.popoverWindow = null
      console.log('[ControlsPopover] Popover destroyed')
    }
  }
}

export default ControlsPopover
