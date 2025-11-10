/**
 * Preload Script - Voice Edit
 *
 * Exposes safe IPC methods to renderer process via contextBridge.
 * This maintains security while allowing renderer to communicate with main process.
 */

import { contextBridge, ipcRenderer } from 'electron'

/**
 * Exposed API for renderer process
 */
const api = {
  /**
   * Configuration
   */
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  /**
   * Recording control
   */
  onToggleRecording: (callback: (event: any, context: { selectedText: string; focusedAppName: string }) => void) => {
    ipcRenderer.on('toggle-recording', callback)
  },
  notifyRecordingStarted: () => {
    ipcRenderer.send('recording-started')
  },
  notifyRecordingStopped: () => {
    ipcRenderer.send('recording-stopped')
  },

  /**
   * Clipboard & paste
   */
  pasteText: (text: string) => {
    ipcRenderer.send('paste-text', text)
  },
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  getSelectedText: () => ipcRenderer.invoke('get-selected-text'),

  /**
   * Notifications
   */
  showNotification: (message: string) => {
    ipcRenderer.send('show-notification', message)
  },

  /**
   * Debug logging
   */
  log: (message: string) => {
    ipcRenderer.send('log', message)
  },

  /**
   * Platform info
   */
  platform: process.platform,
  versions: process.versions,

  /**
   * Screen capture (Electron desktopCapturer API via IPC)
   */
  getScreenSources: (opts: any) => ipcRenderer.invoke('get-screen-sources', opts),

  /**
   * Overlay window events
   */
  onOverlayShow: (callback: (data: { mode: string; enableScreenCapture: boolean }) => void) => {
    ipcRenderer.on('overlay-show', (_event, data) => callback(data))
  },
  onOverlayHide: (callback: () => void) => {
    ipcRenderer.on('overlay-hide', callback)
  },
  onOverlayWaveform: (callback: (data: number[]) => void) => {
    ipcRenderer.on('overlay-waveform', (_event, data) => callback(data))
  },
}

/**
 * Expose API to renderer via window.electronAPI
 */
contextBridge.exposeInMainWorld('electronAPI', api)

/**
 * TypeScript type definitions for window.electronAPI
 * Add this to src/renderer/types/electron.d.ts
 */
export type ElectronAPI = typeof api
