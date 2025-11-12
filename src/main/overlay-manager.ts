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
import Store from 'electron-store'
import { RecordingMode } from '../shared/types'

// Store for overlay position
const overlayStore = new Store({
  name: 'overlay-position',
  defaults: {
    x: null,
    y: null,
  },
})

export class OverlayManager {
  private overlayWindow: BrowserWindow | null = null

  /**
   * Create the overlay window
   */
  create() {
    if (this.overlayWindow) {
      return // Already created
    }

    // During dev hot reload, destroy any existing overlay windows
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach(window => {
      // Check if window looks like an overlay (transparent, always on top, no frame, small size)
      if (window.isAlwaysOnTop() && !window.isModal() && window.getBounds().width < 300) {
        console.log('[OverlayManager] Destroying stale overlay window')
        window.destroy()
      }
    })

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    // Wispr-style: Even smaller overlay (25% smaller than before)
    // Height is doubled (120px) when recording to make it obvious
    const overlayWidth = 200
    const overlayHeight = 120 // Double height for visibility in record mode

    // Load saved position or default to bottom center
    const savedX = overlayStore.get('x') as number | null
    const savedY = overlayStore.get('y') as number | null

    const defaultX = Math.floor((width - overlayWidth) / 2)
    const defaultY = height - overlayHeight - 20 // 20px from bottom (user preferred position)

    this.overlayWindow = new BrowserWindow({
      width: overlayWidth,
      height: overlayHeight,
      x: savedX ?? defaultX,
      y: savedY ?? defaultY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: true, // Allow user to drag
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

    // Save position when moved
    this.overlayWindow.on('moved', () => {
      if (this.overlayWindow) {
        const [x, y] = this.overlayWindow.getPosition()
        overlayStore.set('x', x)
        overlayStore.set('y', y)
        console.log('[OverlayManager] Position saved:', x, y)
      }
    })

    // Hide initially
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.overlayWindow.setAlwaysOnTop(true, 'floating', 1)

    // Load overlay HTML (separate file, not main app)
    if (process.env.VITE_DEV_SERVER_URL) {
      // In dev mode, Vite serves overlay.html at /overlay.html
      this.overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/overlay.html`)
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
   * Show overlay with recording mode (doubled height for visibility)
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

    // Use showInactive() to prevent stealing focus from active app
    this.overlayWindow?.showInactive()
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
   * Show result (command or edited text) briefly
   */
  showResult(result: string) {
    if (this.overlayWindow) {
      this.overlayWindow.webContents.send('overlay-result', result)
      console.log('[OverlayManager] Result shown:', result.substring(0, 50))
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
