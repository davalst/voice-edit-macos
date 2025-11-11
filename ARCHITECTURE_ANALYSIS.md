# ARCHITECTURE ANALYSIS - Fn-Hold vs VAD Auto-Send

## Executive Summary

**Current Issue**: After ONE successful voice command, the app stops responding to subsequent commands. Gemini never sends responses after the first interaction.

**Root Cause Analysis Needed**: Compare current Fn-hold push-to-talk implementation against working VAD auto-send from commit `6484dd9` / `fe97b91`.

---

## Architecture Comparison

### WORKING CODE (`6484dd9`) - VAD Auto-Send Mode

**Trigger Flow**:
```
Ctrl+Space Press → START Recording + Screen Capture
                ↓
User Speaks → Audio streams to Gemini
                ↓
1.5s Silence → VAD auto-triggers sendTurnComplete()
                ↓
Gemini processes → Returns JSON response
                ↓
Response pasted → isProcessing reset after 100ms
                ↓
STILL RECORDING → Ready for next command
                ↓
(repeat continuous conversation)
                ↓
Ctrl+Space Press → STOP Recording + Screen Capture
```

**Key Characteristics**:
- **One hotkey press** enters "continuous conversation" mode
- **VAD auto-detects** when user finishes speaking (1.5s silence)
- **No manual trigger** needed for each command
- Recording stays **ACTIVE** between commands
- **Second hotkey press** exits mode

---

### CURRENT CODE (HEAD) - Fn-Hold Push-to-Talk Mode

**Intended Flow**:
```
Ctrl+Space Press → ENTER Record Mode (but NOT recording yet)
                ↓
Fn Key Press+Hold → START Recording + Screen Capture
                ↓
User Speaks → Audio streams to Gemini
                ↓
Fn Key Release → Manual trigger sendTurnComplete()
                ↓
Gemini processes → Returns JSON response
                ↓
Response pasted → RETURN to Record Mode
                ↓
(Fn available for next command)
                ↓
Ctrl+Space Press → EXIT Record Mode
```

**Key Characteristics**:
- **Ctrl+Space** enters "RECORD MODE" (idle, waiting for Fn)
- **Fn press+hold** activates mic/screen capture
- **Fn release** manually triggers processing (replaces VAD)
- Recording stops after each command
- **Fn available again** for next command
- **Ctrl+Space again** exits RECORD MODE

---

## Critical Architectural Differences

| Aspect | VAD Auto-Send (Working) | Fn-Hold Push-to-Talk (Current) |
|--------|-------------------------|--------------------------------|
| **Recording Lifecycle** | Start once, stay active until Ctrl+Space | Start/stop per command (Fn press/release) |
| **Processing Trigger** | VAD auto-detects silence | Manual Fn release |
| **Continuous Flow** | Always recording between commands | Must press Fn for each command |
| **Screen Capture** | Start once with recording | Start/stop with each Fn press/release |
| **isProcessing Flag** | Set during response, cleared after 100ms | Set during response, cleared when? |
| **State Machine** | Simple: IDLE ↔ RECORDING | Complex: IDLE → RECORD_MODE → RECORDING → RECORD_MODE |

---

## State Machine Analysis

### Working VAD Mode States

```
┌──────┐  Ctrl+Space   ┌───────────┐
│ IDLE │───────────────▶│ RECORDING │◀──┐
└──────┘                └─────┬─────┘   │
   ▲                          │         │
   │       Ctrl+Space         │   Continuous
   └──────────────────────────┘   (no state change)
```

**States**: 2 (IDLE, RECORDING)
**Transitions**: Clean and simple

---

### Current Fn-Hold Mode States

```
┌──────┐  Ctrl+Space   ┌─────────────┐
│ IDLE │───────────────▶│ RECORD_MODE │
└──────┘                └──────┬──────┘
                               │ Fn Press
                               ▼
                        ┌────────────┐
                        │ RECORDING  │
                        │ (Fn held)  │
                        └──────┬─────┘
                               │ Fn Release
                               ▼
                        ┌─────────────┐
                        │ PROCESSING  │
                        └──────┬──────┘
                               │ Response done
                               ▼
                        ┌─────────────┐
                        │ RECORD_MODE │◀──┐
                        │ (waiting Fn)│   │
                        └──────┬──────┘   │
                               │          │
                               │    Next command
                               └──────────┘
```

**States**: 4 (IDLE, RECORD_MODE, RECORDING, PROCESSING)
**Transitions**: More complex, more failure points

---

## Log Analysis Findings

### First Command (SUCCESSFUL) - 12:37:48 PM

```
[12:37:48] Fn released - manually triggering processing
[12:37:48] Sending context: Focus text: ""
[12:37:48] turnComplete sent
[12:37:48] Context sent, waiting for Gemini response
[12:37:48] Gemini response: {"action":"edit","result":"","confidence":0.95}
[12:37:48] ✅ Pasted:
[12:37:49] ✅ Ready for next command
```

**Issues**:
1. **Empty result** - Gemini returned `"result": ""`
2. **Why empty?** - No selected text, unclear what user said
3. **Paste succeeded** - But pasted nothing, wiping selection

---

### Second Command (FAILED) - 12:38:00 PM

```
[12:38:00] Fn released - manually triggering processing
[12:38:00] Sending context: Focus text: ""
[12:38:00] turnComplete sent
[12:38:00] Context sent, waiting for Gemini response
[12:38:00] Screen sharing stopped
[12:38:00] Recording stopped, mode reset to IDLE
... [NO GEMINI RESPONSE EVER RECEIVED]
```

**Critical Failure**:
1. `turnComplete` sent to Gemini ✅
2. **Gemini never responded** ❌
3. No `modelTurn` event received
4. No `turnComplete` event received
5. `isProcessing` flag **STUCK TRUE**
6. App cannot accept new commands

---

### Third+ Commands (BLOCKED)

```
[12:38:03] Fn key event, should record: true
[12:38:03] Starting recording with mode: stt_screen_hold
... audio recording starts ...
[12:38:14] Fn released - processing...
[12:38:14] Already processing - ignoring manual trigger  ← BLOCKED!
```

**Blocked by stuck `isProcessing` flag**

---

## Root Causes Identified

### 1. **Gemini Not Responding After First Command**

**Symptom**: After first `turnComplete`, Gemini stops sending responses

**Possible Causes**:
- Connection state corrupted after first response
- Missing context that Gemini needs for second interaction
- Gemini session not properly reset between commands
- Screen capture stopped too early (before Gemini finished processing)

**Evidence from logs**:
- First command: Gemini responds immediately
- Second command: Gemini never sends `modelTurn` or `turnComplete`
- Connection appears open (no error/close events)

---

### 2. **isProcessing Flag Gets Stuck**

**Symptom**: `isProcessing` never gets reset to `false` after failed response

**Code Location**: `useVoiceEdit.ts:117-120`

```typescript
setTimeout(() => {
  isProcessing.value = false
  console.log('[VoiceEdit] ✅ Ready for next command')
}, 500)
```

**Problem**: This only runs inside `turnComplete` event handler. If Gemini never sends `turnComplete`, the timeout never runs, and `isProcessing` stays `true` forever.

**Result**: All subsequent commands blocked by line 271 guard:
```typescript
if (isProcessing.value) {
  console.log('[VoiceEdit] Already processing - ignoring manual trigger')
  return
}
```

---

### 3. **Screen Capture Lifecycle Mismatch**

**Symptom**: Screen sharing stops BEFORE Gemini finishes processing

**Log Evidence**:
```
[12:38:00] Context sent, waiting for Gemini response
[12:38:00] Stopping screen sharing (recording ended)  ← TOO EARLY!
[12:38:00] Recording stopped, mode reset to IDLE
```

**Analysis**:
- In working code, screen capture stays active during entire recording session
- In current code, screen capture stops when Fn is released
- But Gemini might still be processing when screen stops
- This could disrupt Gemini's ability to respond

---

### 4. **Mode State Confusion**

**Symptom**: After Fn release, mode resets to IDLE instead of staying in RECORD_MODE

**Log Evidence**:
```
[12:38:00] Recording stopped, mode reset to IDLE  ← WRONG!
```

**Expected**: Should reset to `RECORD_MODE` (waiting for next Fn press)
**Actual**: Resets to `IDLE`

**Impact**: User must press Ctrl+Space again to re-enter RECORD_MODE

---

## Broken Patterns from Working Code

### Pattern 1: **Continuous Recording** ❌ BROKEN

**Working Code**:
```typescript
geminiAdapter.on('turnComplete', async () => {
  // CRITICAL: Don't stop recording!
  // stopRecording() // ← REMOVED

  await handleGeminiResponse(outputText, audioChunks)
  outputText = ''
  audioChunks = []

  setTimeout(() => {
    isProcessing.value = false
  }, 100)
})
```

**Current Code**:
```typescript
// Fn release triggers:
stopRecording()  // ← Stops everything!
currentMode.value = RecordingMode.IDLE  // ← Wrong state!
```

**Why Broken**: Recording stops immediately on Fn release, preventing continuous conversation

---

### Pattern 2: **Screen Capture Tied to Recording Session** ❌ BROKEN

**Working Code**:
```typescript
// Screen starts when recording starts
await startScreenSharing(focusedAppName.value)

// Screen stops when recording stops (Ctrl+Space second press)
function stopRecording() {
  if (isScreenSharing.value) {
    stopScreenSharing()
  }
}
```

**Current Code**:
```typescript
// Screen stops on EVERY Fn release
function stopRecording() {
  if (isScreenSharing.value) {
    console.log('[VoiceEdit] Stopping screen sharing (recording ended)')
    stopScreenSharing()  // ← Stops per-command, not per-session
  }
}
```

**Why Broken**: Screen capture lifecycle should match RECORD_MODE session, not individual Fn press/release cycles

---

### Pattern 3: **Delayed isProcessing Reset** ⚠️ PARTIALLY BROKEN

**Working Code**:
```typescript
setTimeout(() => {
  isProcessing.value = false
  console.log('[VoiceEdit] ✅ Ready for next command')
}, 100)
```

**Current Code**:
- Same timeout exists
- But only runs if `turnComplete` event fires
- **If Gemini doesn't respond, timeout never runs**
- Need fallback timeout mechanism

**Why Broken**: No recovery if Gemini fails to respond

---

## Critical Questions to Answer

### Q1: Why does Gemini stop responding after the first command?

**Hypothesis A**: Connection state gets corrupted
**Test**: Check if `geminiAdapter.isConnected` is still `true` after first response

**Hypothesis B**: Screen capture stopping breaks Gemini's processing
**Test**: Keep screen capture active across multiple commands

**Hypothesis C**: Missing context between commands
**Test**: Log what context is sent to Gemini for second command

---

### Q2: What should the state machine look like for Fn-hold mode?

**Option A**: Keep simple 2-state model, use Fn as manual VAD trigger
```
IDLE ──Ctrl+Space──▶ RECORD_MODE ◀──┐
                     (recording active,│
                      waiting for Fn)  │
                                       │
                      Fn = trigger     │
                      (stays in mode)──┘
```

**Option B**: Add explicit PROCESSING state with timeout recovery
```
IDLE ──▶ RECORD_MODE ──▶ RECORDING ──▶ PROCESSING ──▶ RECORD_MODE
                              ▲                            │
                              └────────────────────────────┘
```

---

### Q3: When should screen capture start/stop in Fn-hold mode?

**Option A**: Per-session (like working code)
- Start: When entering RECORD_MODE (Ctrl+Space)
- Stop: When exiting RECORD_MODE (Ctrl+Space again)
- Benefit: Gemini always has visual context
- Cost: Screen captured even when not speaking

**Option B**: Per-command (current)
- Start: When Fn pressed
- Stop: When Fn released
- Benefit: Minimal screen capture time
- Cost: May break Gemini's processing pipeline

**Recommendation**: Option A (per-session) for reliability

---

## Proposed Fixes

### Fix 1: Add Gemini Response Timeout

**Location**: `useVoiceEdit.ts` - after `sendTurnComplete()`

```typescript
// Set timeout for Gemini response
const GEMINI_RESPONSE_TIMEOUT = 10000 // 10 seconds
let responseTimeout: NodeJS.Timeout | null = null

// When sending turnComplete
responseTimeout = setTimeout(() => {
  if (isProcessing.value) {
    console.error('[VoiceEdit] ⏰ Gemini response timeout - resetting')
    isProcessing.value = false
    // Maybe show error to user?
  }
}, GEMINI_RESPONSE_TIMEOUT)

// In turnComplete handler
geminiAdapter.on('turnComplete', async () => {
  if (responseTimeout) {
    clearTimeout(responseTimeout)
    responseTimeout = null
  }
  // ... rest of handler
})
```

---

### Fix 2: Keep Screen Capture Active During RECORD_MODE

**Location**: `useVoiceEdit.ts:316-344`

```typescript
function stopRecording() {
  // Stop audio
  if (audioRecorder) {
    audioRecorder.stop()
    audioRecorder = null
  }

  isRecording.value = false

  // CRITICAL FIX: Only stop screen if exiting RECORD_MODE entirely
  // Check if we're going back to RECORD_MODE or IDLE
  if (currentMode.value === RecordingMode.IDLE) {
    // Exiting RECORD_MODE entirely (Ctrl+Space pressed)
    if (isScreenSharing.value) {
      console.log('[VoiceEdit] Stopping screen sharing (exiting RECORD_MODE)')
      stopScreenSharing()
    }
  } else {
    // Staying in RECORD_MODE (Fn released, waiting for next Fn press)
    console.log('[VoiceEdit] Keeping screen active (still in RECORD_MODE)')
  }
}
```

---

### Fix 3: Correct State Transitions for Fn-Hold

**Location**: `useVoiceEdit.ts` - Fn release handler

```typescript
// Fn release handler
async function handleManualTrigger() {
  if (!isRecording.value) {
    console.log('[VoiceEdit] Not recording, ignoring manual trigger')
    return
  }

  if (isProcessing.value) {
    console.log('[VoiceEdit] Already processing - ignoring manual trigger')
    return
  }

  isProcessing.value = true
  console.log('[VoiceEdit] 🎯 Fn released - manually triggering processing')

  try {
    // Build context
    const contextMessage = `Focus text: "${selectedText.value}"`

    // Send to Gemini
    geminiAdapter.sendClientContent({
      turns: [{ text: contextMessage }],
      turnComplete: false,
    })

    const sent = await geminiAdapter.sendTurnComplete()
    if (sent) {
      console.log('[VoiceEdit] ✅ Context sent, waiting for Gemini response')
    }

    // Set response timeout
    responseTimeout = setTimeout(() => {
      if (isProcessing.value) {
        console.error('[VoiceEdit] ⏰ Gemini response timeout')
        isProcessing.value = false
      }
    }, 10000)

  } catch (error) {
    console.error('[VoiceEdit] Error sending context:', error)
    isProcessing.value = false
  }

  // Stop audio recording (but keep screen if in RECORD_MODE)
  if (audioRecorder) {
    audioRecorder.stop()
    audioRecorder = null
  }

  isRecording.value = false

  // CRITICAL: Return to RECORD_MODE, not IDLE
  const wasInRecordMode = inRecordMode.value
  if (wasInRecordMode) {
    console.log('[VoiceEdit] Returning to RECORD_MODE (ready for next Fn press)')
    // Stay in RECORD_MODE
  }
}
```

---

### Fix 4: Debug Logging for Gemini Connection State

**Location**: `geminiLiveSDKAdapter.ts` and `useVoiceEdit.ts`

Add comprehensive logging at every state transition:

```typescript
// Before sending turnComplete
console.log('[VoiceEdit] 📊 STATE CHECKPOINT:')
console.log('  - isRecording:', isRecording.value)
console.log('  - isProcessing:', isProcessing.value)
console.log('  - isConnected:', isConnected.value)
console.log('  - isScreenSharing:', isScreenSharing.value)
console.log('  - currentMode:', currentMode.value)
console.log('  - geminiAdapter connected:', geminiAdapter?.isConnected)

// After each Gemini event
geminiAdapter.on('modelTurn', (parts) => {
  console.log('[VoiceEdit] 📥 GEMINI modelTurn:', parts.length, 'parts')
  console.log('[VoiceEdit] 📊 isProcessing:', isProcessing.value)
})

geminiAdapter.on('turnComplete', () => {
  console.log('[VoiceEdit] ✅ GEMINI turnComplete')
  console.log('[VoiceEdit] 📊 STATE BEFORE RESET:')
  console.log('  - isProcessing:', isProcessing.value)
  console.log('  - outputText length:', outputText.length)
})
```

---

## Testing Plan

### Phase 1: Single Command Test

**Goal**: Verify basic Fn-hold flow works for ONE command

**Steps**:
1. Build app with Fix 1 (timeout) and Fix 4 (logging)
2. Start app, press Ctrl+Space (enter RECORD_MODE)
3. Press+hold Fn, speak "hello world"
4. Release Fn
5. Observe logs for Gemini response
6. Verify text pasted

**Success Criteria**:
- Gemini responds within 10 seconds
- Response is pasted correctly
- `isProcessing` reset to `false`
- App returns to RECORD_MODE (not IDLE)

---

### Phase 2: Multiple Commands Test

**Goal**: Verify continuous conversation works with Fn-hold

**Steps**:
1. Enter RECORD_MODE (Ctrl+Space)
2. Press+hold Fn, speak "hello world", release
3. Wait for paste
4. Press+hold Fn again, speak "translate to French", release
5. Wait for paste
6. Repeat 2-3 more times

**Success Criteria**:
- All commands process successfully
- Gemini responds to each command
- No stuck `isProcessing` flags
- No need to press Ctrl+Space between commands
- Screen capture stays active throughout session

---

### Phase 3: Error Recovery Test

**Goal**: Verify timeout recovery works

**Steps**:
1. Enter RECORD_MODE
2. Press+hold Fn, speak gibberish/silence, release
3. Wait 10 seconds
4. Verify timeout logs appear
5. Try another command (should work)

**Success Criteria**:
- Timeout triggers after 10 seconds
- `isProcessing` flag reset
- Next command accepted normally

---

### Phase 4: State Transition Test

**Goal**: Verify correct state machine behavior

**Steps**:
1. Start in IDLE
2. Press Ctrl+Space → verify RECORD_MODE
3. Press Fn → verify RECORDING
4. Release Fn → verify back to RECORD_MODE (NOT IDLE)
5. Press Ctrl+Space → verify IDLE
6. Verify screen capture started/stopped correctly

**Success Criteria**:
- All state transitions logged correctly
- Screen capture lifecycle matches expectations
- Mode state correct after each transition

---

## Next Steps

1. ✅ **Read WORKING_CODE.md** - Understand working architecture
2. ✅ **Analyze current logs** - Identify failure points
3. ⏳ **Implement Fix 1** - Gemini response timeout
4. ⏳ **Implement Fix 2** - Screen capture lifecycle
5. ⏳ **Implement Fix 3** - State transition corrections
6. ⏳ **Implement Fix 4** - Enhanced debug logging
7. ⏳ **Test Phase 1** - Single command
8. ⏳ **Test Phase 2** - Multiple commands
9. ⏳ **Test Phase 3** - Error recovery
10. ⏳ **Test Phase 4** - State transitions
11. ⏳ **Compare with fe97b91** - Ensure no broken patterns
12. ⏳ **Document findings** - Update CLAUDE.md

---

## Critical Patterns Checklist

Before declaring fixes complete, verify these patterns from working code:

- [ ] Pre-capture selected text BEFORE focus changes
- [ ] Gemini receives both audio stream + text context
- [ ] Screen capture lifecycle matches session (not per-command)
- [ ] `isProcessing` flag has timeout recovery
- [ ] Response handler resets state correctly
- [ ] Paste mechanism uses clipboard + AppleScript Cmd+V
- [ ] State transitions logged at every step
- [ ] Error cases handled gracefully

---

*End of ARCHITECTURE_ANALYSIS.md*
