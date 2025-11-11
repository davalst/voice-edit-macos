# Push-to-Talk Testing Strategy

> **Goal**: Verify that Fn push-to-talk preserves ALL working mechanisms from commit 6484dd9

## Desired End State (from WORKING_CODE.md)

The push-to-talk implementation MUST match the working auto-send flow, with only ONE difference:

### Working Auto-Send Flow (commit 6484dd9):
1. Control+Space → Pre-capture text
2. Start recording (audio + screen streaming)
3. User speaks command
4. **VAD detects 1.5s silence → auto-send**
5. Send context: `Focus text: "${selectedText}"`
6. Send turnComplete
7. Gemini responds with JSON
8. Parse and execute action (edit/query/insert_styled/search)
9. Paste edited text
10. **Keep recording** (continuous conversation)
11. Control+Space again → stop recording

### Required Push-to-Talk Flow:
1. **Ctrl+Space → Enter RECORD MODE** (idle state)
2. **Fn press → Start recording** (audio + screen streaming)
3. User speaks command
4. **Fn release → manual send** (replaces VAD auto-send)
5. Send context: `Focus text: "${selectedText}"`
6. Send turnComplete
7. Gemini responds with JSON
8. Parse and execute action (edit/query/insert_styled/search)
9. Paste edited text
10. **Keep RECORD MODE active** (allow another Fn press)
11. **Ctrl+Space again → Exit RECORD MODE**

## Critical Mechanisms That MUST Work

### 1. Audio Streaming (MUST be continuous)
**Expected Behavior**:
- AudioRecorder emits 'data' events continuously while recording
- Each chunk sent via `geminiAdapter.sendRealtimeInput({ media: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' }})`
- Gemini should receive hundreds of audio tokens (not just 1!)

**Test**:
```
PASS if: Console shows continuous audio streaming
PASS if: Gemini receives >100 audio tokens for 2-second speech
FAIL if: Only 1-2 audio tokens received
```

### 2. Screen Capture (MUST stream continuously)
**Expected Behavior**:
- VideoFrameCapturer starts when recording begins
- Sends 1 FPS JPEG frames via `geminiAdapter.sendRealtimeInput({ media: { data: base64Jpeg, mimeType: 'image/jpeg' }})`
- Continues until recording stops

**Test**:
```
PASS if: "Starting screen capture" appears in log
PASS if: "Screen sharing ACTIVE" appears
PASS if: Screen frames sent to Gemini (check video token count)
FAIL if: "Screen capture disabled for this mode"
```

### 3. VAD Disabled in HOLD Mode
**Expected Behavior**:
- VAD energy detection still runs (for logging)
- But VAD silence handler is BLOCKED in HOLD modes
- Only Fn release triggers processing

**Test**:
```
PASS if: VAD logs show "Speaking: true/false"
PASS if: "VAD silence ignored in push-to-talk HOLD mode" appears
FAIL if: "🔕 Silence detected - sending context" appears during Fn hold
```

### 4. Manual Trigger on Fn Release
**Expected Behavior**:
- Fn release calls `manualTriggerProcessing()`
- Sends context: `Focus text: "${selectedText}"`
- Sends turnComplete
- Identical to VAD auto-send, just different trigger

**Test**:
```
PASS if: "🎯 Fn released - manually triggering processing"
PASS if: "📤 Sending context: Focus text: ..."
PASS if: "✅ Turn complete sent"
FAIL if: "Already processing - ignoring manual trigger"
```

### 5. Context Sending (MUST include selected text)
**Expected Behavior**:
- Pre-captured text sent as: `Focus text: "${selectedText}"`
- Sent with `turnComplete: false` first
- Then `sendTurnComplete()` called

**Test**:
```
PASS if: Context message contains actual selected text
PASS if: Gemini receives TEXT tokens with context
FAIL if: Context is empty: `Focus text: ""`
```

### 6. Gemini Response (MUST receive and parse)
**Expected Behavior**:
- Gemini returns JSON (may be wrapped in ```json fences)
- Parser strips fences and parses JSON
- Four action types: edit, query, insert_styled, search

**Test**:
```
PASS if: "📥 Received modelTurn with N parts"
PASS if: "📋 Parsed response: {...}"
PASS if: JSON contains "action" and "result" fields
FAIL if: Parse error or empty response
```

### 7. Paste Operation (MUST execute)
**Expected Behavior**:
- For "edit" action: Paste result + space via Cmd+V
- AppleScript simulates keyboard
- Text appears in active application

**Test**:
```
PASS if: "✅ Pasted: ..." appears in log
PASS if: Text actually appears in target app
FAIL if: No paste operation occurs
```

### 8. isProcessing Flag Lifecycle
**Expected Behavior**:
- Set to `true` when processing starts
- Prevents duplicate triggers
- Reset to `false` after 500ms delay (after paste completes)

**Test**:
```
PASS if: isProcessing=true during processing
PASS if: isProcessing=false after "✅ Ready for next command"
FAIL if: "Already processing" errors on rapid Fn presses
```

### 9. Continuous Conversation (MUST stay in RECORD MODE)
**Expected Behavior**:
- After Gemini responds and pastes, stay in RECORD MODE
- User can press Fn again for another command
- Only Ctrl+Space exits RECORD MODE

**Test**:
```
PASS if: After response, mode is still RECORD MODE (not IDLE)
PASS if: Can press Fn again for second command
FAIL if: Recording stops after first response
```

## Test Execution Plan

### Phase 1: Component-Level Tests
1. ✅ Read useVoiceEdit.ts to verify audio streaming logic
2. ✅ Read geminiLiveSDKAdapter.ts to verify sendRealtimeInput
3. ✅ Read audio-recorder.ts to verify VAD configuration
4. ✅ Verify screen capture logic in startScreenSharing()

### Phase 2: Integration Tests (Code Analysis)
1. Trace audio path: AudioRecorder → 'data' event → sendRealtimeInput
2. Trace video path: VideoFrameCapturer → callback → sendRealtimeInput
3. Trace manual trigger: Fn release → manualTriggerProcessing() → sendTurnComplete()
4. Trace response path: turnComplete event → handleGeminiResponse() → pasteText()

### Phase 3: Runtime Log Analysis
1. Check latest console log for test run
2. Verify all expected log messages appear
3. Count audio/video tokens sent to Gemini
4. Verify no "Already processing" errors
5. Verify paste operations execute

### Phase 4: Live Testing (After Code Validation)
Only proceed if ALL Phase 1-3 tests PASS.

## Test Checklist

- [ ] Audio streaming: Continuous chunks sent to Gemini
- [ ] Screen capture: Always starts during recording
- [ ] VAD disabled: Silence handler blocked in HOLD mode
- [ ] Manual trigger: Fn release sends context + turnComplete
- [ ] Context sending: Selected text included in message
- [ ] Gemini response: JSON parsed correctly
- [ ] Paste operation: Text pasted via Cmd+V
- [ ] isProcessing lifecycle: No "Already processing" errors
- [ ] Continuous conversation: Stay in RECORD MODE after response

## Expected Success Criteria

**ALL of the following MUST be true:**

1. Console log shows "Starting screen capture" (not "disabled")
2. Console log shows continuous VAD energy readings
3. Console log shows "VAD silence ignored in push-to-talk HOLD mode"
4. Console log shows "🎯 Fn released - manually triggering processing"
5. Console log shows "📤 Sending context: Focus text: [actual text]"
6. Console log shows "✅ Turn complete sent"
7. Console log shows "📥 Received modelTurn"
8. Console log shows "📋 Parsed response"
9. Console log shows "✅ Pasted: [result]"
10. Console log shows "✅ Ready for next command"
11. NO "Already processing" errors
12. NO "Screen capture disabled" messages
13. Gemini receives >100 audio tokens (not just 1-2)
14. Text actually pastes in target application

If ANY of these fail, the implementation is BROKEN and needs fixing before user testing.
