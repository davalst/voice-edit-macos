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
import Store from 'electron-store'
import { setupHotkeyManager } from './hotkey-manager'
import { simulatePaste, copyToClipboard, getSelectedText, getFocusedAppName } from './clipboard-manager'
import { requestPermissions } from './permissions'
import { KeyMonitor } from './key-monitor-native'
import { HotkeyStateMachine, RecordingMode } from './hotkey-state-machine'
import { GestureDetector } from './gesture-detector'
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

// Wispr Flow feature: Native key monitoring + state machine + overlay
let keyMonitor: KeyMonitor | null = null
let stateMachine: HotkeyStateMachine | null = null
let gestureDetector: GestureDetector | null = null
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
 * Initialize Wispr Flow-style native key monitoring
 */
function initializeKeyMonitoring() {
  console.log('[Main] Initializing native key monitoring...')

  // Create instances
  keyMonitor = new KeyMonitor()
  stateMachine = new HotkeyStateMachine()
  gestureDetector = new GestureDetector()
  overlayManager = new OverlayManager()

  // Create overlay window (hidden initially)
  overlayManager.create()

  // Wire up gesture detector to state machine
  gestureDetector.on('fnDoubleTap', (timestamp) => {
    stateMachine?.onFnDoubleTap(timestamp)
  })

  gestureDetector.on('fnCtrlDoubleTap', (timestamp) => {
    stateMachine?.onFnCtrlDoubleTap(timestamp)
  })

  // Wire up state machine to renderer + overlay
  stateMachine.on('recordingStarted', async (config: { mode: RecordingMode; enableScreenCapture: boolean; isToggleMode: boolean }) => {
    console.log('[Main] Recording started:', config.mode, config.enableScreenCapture ? '+ Screen' : '')

    // CRITICAL: Capture context BEFORE showing overlay to preserve cursor focus
    // 1. Get focused app name (for window-specific screen capture)
    // 2. Get selected text (uses Cmd+C, which briefly affects focus)
    const focusedAppName = await getFocusedAppName()
    const selectedText = await getSelectedText()

    console.log('[Main] Context captured - Focused app:', focusedAppName, 'Selected text:', selectedText?.substring(0, 50) || '(none)')

    // NOW show overlay (after context capture to avoid stealing focus)
    overlayManager?.show(config.mode, config.enableScreenCapture)

    // Send to renderer with recording mode configuration
    mainWindow?.webContents.send('start-recording', {
      mode: config.mode,
      enableScreenCapture: config.enableScreenCapture,
      isToggleMode: config.isToggleMode,
      selectedText,
      focusedAppName
    })

    updateTrayStatus(true)
  })

  stateMachine.on('recordingStopped', () => {
    console.log('[Main] Recording stopped')

    // Hide overlay
    overlayManager?.hide()

    mainWindow?.webContents.send('stop-recording')
    updateTrayStatus(false)
  })

  // Track previous key state to detect changes
  let previousFnState = false
  let previousCtrlState = false

  // Wire up key monitor to both state machine and gesture detector
  keyMonitor.on('keyStateChange', (event: { fnPressed: boolean; ctrlPressed: boolean; timestamp: number }) => {
    console.log('[Main] Key state change:', {
      fn: event.fnPressed ? 'DOWN' : 'UP',
      ctrl: event.ctrlPressed ? 'DOWN' : 'UP',
      timestamp: event.timestamp
    })

    // Detect Fn key changes
    if (event.fnPressed !== previousFnState) {
      if (event.fnPressed) {
        console.log('[Main] → Fn PRESSED')
        gestureDetector?.onKeyPress(true, event.ctrlPressed, event.timestamp)
        stateMachine?.onFnPress(event.timestamp)
      } else {
        console.log('[Main] → Fn RELEASED')
        gestureDetector?.onKeyRelease(false, event.ctrlPressed, event.timestamp)
        stateMachine?.onFnRelease(event.timestamp)
      }
      previousFnState = event.fnPressed
    }

    // Detect Ctrl key changes
    if (event.ctrlPressed !== previousCtrlState) {
      if (event.ctrlPressed) {
        console.log('[Main] → Ctrl PRESSED')
        stateMachine?.onCtrlPress(event.timestamp)
      } else {
        console.log('[Main] → Ctrl RELEASED')
        stateMachine?.onCtrlRelease(event.timestamp)
      }
      previousCtrlState = event.ctrlPressed
    }
  })

  // Start monitoring
  const success = keyMonitor.start()
  if (success) {
    console.log('[Main] ✅ Native key monitoring active (Fn + Fn+Ctrl gestures enabled)')
  } else {
    console.error('[Main] ❌ Failed to start native key monitoring')
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

  // Initialize Wispr Flow-style native key monitoring (Fn + Fn+Ctrl gestures)
  initializeKeyMonitoring()

  // Setup global hotkey (Control+Space - legacy mode, preserved for backward compatibility)
  const hotkey = store.get('hotkey') as string
  setupHotkeyManager(hotkey, async () => {
    console.log('[Main] Hotkey pressed (legacy Control+Space), toggling recording')

    // CRITICAL FIX: Capture context BEFORE starting recording
    // 1. Get focused app name (for window-specific screen capture)
    // 2. Get selected text (for context)
    const focusedAppName = await getFocusedAppName()
    const selectedText = await getSelectedText()

    console.log('[Main] Focused app:', focusedAppName)
    console.log('[Main] Pre-captured selected text:', selectedText?.substring(0, 50) || '(none)')

    // Send to renderer with pre-captured context
    mainWindow?.webContents.send('toggle-recording', {
      selectedText,
      focusedAppName
    })
  })

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
