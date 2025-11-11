# DEBUGGING SESSION 1 - Dual-Mode Implementation

> **Date**: November 11, 2025
> **Issue**: Fn and Fn+Ctrl modes not working - no STT output, no command execution
> **Approach**: Systematic layer-by-layer debugging, NO GUESSWORK

---

## Debug Checklist (8 Layers)

- [x] **Layer 1**: Verify Fn key detection in main process
- [x] **Layer 2**: Verify IPC message sent to renderer
- [x] **Layer 3**: Verify renderer receives and routes mode
- [x] **Layer 4**: Verify audio recording starts
- [ ] **Layer 5**: Verify screen capture (multimodal only)
- [ ] **Layer 6**: Verify Gemini receives data
- [ ] **Layer 7**: Verify Gemini response received
- [ ] **Layer 8**: Verify paste execution

---

## Issues Found

### 🚨 **CRITICAL BUG #1: Screen Capture Always Started**

**Status**: ✅ **FIXED** (Commit: 166d820)

**Evidence from Logs**:
```
[Main] Fn PRESSED - starting STT mode          ← Main correctly detects Fn only
[Renderer] Starting stt_only_hold, screen=false ← Renderer gets correct flag
[Renderer] Starting screen capture...           ← ❌ BUG! Should NOT start
```

**Root Cause**:
- `startRecordingWithMode()` in `useVoiceEdit.ts` lines 196-208
- Comment said "CRITICAL FIX: Always start screen sharing"
- Code **IGNORED** the `config.enableScreenCapture` flag
- This was from old architecture that assumed screen should always be on

**Fix Applied**:
```typescript
// BEFORE (BROKEN):
console.log('[VoiceEdit] Starting screen capture')
await startScreenSharing(focusedAppName.value || undefined)

// AFTER (FIXED):
if (config.enableScreenCapture) {
  console.log('[VoiceEdit] 🎥 Starting screen capture (multimodal mode)')
  await startScreenSharing(focusedAppName.value || undefined)
} else {
  console.log('[VoiceEdit] 🎤 STT mode - NO screen capture (audio only)')
}
```

**Expected After Fix**:
- **Fn only** → Should log: "STT mode - NO screen capture (audio only)"
- **Fn+Ctrl** → Should log: "Starting screen capture (multimodal mode)"

---

### 🚨 **CRITICAL BUG #2: Gemini Returned Empty Result**

**Status**: ⚠️ **INVESTIGATING**

**Evidence from Logs**:
```
[Renderer] Gemini response: ```json
{
  "action": "edit",
  "result": "",
  "confidence": 0.95
}
```
[Main] Pasting text:  ...  ← Empty string pasted
```

**Possible Causes** (Need to investigate):
1. ❓ Audio not being captured from microphone
2. ❓ Audio not being streamed to Gemini
3. ❓ Gemini heard audio but couldn't transcribe (silence/background noise)
4. ❓ Context message missing or malformed
5. ❓ User spoke but audio didn't reach Gemini

**Evidence Needed**:
- [ ] Check if AudioRecorder starts successfully
- [ ] Check if audio chunks are being emitted
- [ ] Check if Gemini is receiving audio chunks (log count)
- [ ] Check what user said (timing - maybe released too quickly?)
- [ ] Check context message being sent

---

### ⚠️ **ISSUE #3: No Gemini Response on Second Command**

**Evidence from Logs**:
```
[Main] Fn+Ctrl PRESSED - starting multimodal mode
[Renderer] Starting stt_screen_hold, screen=true
[Renderer] ✅ Screen sharing ACTIVE
[Main] Fn RELEASED - stopping and processing
[Renderer] Context: "Focus text: """
[Renderer] Stopping screen sharing
[Main] Recording stopped
--- NO GEMINI RESPONSE LOGGED ---
```

**Possible Causes**:
1. ❓ Gemini connection dropped
2. ❓ isProcessing flag stuck (prevents processing)
3. ❓ turnComplete not fired
4. ❓ Timeout mechanism triggered
5. ❓ Error thrown but not logged

---

## Layer-by-Layer Analysis

### ✅ Layer 1: Main Process - Fn Key Detection

**Status**: **WORKING PERFECTLY**

**Evidence**:
```
[Main] RECORD MODE entered - starting Fn key monitoring
[Main] Fn PRESSED - starting STT mode            ← Fn detected
[Main] Fn RELEASED - stopping and processing
[Main] Fn+Ctrl PRESSED - starting multimodal mode ← Fn+Ctrl detected
[Main] Fn RELEASED - stopping and processing
```

**Conclusion**: Native IOKit key detection working correctly. Main process correctly distinguishes Fn vs Fn+Ctrl.

---

### ✅ Layer 2: IPC - Main to Renderer

**Status**: **WORKING** (implied by Layer 3)

**Evidence**: Renderer receives mode correctly (see Layer 3)

---

### ✅ Layer 3: Renderer - Mode Routing

**Status**: **WORKING** (after fix)

**Evidence**:
```
[Renderer] Starting stt_only_hold, screen=false   ← STT mode routed correctly
[Renderer] Starting stt_screen_hold, screen=true  ← Multimodal routed correctly
```

**Conclusion**: `onPttPressed` handler correctly routes to appropriate mode based on `data.mode` parameter.

---

### ❓ Layer 4: Audio Recording

**Status**: **NEEDS VERIFICATION**

**Evidence Needed**:
- AudioRecorder instantiation logs
- Audio chunk emission logs
- Audio data streaming logs

**Add Logging**:
```typescript
// In startAudioRecording()
console.log('[VoiceEdit] 🎤 Creating AudioRecorder (16kHz)')
audioRecorder = new AudioRecorder(16000)

audioRecorder.on('data', (base64Audio: string) => {
  console.log('[VoiceEdit] 🎵 Audio chunk received:', base64Audio.length, 'chars')
  // ... send to Gemini
})

console.log('[VoiceEdit] 🎤 Starting AudioRecorder...')
await audioRecorder.start()
console.log('[VoiceEdit] ✅ AudioRecorder active')
```

---

### ❓ Layer 5: Screen Capture (Multimodal Only)

**Status**: **FIXED, NEEDS RE-TEST**

**Before Fix**: Screen always started (even in STT mode)
**After Fix**: Screen only starts if `enableScreenCapture: true`

**Need to Verify**:
- [ ] Fn only → NO screen capture logs
- [ ] Fn+Ctrl → Screen capture logs present

---

### ❓ Layer 6: Gemini Receives Data

**Status**: **NEEDS VERIFICATION**

**Evidence Needed**:
- Count of audio chunks sent to Gemini
- Count of video frames sent (if multimodal)
- Context message content

**Add Logging**:
```typescript
// In audio chunk handler
let audioChunkCount = 0
audioRecorder.on('data', (base64Audio: string) => {
  audioChunkCount++
  console.log(`[VoiceEdit] 🎵 Sending audio chunk #${audioChunkCount} to Gemini`)
  geminiAdapter.sendRealtimeInput({ ... })
})

// In video frame handler
let frameCount = 0
videoFrameCapturer.on('frame', (frameData: string) => {
  frameCount++
  console.log(`[VoiceEdit] 📷 Sending video frame #${frameCount} to Gemini`)
  geminiAdapter.sendRealtimeInput({ ... })
})
```

---

### ❓ Layer 7: Gemini Response

**Status**: **PARTIALLY WORKING**

**Evidence**:
- First command: Gemini responded (but with empty result)
- Second command: No response received at all

**Need to Verify**:
- [ ] Is turnComplete being sent?
- [ ] Is context message properly formatted?
- [ ] Is timeout mechanism working?
- [ ] Are there errors in Gemini response handler?

---

### ❓ Layer 8: Paste Execution

**Status**: **WORKING** (but with empty content)

**Evidence**:
```
[Main] Pasting text:  ...
[ClipboardManager] Copied to clipboard:  ...
[ClipboardManager] Simulating Cmd+V paste...
[ClipboardManager] ✅ Paste successful
```

**Conclusion**: Paste mechanism works, but content is empty because Gemini result was empty.

---

## Next Steps - Systematic Debugging

### Step 1: Add Comprehensive Audio Logging ✅ **COMPLETED**

**File**: `src/renderer/composables/useVoiceEdit.ts`
**Commit**: `81f9241`

Added detailed logs in `startAudioRecording()`:
```typescript
console.log('[VoiceEdit] 🎤 === AUDIO RECORDING START ===')
console.log('[VoiceEdit] Creating AudioRecorder (16kHz)')
audioRecorder = new AudioRecorder(16000)

let audioChunkCount = 0
audioRecorder.on('data', (base64Audio: string) => {
  audioChunkCount++
  console.log(`[VoiceEdit] 🎵 Audio chunk #${audioChunkCount}: ${base64Audio.length} chars`)
  if (geminiAdapter && isRecording.value) {
    console.log(`[VoiceEdit] 📤 Sending chunk #${audioChunkCount} to Gemini`)
    geminiAdapter.sendRealtimeInput({ ... })
  } else {
    console.log('[VoiceEdit] ⚠️ NOT sending - adapter:', !!geminiAdapter, 'recording:', isRecording.value)
  }
})

console.log('[VoiceEdit] 🎤 Starting microphone capture...')
await audioRecorder.start()
console.log('[VoiceEdit] ✅ Microphone active')
```

**Changes Made**:
1. ✅ Added audio recorder instantiation logging
2. ✅ Added per-chunk logging with count and size
3. ✅ Added Gemini streaming confirmation logs
4. ✅ Added microphone capture start/active logs
5. ✅ Enhanced manualTriggerProcessing with state logging
6. ✅ Added turnComplete send confirmation

### Step 2: Test Both Modes with Enhanced Logging ⏳ **NEXT**

**Expected Logs**:

**Fn only (STT)**:
```
[VoiceEdit] 📤 Recording config:
  - Mode: stt_only_hold
  - Screen capture enabled: false
[VoiceEdit] 🎤 STT mode - NO screen capture (audio only)
[VoiceEdit] 🎤 === AUDIO RECORDING START ===
```

**Fn+Ctrl (Multimodal)**:
```
[VoiceEdit] 📤 Recording config:
  - Mode: stt_screen_hold
  - Screen capture enabled: true
[VoiceEdit] 🎥 Starting screen capture (multimodal mode)
[VoiceEdit] ✅ Screen capture active
[VoiceEdit] 🎤 === AUDIO RECORDING START ===
```

### Step 3: Re-test Both Modes 📋

**Test 1: Fn only (STT)**
1. Press Ctrl+Space (enter RECORD_MODE)
2. Press Fn
3. **Wait 1 second** for audio to start
4. Speak clearly: "hello world"
5. **Wait 1 second** to ensure audio captured
6. Release Fn
7. **Check logs**

**Test 2: Fn+Ctrl (Multimodal)**
1. Still in RECORD_MODE
2. Press Fn+Ctrl
3. **Wait 1 second** for screen + audio
4. Speak clearly: "test multimodal"
5. **Wait 1 second**
6. Release Fn+Ctrl
7. **Check logs**

### Step 4: Compare with WORKING_CODE.md 📋

If still not working, compare implementation with working commit `6484dd9`:
- Audio recording initialization
- Gemini adapter setup
- Context message format
- TurnComplete timing

---

## Summary

### ✅ Fixed Issues
1. Screen capture now respects `enableScreenCapture` flag

### 🔍 Still Investigating
1. Why Gemini returned empty result (audio not captured/sent?)
2. Why second command got no response at all
3. Audio streaming verification needed

### 📋 Action Items
1. Add comprehensive audio logging
2. Re-test Fn only mode (verify NO screen logs)
3. Re-test Fn+Ctrl mode (verify screen logs present)
4. Debug why Gemini response was empty
5. Debug why second command got no response

---

**Current Status**:
- ✅ Screen capture fix applied (commit 166d820)
- ✅ Comprehensive audio logging added (commit 81f9241)
- ✅ App running with hot-reload enabled
- 📋 **READY FOR TESTING** - User to test Fn and Fn+Ctrl modes with new logs

**Next Action**: User should test both modes while monitoring console output:
1. Test Fn only → Expect audio chunk logs, NO screen logs
2. Test Fn+Ctrl → Expect audio chunk logs AND screen logs
3. Review logs to identify why Gemini returned empty result

---

*End of DEBUGGING_SESSION_1.md*
