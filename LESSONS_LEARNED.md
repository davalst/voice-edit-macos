# Lessons Learned: Press-and-Hold Implementation Attempt

**Date**: 2025-11-10
**Status**: FAILED - Rolled back to working state
**Duration**: ~4 hours of development

## Summary

We attempted to implement press-and-hold functionality (Fn key for STT-only, Fn+Ctrl for STT+Screen) inspired by Wispr Flow. The implementation completely broke the app, causing:

1. Arrow keys triggering recording
2. Infinite paste loops with fragmented text
3. Screen recording not stopping
4. `<DICTATION_MODE>` text appearing in outputs
5. Complete loss of functionality

## What We Were Trying to Build

### Goal
Add native key monitoring to detect Fn and Fn+Ctrl key combinations for press-and-hold voice recording, with two modes:
- **Fn only**: STT-only mode (no screen capture)
- **Fn+Ctrl**: STT + screen capture mode

### Inspiration
Based on Wispr Flow's elegant press-and-hold UX where holding Fn activates voice input.

## What We Actually Built (And What Worked)

### ✅ Successes

#### 1. Overlay System (WORKING - Keep This)
**Files**:
- `src/renderer/Overlay.vue` - Beautiful 3-state overlay component
- `src/main/overlay-manager.ts` - Overlay window management

**Features**:
- **Idle state**: 5 pulsing dots
- **Recording state**: Mode indicator (🎤 or 📹) + waveform + stop button
- **Result state**: Shows edited text briefly before returning to idle

**Why It Worked**: Clean separation of concerns, simple IPC communication, proper state management.

**How to Use This Code**:
```typescript
// In main process
import { OverlayManager } from './overlay-manager'

const overlayManager = new OverlayManager()
overlayManager.create()

// Show overlay with mode
overlayManager.show('stt_only_hold', false) // false = no screen capture

// Hide overlay
overlayManager.hide()

// Show result
overlayManager.showResult('Hello world')
```

#### 2. Native IOKit Key Monitoring (PARTIALLY WORKING)
**Files**:
- `src/native/key-monitor.mm` - C++ native module using IOKit
- `src/main/key-monitor-native.ts` - Node.js wrapper

**What Worked**: Successfully detected Fn and Ctrl key state changes via CGEvent flags.

**What Broke**: Fired on EVERY keypress instead of just Fn/Ctrl state changes, causing arrow keys to trigger recording.

#### 3. State Machine Pattern (GOOD DESIGN)
**Files**:
- `src/main/hotkey-state-machine.ts` - FSM for recording modes
- `src/main/gesture-detector.ts` - Double-tap detection

**What Worked**: Clean state transitions, proper mode tracking.

**What Broke**: Integration with audio recording lifecycle was too complex.

## What Completely Failed

### ❌ Failure 1: Native Key Detection Firing on All Keys

**The Bug**:
```typescript
// key-monitor.mm lines 42-71
if (fnChanged || ctrlChanged) {
  // Fire callback
}
```

**What Should Have Happened**: Callback only fires when Fn or Ctrl state changes.

**What Actually Happened**: Callback fired on EVERY keypress (arrows, letters, etc.), even when Fn/Ctrl state didn't change.

**Root Cause**: Unknown - possibly macOS event tap behavior, or flag changes on every key event.

**Lesson**: Native key monitoring needs extensive testing in isolation before integration. Should have created a standalone test app first.

### ❌ Failure 2: Dual turnComplete Calls

**The Bug**:
```typescript
// TWO places sending turnComplete:

// 1. VAD silence detection (useVoiceEdit.ts:267)
audioRecorder.on('silence', async () => {
  await geminiAdapter.sendTurnComplete()
})

// 2. Press-and-hold key release (useVoiceEdit.ts:329)
async function stopRecording() {
  await geminiAdapter.sendTurnComplete()
}
```

**What Happened**: When user released Fn+Ctrl, BOTH handlers fired, sending duplicate turnComplete signals to Gemini.

**Result**: Infinite paste loop with fragmented text like "This text. This text. This text."

**Root Cause**: Didn't properly distinguish between toggle mode (VAD-based) and press-and-hold mode (key-release-based).

**Lesson**: When adding new code paths, MUST disable old code paths that serve the same purpose. Can't have both VAD and manual turnComplete active simultaneously.

### ❌ Failure 3: Context Timing Issues

**The Bug**:
We changed from:
```typescript
// ORIGINAL (working)
function startRecording() {
  startAudioRecording() // Start recording
  // VAD detects silence, THEN sends context + turnComplete
}
```

To:
```typescript
// NEW (broken)
function startAudioRecording() {
  // Send context BEFORE recording starts
  geminiAdapter.sendClientContent({ turns: [{ text: context }] })

  // Start recording
  audioRecorder.start()
}

function stopRecording() {
  // Send turnComplete when key released
  geminiAdapter.sendTurnComplete()
}
```

**What Happened**: Context sent before audio even started streaming, timing mismatch with Gemini API.

**Root Cause**: Misunderstood Gemini Live API flow. Based on Ebben POC pattern but didn't account for press-and-hold vs VAD differences.

**Lesson**: Don't change working API call patterns without thorough testing. The original VAD-based flow worked - should have extended it, not replaced it.

### ❌ Failure 4: `<DICTATION_MODE>` in System Instruction

**The Bug**:
```typescript
// voice-edit-system-instruction.ts
export const VOICE_EDIT_SYSTEM_INSTRUCTION = `
### MODE 2: When you receive <DICTATION_MODE>
The user wants exact speech-to-text transcription.
`
```

**What Happened**: Gemini saw `<DICTATION_MODE>` in the instruction and echoed it back in responses.

**Root Cause**: Including XML-like tags in system instructions without actually sending them as structured input.

**Lesson**: System instructions should describe behavior, not reference tags that aren't actually used. If using special modes, implement them in the actual input format, not just the instruction.

### ❌ Failure 5: Screen Recording Not Stopping

**The Bug**: Screen recording continued even after app was force-quit.

**Root Cause**: Media streams not properly cleaned up on app shutdown.

**Missing Code**:
```typescript
// Should have had in app.on('will-quit'):
if (screenStream) {
  screenStream.getTracks().forEach(track => track.stop())
  screenStream = null
}
```

**Lesson**: Always implement cleanup handlers BEFORE implementing the feature. Media APIs require explicit cleanup.

## Critical Mistakes in Development Process

### 1. Too Many Changes at Once
We changed:
- Audio recording initialization
- Context sending timing
- turnComplete trigger logic
- System instruction format
- Native key monitoring integration

**Should Have**: Changed ONE thing at a time, tested, committed, then moved to next change.

### 2. No Incremental Testing
We didn't test after each change. Built everything, then tested at the end.

**Should Have**:
1. Test native key monitor in isolation (separate test app)
2. Add overlay, test overlay only
3. Add state machine, test state transitions only
4. THEN integrate with audio recording

### 3. Didn't Commit Working States
No commits between working state and broken state means no safe rollback points.

**Should Have**: Commit after every successful feature addition, even if incomplete.

### 4. Ignored Warning Signs
When we saw arrow keys triggering the app, should have STOPPED and debugged immediately.

Instead, we:
- Disabled native monitoring
- Tried to fix other issues
- Continued layering changes

**Should Have**: Fixed the critical bug first, then continued.

### 5. Changed Working Code Without Understanding It
The original VAD-based flow was working. We changed it based on the Ebben POC pattern without fully understanding the differences.

**Should Have**:
1. Documented how the current flow works
2. Identified exactly what needed to change
3. Made minimal changes to existing working code

## What We Should Have Done Instead

### Proper Incremental Approach

#### Phase 1: Native Key Monitor (Week 1)
1. Create standalone test app for key monitor
2. Test Fn detection thoroughly
3. Ensure ONLY Fn/Ctrl changes fire callbacks
4. Add extensive logging
5. Test on different keyboards
6. COMMIT

#### Phase 2: Overlay Integration (Week 1)
1. Create overlay in isolation
2. Test showing/hiding with IPC
3. Test all 3 states
4. COMMIT

#### Phase 3: State Machine (Week 2)
1. Implement state machine WITHOUT audio integration
2. Test state transitions with keyboard only
3. Log all transitions
4. COMMIT

#### Phase 4: Audio Integration (Week 2)
1. Add ONLY press-and-hold mode to EXISTING code
2. Keep VAD mode working
3. Use feature flag to toggle between modes
4. Test both modes independently
5. COMMIT

#### Phase 5: Cleanup (Week 3)
1. Remove old code only after new code proven stable
2. Add cleanup handlers
3. Final testing

### Better Testing Strategy

```typescript
// Should have created integration tests
describe('Press and Hold Recording', () => {
  it('starts recording when Fn pressed', () => {
    pressKey('Fn')
    expect(isRecording).toBe(true)
  })

  it('stops recording when Fn released', () => {
    pressKey('Fn')
    releaseKey('Fn')
    expect(isRecording).toBe(false)
  })

  it('does not trigger on arrow keys', () => {
    pressKey('ArrowLeft')
    expect(isRecording).toBe(false)
  })
})
```

## Code Worth Salvaging

### 1. Overlay Component (✅ KEEP)
**File**: `src/renderer/Overlay.vue`

Beautiful, clean implementation. Can be reused for future features.

### 2. Overlay Manager (✅ KEEP)
**File**: `src/main/overlay-manager.ts`

Solid window management, good IPC patterns.

### 3. State Machine Logic (⚠️ REVIEW & ADAPT)
**File**: `src/main/hotkey-state-machine.ts`

Good state management patterns, but needs better integration strategy.

### 4. Native Key Monitor (❌ NEEDS MAJOR FIX)
**File**: `src/native/key-monitor.mm`

Core idea is sound, but implementation has critical bugs. Needs complete rewrite with proper filtering.

## Recommendations for Next Attempt

### 1. Start Simpler
Use Electron's global shortcut for Fn alternatives (F13/F14/F15) instead of native key monitoring.

```typescript
// Much simpler approach
globalShortcut.register('F13', () => {
  // Start STT-only recording
})

globalShortcut.register('F14', () => {
  // Start STT+Screen recording
})
```

### 2. Keep VAD Flow
Don't change the working VAD-based turnComplete timing. It works - build on it, don't replace it.

### 3. Add Feature Flags
```typescript
const ENABLE_PRESS_AND_HOLD = false // Toggle for testing

if (ENABLE_PRESS_AND_HOLD) {
  // New press-and-hold code
} else {
  // Original VAD code
}
```

### 4. Create Test Harness
Build a simple Electron test app that ONLY tests key monitoring, nothing else.

### 5. One Change Per Commit
Every commit should:
- Change ONE thing
- Include tests
- Pass existing tests
- Have working app

## Conclusion

We over-engineered a solution and changed too many things simultaneously without proper testing. The overlay system is beautiful and should be kept, but the press-and-hold functionality needs a complete rethink with a much more gradual, tested approach.

**Key Takeaway**: When you have working code, treat it like precious cargo. Make tiny changes, test each one, and never move forward if something breaks.

---

**Next Steps**:
1. Revert to last known working commit (this morning)
2. Keep overlay code in a separate branch
3. If attempting press-and-hold again, follow the phased approach above
4. Consider using F-keys instead of native Fn detection
