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

import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { setupHotkeyManager } from './hotkey-manager'
import { simulatePaste, copyToClipboard } from './clipboard-manager'
import { requestPermissions } from './permissions'

// Configuration store
const store = new Store({
  defaults: {
    apiKey: '',
    hotkey: 'Fn',
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

/**
 * Create main window (status/settings window)
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false, // Hidden by default (use tray icon)
    frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Hide window instead of closing on macOS
  mainWindow.on('close', event => {
    if (!app.isQuitting) {
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
        app.isQuitting = true
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

  // Setup global hotkey (Fn key or configured alternative)
  const hotkey = store.get('hotkey') as string
  setupHotkeyManager(hotkey, () => {
    console.log('[Main] Hotkey pressed, toggling recording')
    mainWindow?.webContents.send('toggle-recording')
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
ipcMain.handle('save-config', (event, config) => {
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
ipcMain.on('paste-text', (event, text: string) => {
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

// Show notification
ipcMain.on('show-notification', (event, message: string) => {
  // TODO: Use Electron Notification API
  console.log('[Main] Notification:', message)
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
})

app.on('before-quit', () => {
  app.isQuitting = true
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
