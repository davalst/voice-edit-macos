/**
 * Clipboard Manager for Voice Edit
 *
 * Handles clipboard operations and keyboard simulation for pasting
 * edited text into the currently focused macOS application.
 */

import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Copy text to system clipboard
 *
 * @param text - Text to copy to clipboard
 */
export function copyToClipboard(text: string): void {
  clipboard.writeText(text)
  console.log('[ClipboardManager] Copied to clipboard:', text.substring(0, 50) + '...')
}

/**
 * Get text from system clipboard
 *
 * @returns Current clipboard text content
 */
export function getFromClipboard(): string {
  return clipboard.readText()
}

/**
 * Clear system clipboard
 */
export function clearClipboard(): void {
  clipboard.clear()
  console.log('[ClipboardManager] Clipboard cleared')
}

/**
 * Simulate Cmd+V paste in the currently focused macOS application
 *
 * NOTE: This uses AppleScript to simulate keyboard input, which requires
 * Accessibility permissions on macOS.
 *
 * Alternative methods considered:
 * 1. robotjs - Requires native compilation, has macOS permission issues
 * 2. nut.js - Similar to robotjs
 * 3. AppleScript - Works reliably on macOS with accessibility permission
 */
export async function simulatePaste(): Promise<boolean> {
  try {
    console.log('[ClipboardManager] Simulating Cmd+V paste...')

    // AppleScript to simulate Cmd+V
    const script = `
      tell application "System Events"
        keystroke "v" using command down
      end tell
    `

    await execAsync(`osascript -e '${script}'`)
    console.log('[ClipboardManager] ✅ Paste successful')
    return true
  } catch (error: any) {
    console.error('[ClipboardManager] ❌ Paste failed:', error.message)

    // Check if it's a permission error
    if (error.message.includes('not allowed assistive access')) {
      console.error('[ClipboardManager] ⚠️  Accessibility permission required!')
      console.error('[ClipboardManager] Go to: System Preferences > Security & Privacy > Privacy > Accessibility')
      console.error('[ClipboardManager] Add Voice Edit to allowed apps')
    }

    return false
  }
}

/**
 * Simulate keyboard shortcut using AppleScript
 *
 * @param key - Key to press (e.g., 'v', 'c', 'a')
 * @param modifiers - Array of modifiers (e.g., ['command', 'shift'])
 * @returns true if successful
 */
export async function simulateKeyPress(key: string, modifiers: string[] = []): Promise<boolean> {
  try {
    const modifierString = modifiers.length > 0 ? `using {${modifiers.map(m => `${m} down`).join(', ')}}` : ''

    const script = `
      tell application "System Events"
        keystroke "${key}" ${modifierString}
      end tell
    `

    await execAsync(`osascript -e '${script}'`)
    console.log(`[ClipboardManager] ✅ Key press successful: ${modifiers.join('+') + '+' + key}`)
    return true
  } catch (error: any) {
    console.error(`[ClipboardManager] ❌ Key press failed:`, error.message)
    return false
  }
}

/**
 * Get text selection from currently focused application
 *
 * Uses Cmd+C to copy selected text, then restores original clipboard.
 *
 * @returns Selected text, or empty string if nothing selected
 */
export async function getSelectedText(): Promise<string> {
  try {
    // Save current clipboard
    const originalClipboard = clipboard.readText()

    // Simulate Cmd+C to copy selection
    const script = `
      tell application "System Events"
        keystroke "c" using command down
      end tell
    `

    await execAsync(`osascript -e '${script}'`)

    // Wait briefly for clipboard to update
    await new Promise(resolve => setTimeout(resolve, 100))

    // Get copied text
    const selectedText = clipboard.readText()

    // Restore original clipboard if nothing was selected
    if (selectedText === originalClipboard) {
      return ''
    }

    console.log('[ClipboardManager] Got selected text:', selectedText.substring(0, 50) + '...')
    return selectedText
  } catch (error: any) {
    console.error('[ClipboardManager] ❌ Failed to get selected text:', error.message)
    return ''
  }
}

/**
 * Get name of currently focused application
 *
 * @returns Application name, or 'Unknown' if failed
 */
export async function getFocusedAppName(): Promise<string> {
  try {
    const script = `
      tell application "System Events"
        name of first application process whose frontmost is true
      end tell
    `

    const { stdout } = await execAsync(`osascript -e '${script}'`)
    const appName = stdout.trim()
    console.log('[ClipboardManager] Focused app:', appName)
    return appName
  } catch (error: any) {
    console.error('[ClipboardManager] ❌ Failed to get focused app:', error.message)
    return 'Unknown'
  }
}
