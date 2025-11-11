# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL: Working Code Reference

**BEFORE making ANY changes to this codebase, READ [WORKING_CODE.md](./WORKING_CODE.md) first!**

The WORKING_CODE.md document captures the LAST KNOWN WORKING VERSION (commit `6484dd9` from Nov 9 2025, 10:55 PM) with comprehensive explanations of:

1. **Pre-Capture Pattern** - How to capture selected text BEFORE focus changes
2. **VAD Auto-Send** - How silence detection triggers processing automatically
3. **Continuous Conversation** - Why recording stays active after responses
4. **Screen Capture Lifecycle** - When to start/stop screen sharing
5. **Gemini System Instruction** - How to separate commands from text
6. **Text Replacement Flow** - How edited text replaces selected text

**DO NOT BREAK THESE PATTERNS!** They were carefully designed to solve specific timing and UX issues.

## Overview

Voice Edit is a macOS Electron app that provides intelligent voice-controlled text editing with multimodal screen awareness, powered by Google Gemini 2.0 Flash. It allows users to speak natural language commands to edit text in ANY macOS application.

## Development Commands

```bash
# Run in development mode (hot reload with DevTools)
npm run dev

# Type checking (runs vue-tsc) - ALL PASSING ✅
npm run typecheck

# Format code with Prettier
npm run format

# Build for production (creates .dmg in release/)
npm run build:mac

# Build without packaging (for testing, output in release/mac-arm64/Voice Edit.app)
npm run build:dir

# Clean build
rm -rf dist dist-electron release && npm run build:mac
```

## Current Build Status

**TypeScript**: ✅ All errors fixed, typecheck passes
**Build**: ✅ Successfully builds Electron app
**Dev Mode**: ✅ Vite dev server starts correctly
**Missing**: ⚠️ App icons (placeholder only), needs testing with real Gemini API key

## Architecture

### Three-Process Architecture (Electron)

Voice Edit follows Electron's multi-process architecture:

1. **Main Process** (`src/main/`) - Node.js backend
   - App lifecycle management (src/main/index.ts)
   - Global hotkey registration (src/main/hotkey-manager.ts)
   - Clipboard + keyboard simulation via AppleScript (src/main/clipboard-manager.ts)
   - macOS permissions handling (src/main/permissions.ts)
   - IPC handlers for renderer communication
   - System tray icon management

2. **Renderer Process** (`src/renderer/`) - Vue 3 frontend
   - Vue 3 UI with Composition API (App.vue)
   - Audio/video capture libraries (`lib/`)
   - Gemini API integration (`services/`)
   - Voice edit logic (`composables/`)

3. **Preload Script** (`src/preload/index.ts`) - Security bridge
   - Exposes safe IPC APIs via `contextBridge`
   - Available as `window.electronAPI` in renderer

### Key Data Flow

**Voice Command Flow:**
1. User presses global hotkey (⌘+Shift+Space) → Main process receives
2. Main sends IPC message `toggle-recording` → Renderer process
3. Renderer starts audio recording + screen capture (if enabled)
4. Audio (PCM 16kHz) + Video (JPEG 1 FPS) streamed to Gemini Live API
5. Voice Activity Detection (VAD) detects 1.5s silence → Triggers processing
6. Selected text sent as context to Gemini
7. Gemini returns structured JSON (action + result)
8. Renderer sends edited text via IPC → Main process
9. Main copies to clipboard + simulates Cmd+V → Pastes in active app

**IPC Communication:**
- `get-config` / `save-config` - Settings (stored in electron-store)
- `recording-started` / `recording-stopped` - Recording state
- `paste-text` - Trigger clipboard paste
- `toggle-recording` - Start/stop recording from hotkey

### Gemini Integration

Uses `@google/genai` SDK (v1.29.0) with:
- **Model**: `gemini-2.0-flash-exp`
- **Streaming**: Real-time audio (16kHz PCM) + video (1 FPS JPEG)
- **Output**: Structured JSON via `responseSchema`
- **Adapter**: `GeminiLiveSDKAdapter` (src/renderer/services/geminiLiveSDKAdapter.ts)

**Response Format:**
```json
{
  "action": "edit" | "query" | "insert_styled" | "search",
  "result": "edited text or query answer",
  "confidence": 0.95,
  // Additional fields vary by action type
}
```

### Audio Pipeline

1. **AudioRecorder** (src/renderer/lib/audio-recorder.ts)
   - Captures microphone → 16kHz PCM
   - Uses Web Audio API + AudioWorklet
   - Emits base64-encoded audio chunks

2. **VoiceActivityDetector** (src/renderer/lib/voice-activity-detection.ts)
   - Detects 1.5s silence to trigger processing
   - Energy-based detection with thresholds:
     - `silenceThreshold`: 0.02
     - `silenceDuration`: 1500ms
     - `minSpeechDuration`: 1500ms
     - `minPeakEnergy`: 0.05

3. **VideoFrameCapturer** (src/renderer/lib/video-frame-capturer.ts)
   - Captures screen at 1 FPS
   - Encodes as JPEG base64
   - Requires Screen Recording permission

### Clipboard & Paste

**macOS Accessibility:**
- Uses AppleScript for keyboard simulation (requires Accessibility permission)
- `clipboard-manager.ts` provides:
  - `simulatePaste()` - Sends Cmd+V to active app
  - `getSelectedText()` - Copies selection via Cmd+C
  - `getFocusedAppName()` - Gets active app name

**Why AppleScript:**
- `robotjs` and `nut.js` have native compilation issues
- AppleScript is reliable and macOS-native
- Requires one-time Accessibility permission grant

### Configuration Storage

Uses `electron-store` for persistent settings:
```typescript
{
  apiKey: string,              // Gemini API key (encrypted in macOS Keychain)
  hotkey: string,              // Default: 'Fn' (maps to Cmd+Shift+Space)
  vadSensitivity: number,      // 0.02
  silenceDuration: number,     // 1500ms
  screenSharingEnabled: boolean, // true
  launchAtLogin: boolean       // false
}
```

## TypeScript Path Aliases

Defined in tsconfig.json:
```typescript
"@/*": ["src/renderer/*"]
"@main/*": ["src/main/*"]
"@shared/*": ["src/shared/*"]
```

## Build Configuration

- **Bundler**: Vite (for renderer) + electron-builder
- **Output**: `release/Voice Edit-{version}.dmg` (universal binary)
- **Entitlements**: `build/entitlements.mac.plist` (for hardened runtime)
- **Icon**: `resources/icon.icns`

## macOS Permissions Required

Voice Edit needs three permissions:

1. **Microphone** - Record voice commands
2. **Screen Recording** - Multimodal awareness (optional but recommended)
3. **Accessibility** - Simulate Cmd+V paste

Permissions are requested on first use. Permission handling in `src/main/permissions.ts`.

## Important Implementation Notes

### Hotkey Limitations
- Electron's `globalShortcut` doesn't support raw Fn key
- Default 'Fn' maps to `CommandOrControl+Shift+Space`
- Alternative: F13/F14/F15 keys (if keyboard supports)

### VAD Tuning
The Voice Activity Detector has been carefully tuned to avoid false triggers:
- **silenceThreshold**: 0.02 (increased from 0.01 to reduce ambient noise sensitivity)
- **silenceDuration**: 1500ms (1.5 seconds required to trigger processing)
- **minSpeechDuration**: 1500ms (filters out short ambient sounds)
- **minPeakEnergy**: 0.05 (requires strong audio peaks)

When adjusting VAD settings:
- Higher `silenceThreshold` = requires louder audio to count as speech
- Higher `silenceDuration` = more pause needed after speaking
- Higher `minSpeechDuration` = filters more ambient noise but may cut off quick commands
- Higher `minPeakEnergy` = requires stronger audio peaks to activate

### Gemini Response Handling
- Gemini returns JSON (may be wrapped in markdown code fences)
- Parser strips `\`\`\`json` fences before parsing
- Four action types: `edit`, `query`, `insert_styled`, `search`
- `query` actions use browser TTS instead of pasting

### Screen Capture
- Uses browser `getDisplayMedia()` API
- Requires Screen Recording permission
- Captures at 1 FPS to minimize bandwidth
- Frames encoded as JPEG base64 before streaming

## Testing Workflow

1. Run `npm run dev` - Opens window with DevTools
2. Grant permissions if prompted
3. Enter Gemini API key in Settings
4. Press ⌘+Shift+Space to test hotkey
5. Speak command, wait 1.5s silence
6. Check console for debug logs:
   - `[VoiceEdit]` - Core logic
   - `[GeminiLiveSDK]` - API communication
   - `[AudioRecorder]` - Audio capture
   - `[ClipboardManager]` - Paste operations
   - `[Main]` - Main process events

## Common Issues

### "Hotkey not working"
- Check no other app uses same shortcut
- Try alternative hotkey in Settings
- Restart app after changing hotkey

### "Can't paste edited text"
- Check Accessibility permission granted
- System Preferences → Security & Privacy → Privacy → Accessibility → Voice Edit ✓
- AppleScript errors logged to console

### "Screen sharing not starting"
- Check Screen Recording permission
- May need to restart app after granting permission
- Disable/re-enable in Settings

### "Commands not processing"
- Check API key valid
- Speak clearly and pause 1.5 seconds
- Enable screen sharing for better accuracy
- Check console for VAD events

## Key Files Reference

- **Main entry**: src/main/index.ts:141 (app.whenReady)
- **Voice logic**: src/renderer/composables/useVoiceEdit.ts
- **Gemini adapter**: src/renderer/services/geminiLiveSDKAdapter.ts
- **System instruction**: voice-edit-system-instruction.ts (AI behavior + response schema)
- **Audio capture**: src/renderer/lib/audio-recorder.ts:40 (start method)
- **VAD config**: src/renderer/lib/audio-recorder.ts:26-32
- **Paste simulation**: src/main/clipboard-manager.ts:52 (simulatePaste)
- **Hotkey setup**: src/main/hotkey-manager.ts:22 (setupHotkeyManager)
- **Build config**: vite.config.ts (unified Vite + Electron config)
- **Entitlements**: build/entitlements.mac.plist (macOS permissions)

## Recently Created Files

These files were created to complete the initial build:

- `voice-edit-system-instruction.ts` - AI system instruction and JSON schema
- `vite.config.ts` - Unified Vite configuration
- `tsconfig.node.json` - TypeScript config for build scripts
- `build/entitlements.mac.plist` - macOS entitlements
- `resources/README.md` - Icon creation instructions
- `resources/create-icons.sh` - Icon generation script
- `DEVELOPMENT_STATUS.md` - Comprehensive development checklist and status
