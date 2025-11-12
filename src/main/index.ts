/**
 * Electron Main Process - Voice Edit macOS
 *
 * Handles:
 * - Global hotkey registration (Fn key)
 * - Clipboard management
 * - Keyboard simulation (Cmd+V paste)
 * - App lifecycle
 * - IPC communication with renderer
 */

import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage, desktopCapturer } from 'electron'
import { join } from 'path'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import Store from 'electron-store'
import { simulatePaste, copyToClipboard, getSelectedText, getFocusedAppName } from './clipboard-manager'
import { requestPermissions } from './permissions'
import { KeyMonitor } from './key-monitor-native'
import { RecordingMode } from './hotkey-state-machine'
import { OverlayManager } from './overlay-manager'

// Configuration store
const store = new Store({
  defaults: {
    apiKey: '',
    hotkey: 'Control+Space',
    vadSensitivity: 0.02,
    silenceDuration: 1500,
    screenSharingEnabled: true,
    launchAtLogin: false,
  },
})

// Global state
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isRecording = false

// Simple Fn key monitoring + overlay
let keyMonitor: KeyMonitor | null = null
let overlayManager: OverlayManager | null = null

/**
 * Create main window (status/settings window)
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false, // Keep hidden by default - user opens via tray or first launch check
    frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Development mode - use Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // Don't auto-open DevTools - prevents focus stealing during development
    // User can manually open via View > Toggle Developer Tools
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Hide window instead of closing on macOS
  mainWindow.on('close', event => {
    if (!(app as any).isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

/**
 * Create system tray icon
 */
function createTray() {
  // Create icon (replace with actual icon path)
  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Voice Edit',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isRecording ? 'Stop Recording (Fn)' : 'Start Recording (Fn)',
      click: () => {
        mainWindow?.webContents.send('toggle-recording')
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show()
      },
    },
    {
      label: 'About',
      click: () => {
        // Show about dialog
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setToolTip('Voice Edit - Ready')
  tray.setContextMenu(contextMenu)

  // Click tray to show window
  tray.on('click', () => {
    mainWindow?.show()
  })
}

/**
 * Update tray icon status
 */
function updateTrayStatus(recording: boolean) {
  isRecording = recording
  const status = recording ? 'Recording...' : 'Ready'
  tray?.setToolTip(`Voice Edit - ${status}`)

  // Recreate menu with updated status
  createTray()
}

/**
 * ✅ SIMPLE Fn key monitoring - direct replacement for Ctrl+Space
 * Fn PRESS = Start recording (same as first Ctrl+Space)
 * Fn RELEASE = Stop recording (same as second Ctrl+Space)
 */
function initializeSimpleFnKeyMonitoring() {
  console.log('[Main] Initializing simple Fn key monitoring (replaces Ctrl+Space)...')

  // Create key monitor and overlay
  keyMonitor = new KeyMonitor()
  overlayManager = new OverlayManager()
  overlayManager.create()

  // Track previous Fn state
  let previousFnState = false

  // Listen for Fn key press/release
  keyMonitor.on('keyStateChange', async (event: { fnPressed: boolean; ctrlPressed: boolean; timestamp: number }) => {
    // Detect Fn key changes
    if (event.fnPressed !== previousFnState) {
      if (event.fnPressed) {
        // Fn PRESSED → Start recording (same as first Ctrl+Space in fe97b91)
        console.log('[Main] Fn PRESSED - starting recording')

        // Capture context BEFORE starting recording
        const focusedAppName = await getFocusedAppName()
        const selectedText = await getSelectedText()

        console.log('[Main] Context captured - Focused app:', focusedAppName, 'Selected text:', selectedText?.substring(0, 50) || '(none)')

        // Show overlay
        overlayManager?.show(RecordingMode.STT_SCREEN_HOLD, true)

        // Send to renderer (exactly like Ctrl+Space does)
        mainWindow?.webContents.send('toggle-recording', {
          selectedText,
          focusedAppName
        })

        updateTrayStatus(true)
      } else {
        // Fn RELEASED → Stop recording (same as second Ctrl+Space in fe97b91)
        console.log('[Main] Fn RELEASED - stopping recording')

        // Hide overlay
        overlayManager?.hide()

        // Send to renderer (exactly like Ctrl+Space does when already recording)
        mainWindow?.webContents.send('toggle-recording', {})

        updateTrayStatus(false)
      }
      previousFnState = event.fnPressed
    }
  })

  // Start monitoring
  const success = keyMonitor.start()
  if (success) {
    console.log('[Main] ✅ Fn key monitoring active (simple press/release)')
  } else {
    console.error('[Main] ❌ Failed to start Fn key monitoring')
    console.error('[Main] Please grant Accessibility permissions in System Preferences')
  }
}

/**
 * App ready event
 */
app.whenReady().then(async () => {
  console.log('[Main] App ready, initializing...')

  // Request macOS permissions
  const permissionsGranted = await requestPermissions()
  if (!permissionsGranted) {
    console.warn('[Main] Some permissions not granted')
  }

  // Create window and tray
  createWindow()
  createTray()

  // Show window on first launch if no API key configured
  const apiKey = store.get('apiKey') as string
  if (!apiKey || apiKey.trim() === '') {
    console.log('[Main] No API key found, showing settings window')
    mainWindow?.show()
  }

  // ✅ NEW: Simple Fn key monitoring (replaces Control+Space hotkey)
  // Fn PRESS = start recording, Fn RELEASE = let VAD handle (or manual trigger later)
  initializeSimpleFnKeyMonitoring()

  // Handle window activation on macOS
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

/**
 * IPC Handlers - Communication with Renderer Process
 */

// Get configuration from store
ipcMain.handle('get-config', () => {
  return store.store
})

// Save configuration to store
ipcMain.handle('save-config', (_event, config) => {
  Object.entries(config).forEach(([key, value]) => {
    store.set(key, value)
  })
  return { success: true }
})

// Start recording
ipcMain.on('recording-started', () => {
  console.log('[Main] Recording started')
  updateTrayStatus(true)
})

// Stop recording
ipcMain.on('recording-stopped', () => {
  console.log('[Main] Recording stopped')
  updateTrayStatus(false)
})

// Paste edited text to active app
ipcMain.on('paste-text', (_event, text: string) => {
  console.log('[Main] Pasting text:', text.substring(0, 50) + '...')

  // Show result in overlay briefly
  const preview = text.length > 50 ? text.substring(0, 50) + '...' : text
  overlayManager?.showResult(preview)

  // Copy to clipboard
  copyToClipboard(text)

  // Small delay to ensure clipboard is ready
  setTimeout(() => {
    // Simulate Cmd+V in active app
    simulatePaste()
  }, 50)
})

// Get clipboard content (for debugging)
ipcMain.handle('get-clipboard', () => {
  return clipboard.readText()
})

// Get selected text from active application (uses Cmd+C)
ipcMain.handle('get-selected-text', async () => {
  console.log('[Main] Getting selected text from active app...')
  const selectedText = await getSelectedText()
  console.log('[Main] Selected text:', selectedText.substring(0, 50) + '...')
  return selectedText
})

// Show notification
ipcMain.on('show-notification', (_event, message: string) => {
  // TODO: Use Electron Notification API
  console.log('[Main] Notification:', message)
})

// Log from renderer (for debugging)
ipcMain.on('log', (_event, message: string) => {
  console.log(message)
})

// Get screen sources for screen capture
ipcMain.handle('get-screen-sources', async (_event, opts: any) => {
  try {
    const sources = await desktopCapturer.getSources(opts)
    return sources
  } catch (error: any) {
    console.error('[Main] Failed to get screen sources:', error.message)
    throw error
  }
})

// Export console logs to file
ipcMain.handle('export-logs', async (_event, logs: string) => {
  try {
    // Create console_logs directory in project root
    const projectRoot = app.getAppPath().includes('app.asar')
      ? join(app.getAppPath(), '..', '..', '..', '..')
      : join(app.getAppPath(), '..', '..')
    const logsDir = join(projectRoot, 'console_logs')

    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true })
    }

    // Create filename with current date and time
    const now = new Date()
    const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '')
    const filename = `console_${timestamp}.log`
    const filepath = join(logsDir, filename)

    // Write logs to file
    appendFileSync(filepath, logs)

    console.log('[Main] Console logs exported to:', filepath)
    return { success: true, filepath }
  } catch (error: any) {
    console.error('[Main] Failed to export logs:', error.message)
    return { success: false, error: error.message }
  }
})

/**
 * App lifecycle events
 */

app.on('window-all-closed', () => {
  // Don't quit on macOS when windows closed (keep in tray)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll()

  // Stop native key monitoring
  if (keyMonitor) {
    keyMonitor.stop()
    console.log('[Main] Native key monitoring stopped')
  }
})

app.on('before-quit', () => {
  (app as any).isQuitting = true
})

/**
 * Error handling
 */
process.on('uncaughtException', error => {
  console.error('[Main] Uncaught exception:', error)
})

process.on('unhandledRejection', error => {
  console.error('[Main] Unhandled rejection:', error)
})
