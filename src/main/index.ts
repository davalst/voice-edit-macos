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
import { exec } from 'child_process'
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
    showOverlay: true,
    showInDock: false,
    dictationSoundEffects: false,
    dictionary: [],
    snippets: [],
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
    // Show window in dev mode after content loads
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })
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
 * Play system sound (macOS only) with debouncing to prevent multiple beeps
 */
let lastSoundTime = { Tink: 0, Pop: 0 }
let isCurrentlyRecording = false
let isPlayingSound = { Tink: false, Pop: false }

function playSound(soundName: 'Tink' | 'Pop') {
  console.log(`[Main] playSound() called with: ${soundName}`)

  // Check if sound effects are enabled
  const soundEffectsEnabled = store.get('dictationSoundEffects', false) as boolean
  if (!soundEffectsEnabled) {
    console.log(`[Main] Sound effects disabled - skipping ${soundName}`)
    return
  }

  // Prevent playing same sound if it's already playing
  if (isPlayingSound[soundName]) {
    console.log(`[Main] Skipping ${soundName} - already playing`)
    return
  }

  // Debounce: Don't play same sound within 1000ms (prevents multiple beeps)
  const now = Date.now()
  if (now - lastSoundTime[soundName] < 1000) {
    console.log(`[Main] Debouncing ${soundName} sound (too soon)`)
    return
  }
  lastSoundTime[soundName] = now

  if (process.platform === 'darwin') {
    console.log(`[Main] ▶️ Playing sound: ${soundName}`)
    isPlayingSound[soundName] = true
    const soundPath = `/System/Library/Sounds/${soundName}.aiff`
    exec(`afplay "${soundPath}"`, (error) => {
      isPlayingSound[soundName] = false
      console.log(`[Main] ✅ Sound finished: ${soundName}`)
      if (error) {
        console.error(`[Main] Failed to play sound ${soundName}:`, error.message)
      }
    })
  }
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

  // Show overlay in idle state if enabled by user settings
  const showOverlay = store.get('showOverlay', true) as boolean
  if (showOverlay) {
    overlayManager.showIdle()
  }

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

    // Set recording flag FIRST, then play sound (prevents duplicate beeps from state transitions)
    const wasRecording = isCurrentlyRecording
    isCurrentlyRecording = true

    // Only play start sound on first recording start, not state transitions
    if (!wasRecording) {
      playSound('Tink')
    } else {
      console.log('[Main] Skipping Tink - state transition (already recording)')
    }

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
    console.log('[Main] Recording stopped (from state machine)')

    // NOTE: Don't play Pop here - it's played by the IPC handler when renderer auto-stops
    // This prevents duplicate beeps
    isCurrentlyRecording = false

    // Hide overlay
    overlayManager?.hide()

    mainWindow?.webContents.send('stop-recording')
    updateTrayStatus(false)
  })

  // Track previous key state to detect changes
  let previousFnState = false
  let previousCtrlState = false
  let previousCmdState = false

  // Wire up key monitor to both state machine and gesture detector
  keyMonitor.on('keyStateChange', (event: { fnPressed: boolean; ctrlPressed: boolean; cmdPressed: boolean; timestamp: number }) => {
    console.log('[Main] Key state change:', {
      fn: event.fnPressed ? 'DOWN' : 'UP',
      ctrl: event.ctrlPressed ? 'DOWN' : 'UP',
      cmd: event.cmdPressed ? 'DOWN' : 'UP',
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

    // Detect Command key changes
    if (event.cmdPressed !== previousCmdState) {
      if (event.cmdPressed) {
        console.log('[Main] → Command PRESSED')
        stateMachine?.onCmdPress(event.timestamp)
      } else {
        console.log('[Main] → Command RELEASED')
        stateMachine?.onCmdRelease(event.timestamp)
      }
      previousCmdState = event.cmdPressed
    }
  })

  // Start monitoring
  const success = keyMonitor.start()
  if (success) {
    console.log('[Main] ✅ Native key monitoring active (Fn + Fn+Ctrl + Fn+Command gestures enabled)')
  } else {
    console.error('[Main] ❌ Failed to start native key monitoring')
    console.error('[Main] Please grant Accessibility permissions in System Preferences')
  }
}

/**
 * Setup Fn key toggle (replaces Ctrl+Space hotkey)
 * Fn PRESS once = start recording
 * Fn PRESS again = stop recording
 */
function setupFnKeyToggle() {
  console.log('[Main] Setting up Fn key toggle monitoring...')

  const fnKeyMonitor = new KeyMonitor()
  let previousFnState = false

  fnKeyMonitor.on('keyStateChange', async (event: { fnPressed: boolean; ctrlPressed: boolean; timestamp: number }) => {
    // Detect Fn key PRESS (ignore release, ignore arrow keys)
    if (event.fnPressed && !previousFnState) {
      console.log('[Main] Fn KEY PRESSED - toggling recording')

      // CRITICAL: Capture context BEFORE starting recording (same as working Ctrl+Space)
      const focusedAppName = await getFocusedAppName()
      const selectedText = await getSelectedText()

      console.log('[Main] Focused app:', focusedAppName)
      console.log('[Main] Pre-captured selected text:', selectedText?.substring(0, 50) || '(none)')

      // Send to renderer with pre-captured context (exactly like Ctrl+Space)
      mainWindow?.webContents.send('toggle-recording', {
        selectedText,
        focusedAppName
      })
    }

    previousFnState = event.fnPressed
  })

  const success = fnKeyMonitor.start()
  if (success) {
    console.log('[Main] ✅ Fn key toggle monitoring active')
  } else {
    console.error('[Main] ❌ Failed to start Fn key monitoring')
    console.error('[Main] Please grant Accessibility permissions')
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

  // Apply Dock visibility setting from config (macOS only)
  if (process.platform === 'darwin') {
    const showInDock = store.get('showInDock', false) as boolean
    if (showInDock) {
      app.dock.show()
      console.log('[Main] Dock icon shown (from config)')
    } else {
      app.dock.hide()
      console.log('[Main] Dock icon hidden (from config)')
    }
  }

  // Enable gesture detection system (supports Fn+Ctrl to avoid emoji picker)
  initializeKeyMonitoring()

  // DISABLED: Simple Fn toggle (triggers macOS emoji picker)
  // setupFnKeyToggle()

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

  // Apply Dock visibility setting immediately (macOS only)
  if (process.platform === 'darwin' && 'showInDock' in config) {
    if (config.showInDock) {
      app.dock.show()
      console.log('[Main] Dock icon shown')
    } else {
      app.dock.hide()
      console.log('[Main] Dock icon hidden')
    }
  }

  // Apply overlay visibility setting immediately
  if ('showOverlay' in config) {
    if (overlayManager) {
      if (config.showOverlay) {
        console.log('[Main] Overlay enabled')
        overlayManager.showIdle() // Show overlay in idle state
      } else {
        console.log('[Main] Overlay disabled')
        overlayManager.hide() // Hide overlay if it's currently showing
      }
    }
  }

  return { success: true }
})

// Start recording
ipcMain.on('recording-started', () => {
  console.log('[Main] Recording started')
  updateTrayStatus(true)
})

// Stop recording (IPC from renderer when auto-stop triggers)
ipcMain.on('recording-stopped', () => {
  console.log('[Main] Recording stopped (from renderer IPC)')

  // NOTE: Pop sound removed - only using Tink at start per user preference
  isCurrentlyRecording = false

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

    // CRITICAL: Show result in overlay AFTER paste completes
    // This prevents overlay from stealing focus during paste
    setTimeout(() => {
      const preview = text.length > 50 ? text.substring(0, 50) + '...' : text
      overlayManager?.showResult(preview)
    }, 100)
  }, 50)
})

// Speak text using native macOS say command with Samantha voice
ipcMain.on('speak-text', (_event, text: string) => {
  console.log('[Main] Speaking text with Samantha voice:', text.substring(0, 50) + '...')

  if (process.platform === 'darwin') {
    // Use native macOS say command with Samantha voice (premium quality)
    // Escape quotes in text to prevent command injection
    const escapedText = text.replace(/"/g, '\\"')
    exec(`say -v Samantha "${escapedText}"`, (error) => {
      if (error) {
        console.error('[Main] Failed to speak text:', error.message)
      } else {
        console.log('[Main] ✅ Finished speaking')
      }
    })
  }
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

// Dictionary CRUD operations
ipcMain.handle('dictionary-get-all', () => {
  return store.get('dictionary', [])
})

ipcMain.handle('dictionary-add', (_event, entry: { correctWord: string; incorrectVariants: string[] }) => {
  const dictionary = store.get('dictionary', []) as any[]
  const newEntry = {
    id: Date.now().toString(),
    correctWord: entry.correctWord,
    incorrectVariants: entry.incorrectVariants
  }
  dictionary.push(newEntry)
  store.set('dictionary', dictionary)
  return { success: true, entry: newEntry }
})

ipcMain.handle('dictionary-update', (_event, id: string, entry: { correctWord: string; incorrectVariants: string[] }) => {
  const dictionary = store.get('dictionary', []) as any[]
  const index = dictionary.findIndex(e => e.id === id)
  if (index !== -1) {
    dictionary[index] = { ...dictionary[index], ...entry }
    store.set('dictionary', dictionary)
    return { success: true }
  }
  return { success: false, error: 'Entry not found' }
})

ipcMain.handle('dictionary-delete', (_event, id: string) => {
  const dictionary = store.get('dictionary', []) as any[]
  const filtered = dictionary.filter(e => e.id !== id)
  store.set('dictionary', filtered)
  return { success: true }
})

// Snippets CRUD operations
ipcMain.handle('snippets-get-all', () => {
  return store.get('snippets', [])
})

ipcMain.handle('snippets-add', (_event, entry: { trigger: string; expansion: string }) => {
  const snippets = store.get('snippets', []) as any[]
  const newEntry = {
    id: Date.now().toString(),
    trigger: entry.trigger,
    expansion: entry.expansion
  }
  snippets.push(newEntry)
  store.set('snippets', snippets)
  return { success: true, entry: newEntry }
})

ipcMain.handle('snippets-update', (_event, id: string, entry: { trigger: string; expansion: string }) => {
  const snippets = store.get('snippets', []) as any[]
  const index = snippets.findIndex(e => e.id === id)
  if (index !== -1) {
    snippets[index] = { ...snippets[index], ...entry }
    store.set('snippets', snippets)
    return { success: true }
  }
  return { success: false, error: 'Entry not found' }
})

ipcMain.handle('snippets-delete', (_event, id: string) => {
  const snippets = store.get('snippets', []) as any[]
  const filtered = snippets.filter(e => e.id !== id)
  store.set('snippets', filtered)
  return { success: true }
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
