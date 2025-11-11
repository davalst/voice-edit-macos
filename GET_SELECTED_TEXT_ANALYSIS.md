# Get Selected Text - Deep Dive Analysis

**Date**: 2025-11-10
**Issue**: `getSelectedText()` function not working - Gemini receives no context

## The Problem

When you highlight text and use Control+Space, Gemini responds with:
> "Please provide the text you would like to convert into a paragraph."

This means **NO selected text is being sent to Gemini**.

## Evidence from Console Logs

Looking at your logs, these lines are **MISSING**:
```
[VoiceEdit] Got selected text: ... ❌ NEVER APPEARS
[VoiceEdit] 📤 Sending INPUT context: ... ❌ NEVER APPEARS
[VoiceEdit] 📤 Sending DICTATION context ... ❌ NEVER APPEARS
```

What DOES appear:
```
[VoiceEdit] Silence detected - processing... ✅
[GeminiLiveSDK] Server content with 1 parts ✅
```

**Conclusion**: The `getSelectedTextFromApp()` function is called but silently fails or never completes.

## Current Implementation (Broken)

### File: `src/renderer/composables/useVoiceEdit.ts`

```typescript
// Lines 252-262
async function getSelectedTextFromApp(): Promise<string> {
  try {
    // Use Electron IPC to get selected text (uses Cmd+C behind the scenes)
    const selectedText = await electronAPI?.getSelectedText()
    console.log('[VoiceEdit] Got selected text:', selectedText?.substring(0, 50) + '...')
    return selectedText || ''
  } catch (error) {
    console.error('[VoiceEdit] Failed to get selected text:', error)
    return ''
  }
}
```

### File: `src/main/clipboard-manager.ts`

```typescript
// Lines 113-144
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
```

## Why This Is Failing

### Problem 1: Race Condition
The 100ms wait is **NOT ENOUGH** on macOS. Applications need time to:
1. Receive the Cmd+C keystroke
2. Copy selection to clipboard
3. Update the system clipboard

**Reality**: Can take 150-300ms depending on the app.

### Problem 2: Clipboard Comparison Logic Bug
```typescript
if (selectedText === originalClipboard) {
  return ''
}
```

This assumes:
- If clipboard didn't change, nothing was selected
- **BUT**: What if user previously copied the SAME text they now have selected?
- Result: Function incorrectly returns empty string

### Problem 3: No Clipboard Restoration
The current code says "Restore original clipboard if nothing was selected" but **NEVER ACTUALLY RESTORES IT**.

The clipboard is PERMANENTLY changed after every use.

### Problem 4: Missing Error Handling
If AppleScript fails (permission denied, etc.), the function silently returns `''` with no user feedback.

## Best Practices from Research (2024-2025)

### Method 1: electron-selected-text Package
```bash
npm install electron-selected-text
```

```typescript
import { getSelectedText } from "electron-selected-text";

const text = await getSelectedText();
```

**Pros**:
- Professionally maintained
- Handles timing issues
- Works reliably

**Cons**:
- Uses robotjs (requires native compilation)
- May have issues with latest Electron versions

### Method 2: Improved AppleScript with Clipboard Restoration

From Stack Overflow (2024):

```typescript
async function getSelectedText(): Promise<string> {
  try {
    // Step 1: Save entire clipboard (including rich text formats)
    const saveScript = `
      use framework "Foundation"
      use framework "AppKit"

      set pb to current application's NSPasteboard's generalPasteboard()
      set savedItems to pb's pasteboardItems()
      return savedItems
    `

    const { stdout: savedClipboard } = await execAsync(`osascript -e '${saveScript}'`)

    // Step 2: Clear clipboard to ensure we detect new copy
    clipboard.clear()

    // Step 3: Simulate Cmd+C
    const copyScript = `
      tell application "System Events"
        keystroke "c" using command down
      end tell
    `
    await execAsync(`osascript -e '${copyScript}'`)

    // Step 4: Wait for clipboard with polling (up to 500ms)
    let selectedText = ''
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      selectedText = clipboard.readText()
      if (selectedText && selectedText.trim()) {
        break
      }
    }

    // Step 5: Restore original clipboard
    if (savedClipboard && savedClipboard.trim()) {
      const restoreScript = `
        use framework "Foundation"
        use framework "AppKit"

        set pb to current application's NSPasteboard's generalPasteboard()
        pb's clearContents()
        -- Restore items
        pb's writeObjects:${savedClipboard}
      `
      await execAsync(`osascript -e '${restoreScript}'`)
    }

    console.log('[ClipboardManager] Got selected text:', selectedText.substring(0, 50))
    return selectedText || ''
  } catch (error: any) {
    console.error('[ClipboardManager] ❌ Failed:', error.message)
    return ''
  }
}
```

### Method 3: Simpler, More Reliable Approach (RECOMMENDED)

```typescript
export async function getSelectedText(): Promise<string> {
  try {
    console.log('[ClipboardManager] Getting selected text...')

    // Save original clipboard
    const originalText = clipboard.readText()
    const originalFormats = clipboard.availableFormats()
    console.log('[ClipboardManager] Saved clipboard:', originalFormats)

    // Clear clipboard completely
    clipboard.clear()

    // Small delay to ensure clipboard is cleared
    await new Promise(resolve => setTimeout(resolve, 50))

    // Simulate Cmd+C
    const script = `
      tell application "System Events"
        keystroke "c" using command down
      end tell
    `
    await execAsync(`osascript -e '${script}'`)

    // Poll for new clipboard content (max 500ms)
    let selectedText = ''
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100))
      selectedText = clipboard.readText()

      if (selectedText && selectedText.trim().length > 0) {
        console.log('[ClipboardManager] ✅ Got selection after', (attempts + 1) * 100, 'ms')
        break
      }

      attempts++
    }

    // Restore original clipboard
    if (originalText && originalText.trim().length > 0) {
      clipboard.writeText(originalText)
      console.log('[ClipboardManager] ✅ Restored clipboard')
    }

    if (!selectedText || selectedText.trim().length === 0) {
      console.log('[ClipboardManager] No text selected')
      return ''
    }

    console.log('[ClipboardManager] Selected text:', selectedText.substring(0, 50) + '...')
    return selectedText

  } catch (error: any) {
    console.error('[ClipboardManager] ❌ Error:', error.message)

    // Check for permissions error
    if (error.message.includes('not allowed') || error.message.includes('accessibility')) {
      console.error('[ClipboardManager] ⚠️  ACCESSIBILITY PERMISSION REQUIRED')
      console.error('[ClipboardManager] Go to: System Preferences > Privacy & Security > Accessibility')
    }

    return ''
  }
}
```

## Key Improvements in Recommended Solution

1. **Clear clipboard before copying** - Guarantees we can detect new content
2. **Polling with timeout** - Wait up to 500ms for clipboard to update
3. **Proper clipboard restoration** - Always restore, not conditionally
4. **Better logging** - See exactly what's happening at each step
5. **Permission error detection** - Tell user if accessibility is the issue

## Alternative: Use Existing Package

If you want a battle-tested solution:

```bash
npm install @todesktop/electron-selected-text-prebuild
```

```typescript
import { getSelectedText } from '@todesktop/electron-selected-text-prebuild'

const text = await getSelectedText()
```

This is maintained by ToDesktop (professional Electron app builder) and handles all edge cases.

## Testing the Fix

1. Highlight text in any app
2. Press Control+Space
3. Check console for:
   ```
   [ClipboardManager] Getting selected text...
   [ClipboardManager] Saved clipboard: ...
   [ClipboardManager] ✅ Got selection after 100 ms
   [ClipboardManager] Selected text: ...
   [ClipboardManager] ✅ Restored clipboard
   [VoiceEdit] Got selected text: ...
   [VoiceEdit] 📤 Sending INPUT context: <INPUT>...</INPUT>
   ```

If all those logs appear, it's working!

## Recommendation

**Use Method 3 (Simpler, More Reliable Approach)** because:
- No external dependencies
- Better error handling
- Proper clipboard restoration
- Clear logging for debugging
- Handles timing issues with polling

Avoid using packages like `electron-selected-text` or `robotjs` because they:
- Require native compilation
- May break with Electron updates
- Add unnecessary complexity

The clipboard + AppleScript approach is native to macOS and will continue working.
