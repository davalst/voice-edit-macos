# DEVELOPMENT TODO - Dual-Mode Implementation & Testing

> **Status**: Ready for implementation
> **Estimated Time**: 3-4 hours (implementation + testing)
> **Commit**: a34d039 (architecture docs) → Updated with native Fn implementation
> **Native Key Detection**: Using existing IOKit module (NO native module changes needed!)

---

## CRITICAL: Native Fn Key Detection

**WE ALREADY HAVE Fn AND Fn+Ctrl DETECTION WORKING!** ✅

The native module `src/native/key-monitor.mm` already:
- ✅ Detects Fn via `kCGEventFlagMaskSecondaryFn`
- ✅ Detects Ctrl via `kCGEventFlagMaskControl`
- ✅ Sends both states simultaneously to JavaScript
- ✅ Emits `fnCtrlPressed` event (not used yet)

**Implementation requires ~95 lines of code, NO native module changes!**

---

## Implementation Phases

### ✅ Phase 0: Documentation (COMPLETE)
- [x] Create DUAL_MODE_ARCHITECTURE.md
- [x] Create ARCHITECTURE_ANALYSIS.md
- [x] Create FN_KEY_IMPLEMENTATION_ANALYSIS.md
- [x] Update DUAL_MODE_ARCHITECTURE.md with native approach
- [x] Copy docs to Downloads
- [x] Commit documentation

---

### 🔧 Phase 1: Settings UI Cleanup

#### Task 1.0: Remove Multimodal Toggle from Settings
**Files**: Settings UI component (likely `src/renderer/components/Settings.vue` or similar)

**Changes**:
- Remove multimodal toggle checkbox/switch from UI
- Remove any `screenSharingEnabled` or `multimodalEnabled` config setting
- Update settings documentation to explain key-driven mode selection

**Rationale**:
Multimodal is no longer a global setting - it's determined per-command by which keys the user presses (Fn = STT, Fn+Ctrl = Multimodal).

**Testing After Task**:
- [ ] Settings UI no longer shows multimodal toggle
- [ ] App still requests screen recording permission on first Fn+Ctrl press
- [ ] No errors about missing multimodal setting

**Acceptance Criteria**:
- Settings simplified
- Mode is 100% key-driven
- Clear in-app explanation of how modes work

---

### 🔧 Phase 2: Core Implementation

#### Task 2.1: Update Main Process Event Handler
**File**: `src/main/index.ts` (lines ~406-423)

**Changes**:
Update the `keyStateChange` handler to check `event.ctrlPressed` flag:

```typescript
// Track previous states (ADD these)
let previousFnState = false
let previousCtrlState = false

keyMonitor.on('keyStateChange', (event) => {
  if (!inRecordModeGlobal) return

  if (event.fnPressed !== previousFnState) {
    if (event.fnPressed) {
      // ✅ NEW: Check if Ctrl is also pressed
      if (event.ctrlPressed) {
        // Fn+Ctrl - multimodal mode
        mainWindow?.webContents.send('ptt-pressed', {
          isRecording: true,
          mode: 'multimodal'
        })
      } else {
        // Fn only - STT mode
        mainWindow?.webContents.send('ptt-pressed', {
          isRecording: true,
          mode: 'stt'
        })
      }
    } else {
      // Fn released
      mainWindow?.webContents.send('ptt-pressed', { isRecording: false })
    }
    previousFnState = event.fnPressed
  }
})
```

**Testing After Task**:
- [ ] Console shows "Fn PRESSED - starting STT mode" when Fn only
- [ ] Console shows "Fn+Ctrl PRESSED - starting multimodal mode" when Fn+Ctrl
- [ ] Both modes detected correctly
- [ ] No changes to native module needed

**Acceptance Criteria**:
- Main process correctly distinguishes Fn vs Fn+Ctrl
- Mode parameter sent to renderer
- ~10 lines of code added

---

#### Task 2.2: Update Renderer IPC Handler
**File**: `src/renderer/App.vue`

**Changes**:
Update the `onPTTPressed` handler to accept `mode` parameter:

```typescript
electronAPI.onPTTPressed((_event: any, data: { isRecording: boolean; mode?: string }) => {
  if (data.isRecording) {
    // Starting recording - check which mode
    if (data.mode === 'multimodal') {
      console.log('[App] Starting MULTIMODAL mode')
      startMultimodalMode()
    } else {
      console.log('[App] Starting STT mode')
      startSTTMode()
    }
  } else {
    // Stopping recording
    console.log('[App] Stopping recording - processing')
    handleRelease()
  }
})
```

**Testing After Task**:
- [ ] IPC handler accepts mode parameter
- [ ] Calls correct mode function (STT vs multimodal)
- [ ] Console logs show mode selection

**Acceptance Criteria**:
- IPC handler updated (~5 lines)
- Mode routing works correctly
- Clear console logs

---

#### Task 2.3: Implement STT Mode (Fn Only)
**File**: `src/renderer/composables/useVoiceEdit.ts`

**Changes**:
Add new `startSTTMode()` function (implementation from DUAL_MODE_ARCHITECTURE.md lines 538-597)

**Testing After Task**:
- [ ] Press Fn → Console shows "🎤 Starting STT mode (mic only)"
- [ ] Audio recording starts (no screen capture)
- [ ] Release Fn → Processing triggered
- [ ] Response pasted correctly
- [ ] NO screen capture logs present

**Acceptance Criteria**:
- Audio-only recording works (~40 lines)
- No screen capture started
- Gemini receives audio stream
- Response pasted successfully
- Logs confirm STT mode throughout

---

#### Task 2.4: Implement Multimodal Mode (Fn+Ctrl)
**File**: `src/renderer/composables/useVoiceEdit.ts`

**Changes**:
Add new `startMultimodalMode()` function (implementation from DUAL_MODE_ARCHITECTURE.md lines 604-695)

**Testing After Task**:
- [ ] Press Fn+Ctrl → Console shows "🎤📺 Starting multimodal mode"
- [ ] Screen capture starts first
- [ ] 500ms delay before ready
- [ ] Console shows "🟢 Screen capture READY"
- [ ] `isInMultimodalMode.value = true`
- [ ] Audio recording starts after screen ready
- [ ] Release Fn+Ctrl → Processing triggered
- [ ] Screen capture stopped
- [ ] Response uses screen context

**Acceptance Criteria**:
- Screen capture initializes before audio (~80 lines)
- 500ms delay implemented
- Ready state exposed to UI
- Both audio and screen sent to Gemini
- Screen stopped when command done
- Fallback to STT if screen fails

---

#### Task 2.5: Implement Release Handler with Timeout
**File**: `src/renderer/composables/useVoiceEdit.ts`

**Changes**:
```typescript
let responseTimeout: NodeJS.Timeout | null = null

async function handleRelease() {
  // Implementation from DUAL_MODE_ARCHITECTURE.md lines 565-640
}

function resetToRecordMode() {
  // Implementation from DUAL_MODE_ARCHITECTURE.md lines 645-655
}
```

**Testing After Task**:
- [ ] Fn release triggers processing
- [ ] Context sent to Gemini
- [ ] 10-second timeout set
- [ ] If response arrives → timeout cleared
- [ ] If no response → timeout fires at 10s
- [ ] State reset correctly after timeout
- [ ] Next command works after timeout
- [ ] Mode correctly detected (STT vs multimodal)
- [ ] Screen stopped only if multimodal

**Acceptance Criteria**:
- Timeout mechanism works
- State always resets (response or timeout)
- No stuck `isProcessing` states
- Returns to RECORD_MODE (not IDLE)
- Logs show complete flow

---

#### Task 2.6: Update Gemini Response Handler
**File**: `src/renderer/composables/useVoiceEdit.ts`

**Changes**:
```typescript
geminiAdapter.on('turnComplete', async () => {
  // Update with timeout clearing
  // Implementation from DUAL_MODE_ARCHITECTURE.md lines 660-690
})
```

**Testing After Task**:
- [ ] Response clears timeout
- [ ] Empty response ignored
- [ ] 500ms delay before isProcessing reset
- [ ] Returns to RECORD_MODE
- [ ] Ready for next command

**Acceptance Criteria**:
- Timeout cleared on success
- No stuck states
- 500ms delay preserved
- State machine correct

---

#### Task 2.7: Update Overlay UI
**File**: `src/renderer/App.vue`

**Changes**:
- Update template (lines ~200-300)
- Update styles (lines ~400-600)
- Implementation from DUAL_MODE_ARCHITECTURE.md lines 695-900

**Testing After Task**:
- [ ] Overlay height is ~180px (not cut off)
- [ ] Two mode cards visible
- [ ] STT card shows: 🎤 STT, "Fn only"
- [ ] Multimodal card shows: 🎤📺 Multimodal, "Fn + Ctrl"
- [ ] Green ready indicator hidden initially
- [ ] Status dot pulses red
- [ ] Instructions clearly visible
- [ ] Processing indicator hidden initially

**Acceptance Criteria**:
- All content visible (not cut off)
- Clean, modern design
- Follows design spec exactly

---

#### Task 2.8: Connect Overlay to State
**File**: `src/renderer/App.vue`

**Changes**:
```vue
<script setup lang="ts">
const {
  inRecordMode,
  isRecording,
  isInMultimodalMode,
  isProcessing
} = useVoiceEdit()
</script>
```

**Testing After Task**:
- [ ] Overlay shows when inRecordMode = true
- [ ] STT card highlights when Fn pressed (isRecording && !isInMultimodalMode)
- [ ] Multimodal card highlights when Fn+Ctrl pressed (isRecording && isInMultimodalMode)
- [ ] Green indicator shows when isInMultimodalMode = true
- [ ] Processing indicator shows when isProcessing = true
- [ ] Dimming works correctly

**Acceptance Criteria**:
- All reactive states work
- Visual feedback instant
- No flickering or lag

---

### 🧪 Phase 3: Unit Testing

#### Test 2.1: STT Mode End-to-End
**Test Scenario**: Pure dictation without screen

**Steps**:
1. Start app in dev mode: `npm run dev`
2. Press Ctrl+Space → Enter RECORD_MODE
3. Press Fn → STT mode activates
4. Speak: "hello world"
5. Release Fn
6. Wait for response
7. Verify paste

**Expected Logs**:
```
[VoiceEdit] 🎤 Starting STT mode (mic only)
[VoiceEdit] ✅ STT mode active (no screen capture)
[VoiceEdit] 🎯 Fn released - processing STT command
[VoiceEdit] 📤 Sending context: Focus text: ""
[VoiceEdit] ✅ Context sent, waiting for Gemini response
[VoiceEdit] ✅ Gemini finished response
[VoiceEdit] ✅ Pasted: hello world
[VoiceEdit] ✅ Ready for next command
```

**Checklist**:
- [ ] Overlay shows STT card highlighted
- [ ] NO screen capture logs
- [ ] Audio streaming logs present
- [ ] Gemini response received
- [ ] "hello world " pasted correctly
- [ ] Returns to RECORD_MODE
- [ ] No errors in console

**Pass Criteria**: All checkboxes ticked, logs match expected

---

#### Test 2.2: Multimodal Mode End-to-End
**Test Scenario**: Voice command with screen context

**Steps**:
1. In RECORD_MODE
2. Select text "Hello world" in TextEdit
3. Press Fn+Ctrl → Multimodal mode activates
4. Wait for 🟢 READY indicator (~500ms)
5. Speak: "translate to French"
6. Release Fn+Ctrl
7. Wait for response
8. Verify paste

**Expected Logs**:
```
[VoiceEdit] 🎤📺 Starting multimodal mode (mic + screen)
[VoiceEdit] Starting screen capture...
[ScreenCapture] ✅ Screen capture started successfully
[VoiceEdit] 🟢 Screen capture READY
[VoiceEdit] ✅ Multimodal mode active (mic + screen)
[VoiceEdit] 🎯 Fn released - processing multimodal command
[VoiceEdit] Stopping screen capture (multimodal mode ending)
[VoiceEdit] 📤 Sending context: Focus text: "Hello world"
[VoiceEdit] ✅ Context sent, waiting for Gemini response
[VoiceEdit] ✅ Gemini finished response
[VoiceEdit] ✅ Pasted: Bonjour le monde
[VoiceEdit] ✅ Ready for next command
```

**Checklist**:
- [ ] Overlay shows multimodal card highlighted
- [ ] Green indicator appears after ~500ms
- [ ] Screen capture logs present
- [ ] Video frames sent to Gemini (check logs)
- [ ] Audio streaming logs present
- [ ] Gemini response uses screen context
- [ ] French translation pasted
- [ ] Screen capture stopped
- [ ] Returns to RECORD_MODE
- [ ] No errors in console

**Pass Criteria**: All checkboxes ticked, logs match expected

---

#### Test 2.3: Mode Switching
**Test Scenario**: Alternate between STT and multimodal

**Steps**:
1. In RECORD_MODE
2. Command 1: Fn → "test one" → verify
3. Command 2: Fn+Ctrl → "translate to Spanish" → verify
4. Command 3: Fn → "test two" → verify
5. Command 4: Fn+Ctrl → "make uppercase" → verify
6. Command 5: Fn → "test three" → verify

**Checklist**:
- [ ] Command 1: STT mode, no screen logs
- [ ] Command 2: Multimodal mode, screen logs present
- [ ] Command 3: STT mode, no screen logs
- [ ] Command 4: Multimodal mode, screen logs present
- [ ] Command 5: STT mode, no screen logs
- [ ] All commands pasted correctly
- [ ] Overlay showed correct mode each time
- [ ] No mode confusion
- [ ] Stayed in RECORD_MODE throughout
- [ ] No errors

**Pass Criteria**: All commands work, correct mode used each time

---

#### Test 2.4: Timeout Recovery
**Test Scenario**: Verify timeout prevents stuck states

**Steps**:
1. In RECORD_MODE
2. Press Fn → speak silence or gibberish → release
3. Observe console for 10 seconds
4. At 10s, verify timeout triggers
5. Immediately try: Fn → "test" → release → verify works

**Expected Logs**:
```
[VoiceEdit] 🎯 Fn released - processing STT command
[VoiceEdit] ✅ Context sent, waiting for Gemini response
... 10 seconds pass ...
[VoiceEdit] ⏰ Gemini response timeout (10s)
[VoiceEdit] Reset to RECORD_MODE complete
[VoiceEdit] 🎤 Starting STT mode (mic only)
[VoiceEdit] 🎯 Fn released - processing STT command
[VoiceEdit] ✅ Gemini finished response
```

**Checklist**:
- [ ] Timeout triggers at exactly 10 seconds
- [ ] Console shows timeout message
- [ ] isProcessing reset to false
- [ ] Returns to RECORD_MODE
- [ ] Overlay returns to idle
- [ ] Next command NOT blocked
- [ ] No "Already processing" error

**Pass Criteria**: Timeout works, state recovers, next command succeeds

---

#### Test 2.5: Continuous Conversation
**Test Scenario**: Multiple commands without exiting RECORD_MODE

**Steps**:
1. Press Ctrl+Space → Enter RECORD_MODE
2. Execute 7 commands without pressing Ctrl+Space again:
   - Fn → "one" → verify
   - Fn+Ctrl → "translate to Spanish" → verify
   - Fn → "two" → verify
   - Fn+Ctrl → "make uppercase" → verify
   - Fn → "three" → verify
   - Fn+Ctrl → "translate to French" → verify
   - Fn → "four" → verify
3. Press Ctrl+Space → Exit RECORD_MODE

**Checklist**:
- [ ] All 7 commands work
- [ ] Overlay visible throughout
- [ ] Correct mode each time
- [ ] No need to re-enter RECORD_MODE
- [ ] Final Ctrl+Space exits cleanly
- [ ] Overlay disappears
- [ ] No errors

**Pass Criteria**: Seamless multi-command session

---

#### Test 2.6: Green Ready Indicator Timing
**Test Scenario**: Verify green shows only when screen ready

**Steps**:
1. In RECORD_MODE
2. Press Fn+Ctrl
3. Watch overlay carefully (use stopwatch if needed)

**Checklist**:
- [ ] t=0ms: Multimodal card highlights immediately
- [ ] t=0-500ms: NO green indicator
- [ ] t=~500ms: Green indicator appears
- [ ] Green indicator pulses (animated)
- [ ] Console shows "🟢 Screen capture READY" at ~500ms

**Pass Criteria**: Green indicator waits for screen initialization

---

#### Test 2.7: Screen Capture Fallback
**Test Scenario**: Graceful degradation if screen fails

**Setup**:
1. Deny Screen Recording permission in System Preferences
2. Restart app

**Steps**:
1. In RECORD_MODE
2. Press Fn+Ctrl
3. Observe console

**Expected Logs**:
```
[VoiceEdit] 🎤📺 Starting multimodal mode (mic + screen)
[VoiceEdit] Starting screen capture...
[VoiceEdit] ❌ Screen capture failed: [error message]
[VoiceEdit] Falling back to STT mode
[VoiceEdit] 🎤 Starting STT mode (mic only)
[VoiceEdit] ✅ STT mode active (no screen capture)
```

**Checklist**:
- [ ] Error logged clearly
- [ ] Fallback to STT mode automatic
- [ ] STT card highlights (not multimodal)
- [ ] No green indicator
- [ ] Command still works (STT only)
- [ ] No crash or stuck state

**Pass Criteria**: Graceful fallback, app still functional

---

#### Test 2.8: State Machine Validation
**Test Scenario**: Verify all state transitions

**Steps**:
1. Track state through console logs
2. Execute full workflow:
   - IDLE → (Ctrl+Space) → RECORD_MODE
   - RECORD_MODE → (Fn) → STT_ACTIVE
   - STT_ACTIVE → (Fn release) → PROCESSING
   - PROCESSING → (response) → RECORD_MODE
   - RECORD_MODE → (Fn+Ctrl) → MULTIMODAL_ACTIVE
   - MULTIMODAL_ACTIVE → (Fn+Ctrl release) → PROCESSING
   - PROCESSING → (response) → RECORD_MODE
   - RECORD_MODE → (Ctrl+Space) → IDLE

**Checklist**:
- [ ] All 8 transitions logged
- [ ] No unexpected states
- [ ] Overlay reflects state at each step
- [ ] `currentMode.value` correct at each step

**Pass Criteria**: Perfect state machine execution

---

#### Test 2.9: Overlay UI Verification
**Test Scenario**: Visual appearance check

**Checklist - Idle State**:
- [ ] Height: ~180px (measure with DevTools)
- [ ] Width: ~340px
- [ ] Position: bottom-right, 20px margins
- [ ] Background: dark with blur
- [ ] Status dot: red, pulsing
- [ ] Both mode cards: visible, normal state
- [ ] Instructions: all 3 lines visible
- [ ] Processing indicator: hidden

**Checklist - STT Active**:
- [ ] STT card: green border, elevated, tinted
- [ ] Multimodal card: dimmed (40% opacity)
- [ ] No green ready indicator

**Checklist - Multimodal Active**:
- [ ] Multimodal card: green border, elevated, tinted
- [ ] STT card: dimmed (40% opacity)
- [ ] Green indicator: visible, pulsing
- [ ] Text "READY" visible

**Checklist - Processing**:
- [ ] Both cards: back to normal
- [ ] Processing indicator: visible, orange
- [ ] Spinner: rotating

**Pass Criteria**: All visual states perfect

---

#### Test 2.10: Log Completeness
**Test Scenario**: Verify comprehensive logging

**After all tests, search logs for required patterns**:

**Required Logs**:
- [ ] `🎤 Starting STT mode` (STT starts)
- [ ] `🎤📺 Starting multimodal mode` (Multimodal starts)
- [ ] `🟢 Screen capture READY` (Screen ready)
- [ ] `🎯 Fn released - processing` (Release triggers)
- [ ] `📤 Sending context:` (Context sent)
- [ ] `✅ Context sent, waiting` (Waiting)
- [ ] `✅ Gemini finished response` (Response received)
- [ ] `✅ Pasted:` (Paste complete)
- [ ] `✅ Ready for next command` (State reset)
- [ ] `⏰ Gemini response timeout` (Timeout triggered)
- [ ] `Stopping screen capture` (Screen cleanup)
- [ ] `Returning to RECORD_MODE` (State transition)

**Pass Criteria**: All patterns found, no critical gaps

---

### 🐛 Phase 4: Bug Verification

#### Bug 3.1: Gemini Non-Response (Original Issue)
**Original Bug**: Gemini stops responding after first command

**Test**:
1. Execute first command → verify works
2. Execute second command → verify works
3. Execute third command → verify works

**Expected**: All commands receive responses

**Checklist**:
- [ ] First command: response received
- [ ] Second command: response received
- [ ] Third command: response received
- [ ] No stuck states
- [ ] Gemini connection stays active

**Pass Criteria**: Bug FIXED - all commands work

---

#### Bug 3.2: isProcessing Stuck (Original Issue)
**Original Bug**: isProcessing never resets if Gemini doesn't respond

**Test**:
1. Trigger timeout scenario (speak gibberish)
2. Wait 10 seconds for timeout
3. Try next command immediately

**Expected**: Next command works (not blocked)

**Checklist**:
- [ ] Timeout triggers at 10s
- [ ] isProcessing reset
- [ ] Next command accepts (not "Already processing")
- [ ] Next command completes successfully

**Pass Criteria**: Bug FIXED - timeout recovery works

---

#### Bug 3.3: Screen Capture Lifecycle (Original Issue)
**Original Bug**: Screen stopped too early, breaking Gemini processing

**Test**:
1. Use multimodal mode
2. Check logs for screen capture timing

**Expected Logs**:
```
[VoiceEdit] Starting screen capture...
[VoiceEdit] 🟢 Screen capture READY
[VoiceEdit] ✅ Multimodal mode active
[User speaks, releases Fn+Ctrl]
[VoiceEdit] 🎯 Fn released - processing
[VoiceEdit] ✅ Context sent, waiting for Gemini response
[VoiceEdit] Stopping screen capture (multimodal mode ending)
[VoiceEdit] ✅ Gemini finished response
```

**Checklist**:
- [ ] Screen starts BEFORE audio
- [ ] Screen stays active while waiting for response
- [ ] Screen stops AFTER release (not during processing)
- [ ] Gemini response received successfully

**Pass Criteria**: Bug FIXED - screen lifecycle correct

---

#### Bug 3.4: State Confusion (Original Issue)
**Original Bug**: Resets to IDLE instead of RECORD_MODE

**Test**:
1. In RECORD_MODE
2. Execute command
3. Check state after response

**Expected**:
```
[VoiceEdit] ✅ Ready for next command
[VoiceEdit] Returning to RECORD_MODE (ready for next command)
```

**Checklist**:
- [ ] After response, still in RECORD_MODE
- [ ] currentMode != IDLE
- [ ] Overlay still visible
- [ ] Can execute next command immediately (just press Fn)

**Pass Criteria**: Bug FIXED - stays in RECORD_MODE

---

### 📊 Phase 5: Performance & Edge Cases

#### Test 4.1: Rapid Mode Switching
**Test Scenario**: Quick alternation between modes

**Steps**:
1. Rapidly alternate: Fn → Fn+Ctrl → Fn → Fn+Ctrl (10 times)
2. Verify no crashes or errors

**Checklist**:
- [ ] No crashes
- [ ] Overlay updates smoothly
- [ ] No visual glitches
- [ ] No stuck states
- [ ] Logs show all transitions

**Pass Criteria**: Handles rapid switching gracefully

---

#### Test 4.2: Long Session
**Test Scenario**: Extended use (30+ commands)

**Steps**:
1. Execute 30 commands in one RECORD_MODE session
2. Mix STT and multimodal randomly
3. Check for memory leaks or performance degradation

**Checklist**:
- [ ] All 30 commands work
- [ ] No slowdown over time
- [ ] Memory usage stable (check DevTools)
- [ ] No accumulated errors
- [ ] Overlay remains responsive

**Pass Criteria**: Stable performance over extended use

---

#### Test 4.3: Empty/Invalid Input
**Test Scenario**: Edge cases

**Test Cases**:
1. Press Fn, release immediately (no speech)
2. Press Fn, speak silence, release
3. Press Fn+Ctrl, release before green indicator
4. Press Fn with no selected text

**Checklist**:
- [ ] Case 1: Timeout triggers, no crash
- [ ] Case 2: Timeout triggers, no crash
- [ ] Case 3: Works or gracefully falls back
- [ ] Case 4: STT mode still works

**Pass Criteria**: All edge cases handled gracefully

---

### ✅ Phase 6: Final Validation

#### Validation 5.1: Compare with Working Code Patterns
**Reference**: WORKING_CODE.md in Downloads

**Checklist - Pattern Preservation**:
- [ ] Pre-capture selected text (before focus changes)
- [ ] Context sent with turnComplete
- [ ] Paste mechanism uses clipboard + AppleScript
- [ ] Continuous conversation (no need to re-enter mode)
- [ ] Clear separation of command vs text
- [ ] Comprehensive logging at all checkpoints

**Pass Criteria**: All working patterns preserved

---

#### Validation 5.2: Architecture Compliance
**Reference**: DUAL_MODE_ARCHITECTURE.md

**Checklist**:
- [ ] Two distinct modes implemented
- [ ] Screen capture only in multimodal mode
- [ ] Green ready indicator works
- [ ] 10-second timeout implemented
- [ ] State machine matches spec
- [ ] Overlay matches design
- [ ] All 10 tests passed

**Pass Criteria**: 100% architecture compliance

---

#### Validation 5.3: User Acceptance
**Simulated User Tests**:

**Scenario 1: Dictation User**
- Uses only Fn (never Fn+Ctrl)
- Dictates several paragraphs
- **Expected**: Fast, token-efficient, works perfectly

**Scenario 2: Command User**
- Selects text, uses Fn+Ctrl for editing
- Commands like "translate", "uppercase", "fix grammar"
- **Expected**: Accurate edits using screen context

**Scenario 3: Mixed User**
- Alternates between dictation and commands
- **Expected**: Seamless switching, clear mode feedback

**Checklist**:
- [ ] Scenario 1: Dictation works perfectly
- [ ] Scenario 2: Commands accurate with screen context
- [ ] Scenario 3: Mode switching seamless

**Pass Criteria**: All scenarios successful

---

## Success Criteria Summary

### Must Pass (Blocking)
- [ ] All 10 unit tests (2.1 - 2.10) pass
- [ ] All 4 original bugs (3.1 - 3.4) fixed
- [ ] State machine validation (2.8) perfect
- [ ] Overlay UI verification (2.9) perfect
- [ ] Log completeness (2.10) 100%

### Should Pass (High Priority)
- [ ] Performance tests (4.1 - 4.3) pass
- [ ] Edge cases handled gracefully
- [ ] Working code patterns preserved (5.1)
- [ ] Architecture compliance (5.2) 100%

### Nice to Have
- [ ] User acceptance scenarios (5.3) all pass
- [ ] Zero errors in console during all tests
- [ ] Smooth animations, no visual glitches

---

## Rollback Plan

**If critical bugs found**:

1. **Immediate**: Revert to working commit
   ```bash
   git checkout fe97b91
   ```

2. **Document**: Log all issues found in DEVELOPMENT_TODO.md

3. **Fix**: Address issues in new branch
   ```bash
   git checkout -b fix/dual-mode-issues
   ```

4. **Re-test**: Run full test suite again

5. **Merge**: Only when all tests pass

---

## Completion Checklist

### Phase 1: Settings Cleanup
- [ ] Task 1.0: Remove multimodal toggle from Settings UI ✓

### Phase 2: Implementation Complete
- [ ] Task 2.1: Main process event handler (check ctrlPressed flag) ✓
- [ ] Task 2.2: Renderer IPC handler (accept mode parameter) ✓
- [ ] Task 2.3: STT mode ✓
- [ ] Task 2.4: Multimodal mode ✓
- [ ] Task 2.5: Release handler + timeout ✓
- [ ] Task 2.6: Response handler ✓
- [ ] Task 2.7: Overlay UI ✓
- [ ] Task 2.8: State connection ✓

### Testing Complete
- [ ] Test 2.1: STT end-to-end ✓
- [ ] Test 2.2: Multimodal end-to-end ✓
- [ ] Test 2.3: Mode switching ✓
- [ ] Test 2.4: Timeout recovery ✓
- [ ] Test 2.5: Continuous conversation ✓
- [ ] Test 2.6: Green indicator timing ✓
- [ ] Test 2.7: Screen fallback ✓
- [ ] Test 2.8: State machine ✓
- [ ] Test 2.9: Overlay UI ✓
- [ ] Test 2.10: Log completeness ✓

### Bug Fixes Verified
- [ ] Bug 3.1: Gemini non-response FIXED ✓
- [ ] Bug 3.2: isProcessing stuck FIXED ✓
- [ ] Bug 3.3: Screen lifecycle FIXED ✓
- [ ] Bug 3.4: State confusion FIXED ✓

### Performance Validated
- [ ] Test 4.1: Rapid switching ✓
- [ ] Test 4.2: Long session ✓
- [ ] Test 4.3: Edge cases ✓

### Final Validation
- [ ] Validation 5.1: Working patterns preserved ✓
- [ ] Validation 5.2: Architecture compliance ✓
- [ ] Validation 5.3: User acceptance ✓

---

## Sign-Off

**Implementation Ready**: [ ]
**All Tests Pass**: [ ]
**Architecture Compliant**: [ ]
**Ready for Production**: [ ]

**Developer Sign-Off**: _________________
**Date**: _________________

---

*End of DEVELOPMENT_TODO.md*
