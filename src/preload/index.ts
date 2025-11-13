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
  onStartRecording: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('start-recording', callback)
  },
  onStopRecording: (callback: () => void) => {
    ipcRenderer.on('stop-recording', callback)
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
   * Console logs export
   */
  exportLogs: (logs: string) => ipcRenderer.invoke('export-logs', logs),

  /**
   * Dictionary CRUD operations
   */
  dictionaryGetAll: () => ipcRenderer.invoke('dictionary-get-all'),
  dictionaryAdd: (entry: { correctWord: string; incorrectVariants: string[] }) =>
    ipcRenderer.invoke('dictionary-add', entry),
  dictionaryUpdate: (id: string, entry: { correctWord: string; incorrectVariants: string[] }) =>
    ipcRenderer.invoke('dictionary-update', id, entry),
  dictionaryDelete: (id: string) => ipcRenderer.invoke('dictionary-delete', id),

  /**
   * Snippets CRUD operations
   */
  snippetsGetAll: () => ipcRenderer.invoke('snippets-get-all'),
  snippetsAdd: (entry: { trigger: string; expansion: string }) =>
    ipcRenderer.invoke('snippets-add', entry),
  snippetsUpdate: (id: string, entry: { trigger: string; expansion: string }) =>
    ipcRenderer.invoke('snippets-update', id, entry),
  snippetsDelete: (id: string) => ipcRenderer.invoke('snippets-delete', id),

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
  onOverlayResult: (callback: (result: string) => void) => {
    ipcRenderer.on('overlay-result', (_event, result) => callback(result))
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
