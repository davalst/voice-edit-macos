/**
 * macOS Permissions Manager
 *
 * Handles requesting and checking required macOS permissions:
 * - Microphone (for voice recording)
 * - Screen Recording (for multimodal screen capture)
 * - Accessibility (for keyboard simulation - paste)
 */

import { systemPreferences, dialog } from 'electron'

/**
 * Request all required macOS permissions
 *
 * @returns true if all permissions granted
 */
export async function requestPermissions(): Promise<boolean> {
  console.log('[Permissions] Checking required macOS permissions...')

  const permissions = {
    microphone: await requestMicrophonePermission(),
    screenRecording: await checkScreenRecordingPermission(),
    accessibility: await checkAccessibilityPermission(),
  }

  console.log('[Permissions] Permission status:', permissions)

  const allGranted = Object.values(permissions).every(p => p === true)

  if (!allGranted) {
    showPermissionsDialog(permissions)
  }

  return allGranted
}

/**
 * Request microphone permission
 */
async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    console.log('[Permissions] Microphone status:', status)

    if (status === 'granted') {
      return true
    }

    if (status === 'not-determined') {
      // Request permission
      const granted = await systemPreferences.askForMediaAccess('microphone')
      console.log('[Permissions] Microphone permission granted:', granted)
      return granted
    }

    // Permission denied
    return false
  } catch (error: any) {
    console.error('[Permissions] Error checking microphone permission:', error.message)
    return false
  }
}

/**
 * Check screen recording permission
 *
 * NOTE: macOS doesn't provide an API to programmatically request screen recording permission.
 * User must manually enable it in System Preferences > Security & Privacy > Privacy > Screen Recording.
 *
 * We can only check if permission is granted by attempting to capture screen.
 */
async function checkScreenRecordingPermission(): Promise<boolean> {
  try {
    // On macOS 10.15+, screen recording permission is required
    // Electron doesn't expose a direct API, so we check system preferences
    const status = systemPreferences.getMediaAccessStatus('screen')
    console.log('[Permissions] Screen recording status:', status)

    return status === 'granted'
  } catch (error: any) {
    // Fallback: assume permission granted on older macOS versions
    console.warn('[Permissions] Could not check screen recording permission:', error.message)
    return true
  }
}

/**
 * Check accessibility permission
 *
 * Required for keyboard simulation (Cmd+V paste).
 * User must manually enable in System Preferences.
 */
async function checkAccessibilityPermission(): Promise<boolean> {
  try {
    // Electron doesn't provide direct API for accessibility permission
    // We check if we're a trusted accessibility client
    const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
    console.log('[Permissions] Accessibility trusted:', isTrusted)

    if (!isTrusted) {
      // Prompt user to grant access (opens System Preferences)
      systemPreferences.isTrustedAccessibilityClient(true)
    }

    return isTrusted
  } catch (error: any) {
    console.error('[Permissions] Error checking accessibility permission:', error.message)
    return false
  }
}

/**
 * Show dialog explaining missing permissions
 */
function showPermissionsDialog(permissions: { microphone: boolean; screenRecording: boolean; accessibility: boolean }): void {
  const missing: string[] = []

  if (!permissions.microphone) {
    missing.push('🎤 Microphone - Required for voice recording')
  }

  if (!permissions.screenRecording) {
    missing.push('📺 Screen Recording - Required for multimodal editing (optional)')
  }

  if (!permissions.accessibility) {
    missing.push('♿ Accessibility - Required for pasting edited text')
  }

  if (missing.length === 0) {
    return
  }

  const message = `Voice Edit needs the following permissions to work:\n\n${missing.join('\n')}\n\nPlease grant these permissions in System Preferences > Security & Privacy > Privacy.`

  dialog.showMessageBox({
    type: 'warning',
    title: 'Permissions Required',
    message: 'Voice Edit Needs Permissions',
    detail: message,
    buttons: ['Open System Preferences', 'Later'],
    defaultId: 0,
  }).then(result => {
    if (result.response === 0) {
      // Open System Preferences
      openSystemPreferences()
    }
  })
}

/**
 * Open macOS System Preferences to Privacy settings
 */
function openSystemPreferences(): void {
  try {
    // Open Security & Privacy preferences pane
    const { exec } = require('child_process')
    exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy"')
    console.log('[Permissions] Opened System Preferences')
  } catch (error: any) {
    console.error('[Permissions] Failed to open System Preferences:', error.message)
  }
}

/**
 * Get permission status for display in UI
 */
export function getPermissionStatus(): {
  microphone: string
  screenRecording: string
  accessibility: string
} {
  return {
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    screenRecording: systemPreferences.getMediaAccessStatus('screen'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied',
  }
}
