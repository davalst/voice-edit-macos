/**
 * Overlay Manager
 *
 * Creates and manages the floating overlay window that shows recording status.
 * Displays:
 * - Recording mode indicator
 * - Waveform visualization
 * - Screen capture indicator
 * - Ebben POC design system (colors, fonts)
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { RecordingMode } from './hotkey-state-machine'

export class OverlayManager {
  private overlayWindow: BrowserWindow | null = null

  /**
   * Create the overlay window
   */
  create() {
    if (this.overlayWindow) {
      return // Already created
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    // Create overlay window - centered on screen
    this.overlayWindow = new BrowserWindow({
      width: 400,
      height: 120,
      x: Math.floor((width - 400) / 2),
      y: Math.floor((height - 120) / 2),
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false, // Don't steal focus from other apps
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    // Hide initially
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.overlayWindow.setAlwaysOnTop(true, 'floating', 1)

    // Load overlay HTML
    if (process.env.VITE_DEV_SERVER_URL) {
      this.overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/overlay`)
    } else {
      this.overlayWindow.loadFile(join(__dirname, '../../dist/overlay.html'))
    }

    // Prevent window from being closed
    this.overlayWindow.on('close', (e) => {
      e.preventDefault()
      this.hide()
    })

    console.log('[OverlayManager] Overlay window created')
  }

  /**
   * Show overlay with recording mode
   */
  show(mode: RecordingMode, enableScreenCapture: boolean) {
    if (!this.overlayWindow) {
      this.create()
    }

    // Send mode to overlay UI
    this.overlayWindow?.webContents.send('overlay-show', {
      mode,
      enableScreenCapture,
    })

    this.overlayWindow?.show()
    console.log('[OverlayManager] Overlay shown:', mode, enableScreenCapture ? '+ Screen' : '')
  }

  /**
   * Hide overlay
   */
  hide() {
    this.overlayWindow?.webContents.send('overlay-hide')
    this.overlayWindow?.hide()
    console.log('[OverlayManager] Overlay hidden')
  }

  /**
   * Update waveform with audio data
   */
  updateWaveform(audioData: number[]) {
    if (this.overlayWindow && this.overlayWindow.isVisible()) {
      this.overlayWindow.webContents.send('overlay-waveform', audioData)
    }
  }

  /**
   * Destroy overlay window
   */
  destroy() {
    if (this.overlayWindow) {
      this.overlayWindow.destroy()
      this.overlayWindow = null
      console.log('[OverlayManager] Overlay destroyed')
    }
  }

  /**
   * Check if overlay is visible
   */
  get isVisible(): boolean {
    return this.overlayWindow?.isVisible() ?? false
  }
}

export default OverlayManager
