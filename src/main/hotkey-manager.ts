/**
 * Global Hotkey Manager for Voice Edit
 *
 * Handles registration of global hotkeys (Fn key, Ctrl+Opt, etc.)
 * for triggering voice recording across the entire macOS system.
 */

import { globalShortcut } from 'electron'

type HotkeyCallback = () => void

let currentHotkey: string | null = null
let currentCallback: HotkeyCallback | null = null

/**
 * Setup global hotkey for voice recording activation
 *
 * @param hotkey - Hotkey combination (e.g., 'Fn', 'CommandOrControl+Shift+V')
 * @param callback - Function to call when hotkey is pressed
 * @returns true if hotkey registered successfully
 */
export function setupHotkeyManager(hotkey: string, callback: HotkeyCallback): boolean {
  console.log('[HotkeyManager] Setting up hotkey:', hotkey)

  // Unregister previous hotkey if exists
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
    console.log('[HotkeyManager] Unregistered previous hotkey:', currentHotkey)
  }

  // Handle special case: Fn key
  // NOTE: Fn key is not directly supported by Electron's globalShortcut
  // We'll use CommandOrControl+Shift+Space as alternative
  let actualHotkey = hotkey
  if (hotkey === 'Fn' || hotkey === 'Function') {
    actualHotkey = 'CommandOrControl+Shift+Space'
    console.warn('[HotkeyManager] Fn key not directly supported, using CommandOrControl+Shift+Space instead')
  }

  // Register new hotkey
  try {
    const success = globalShortcut.register(actualHotkey, () => {
      console.log('[HotkeyManager] Hotkey triggered:', actualHotkey)
      callback()
    })

    if (success) {
      currentHotkey = actualHotkey
      currentCallback = callback
      console.log('[HotkeyManager] ✅ Hotkey registered successfully:', actualHotkey)
      return true
    } else {
      console.error('[HotkeyManager] ❌ Failed to register hotkey:', actualHotkey)
      return false
    }
  } catch (error) {
    console.error('[HotkeyManager] ❌ Error registering hotkey:', error)
    return false
  }
}

/**
 * Unregister current hotkey
 */
export function unregisterHotkey(): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
    console.log('[HotkeyManager] Unregistered hotkey:', currentHotkey)
    currentHotkey = null
    currentCallback = null
  }
}

/**
 * Check if hotkey is currently registered
 */
export function isHotkeyRegistered(): boolean {
  return currentHotkey !== null && globalShortcut.isRegistered(currentHotkey)
}

/**
 * Get currently registered hotkey
 */
export function getCurrentHotkey(): string | null {
  return currentHotkey
}

/**
 * Available hotkey presets
 */
export const HOTKEY_PRESETS = {
  'Cmd+Shift+Space': 'CommandOrControl+Shift+Space',
  'Cmd+Shift+V': 'CommandOrControl+Shift+V',
  'Ctrl+Alt+Space': 'Control+Alt+Space',
  'Cmd+Opt+Space': 'Command+Alt+Space',
  'F13': 'F13', // Available on some keyboards
  'F14': 'F14',
  'F15': 'F15',
} as const

/**
 * Validate hotkey string
 */
export function validateHotkey(hotkey: string): boolean {
  // Check if it's a preset
  if (Object.values(HOTKEY_PRESETS).includes(hotkey as any)) {
    return true
  }

  // Check if it's a valid Electron accelerator format
  // Format: [Modifier+]Key
  const modifiers = ['Command', 'CommandOrControl', 'Control', 'Alt', 'Shift', 'Super']
  const parts = hotkey.split('+')

  if (parts.length === 0 || parts.length > 4) {
    return false
  }

  // Last part should be the key
  const key = parts[parts.length - 1]
  if (!key || key.length === 0) {
    return false
  }

  // All other parts should be modifiers
  for (let i = 0; i < parts.length - 1; i++) {
    if (!modifiers.includes(parts[i])) {
      return false
    }
  }

  return true
}

/**
 * Get human-readable hotkey description
 */
export function getHotkeyDescription(hotkey: string): string {
  return hotkey
    .replace('CommandOrControl', '⌘/Ctrl')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace('Space', 'Space')
}
