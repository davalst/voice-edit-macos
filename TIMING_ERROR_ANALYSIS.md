# Timing Error Analysis - Why My Changes Broke Everything

**Date**: 2025-11-10
**Issue**: Gemini was echoing commands instead of executing them

## The Critical Error

### What I Did Wrong

I moved `getSelectedText()` to BEFORE audio recording starts:

```typescript
// MY BROKEN VERSION
async function startRecording() {
  // ❌ Get selected text BEFORE recording
  selectedText.value = await getSelectedTextFromApp()

  // ❌ Send INPUT context BEFORE audio starts streaming
  geminiAdapter.sendClientContent({
    turns: [{ text: `<INPUT>${selectedText.value}</INPUT>` }],
    turnComplete: false,
  })

  // Start audio recording
  audioRecorder = new AudioRecorder(16000)
  audioRecorder.on('data', sendToGemini)
  await audioRecorder.start()
}
```

### Why This Failed

**Timeline of events:**
1. ⏱️ 0ms: User presses Control+Space
2. ⏱️ 0ms: App sends `<INPUT>text</INPUT>` to Gemini
3. ⏱️ 100ms: Audio recording starts
4. ⏱️ 100-2000ms: User speaks "translate to French"
5. ⏱️ 2000ms: Silence detected, `turnComplete` sent
6. ⏱️ 2100ms: Gemini processes and responds

**What Gemini sees:**
```
Turn 1: <INPUT>As I walked down the street...</INPUT>
[2 seconds of silence]
Turn 2: Audio: "translate to French"
Turn 3: turnComplete
```

**Result**: Gemini receives the INPUT text but NO audio command has been streamed yet. So it just echoes back "Traduire en français" (the COMMAND, not the actual translation).

## The Working Version

### Correct Implementation (from commit 4c86656)

```typescript
// WORKING VERSION
async function startRecording() {
  audioRecorder = new AudioRecorder(16000)

  // Stream audio to Gemini AS USER SPEAKS
  audioRecorder.on('data', (base64Audio: string) => {
    geminiAdapter.sendRealtimeInput({
      media: {
        data: base64Audio,
        mimeType: 'audio/pcm;rate=16000',
      },
    })
  })

  // AFTER silence detected → THEN get selected text
  audioRecorder.on('silence', async () => {
    console.log('[VoiceEdit] Silence detected - processing...')

    // ✅ Get selected text AFTER user finishes speaking
    selectedText.value = await getSelectedTextFromApp()

    // ✅ Send INPUT context with AUDIO ALREADY CAPTURED
    geminiAdapter.sendClientContent({
      turns: [{ text: `<INPUT>${selectedText.value}</INPUT>` }],
      turnComplete: false,
    })

    // ✅ Send turnComplete to trigger response
    await geminiAdapter.sendTurnComplete()
  })

  await audioRecorder.start()
}
```

### Why This Works

**Timeline of events:**
1. ⏱️ 0ms: User presses Control+Space
2. ⏱️ 0ms: Audio recording starts
3. ⏱️ 0-1500ms: User speaks "translate to French" → Audio streams to Gemini in real-time
4. ⏱️ 1500ms: Silence detected
5. ⏱️ 1500ms: App gets selected text from clipboard
6. ⏱️ 1600ms: App sends `<INPUT>text</INPUT>` to Gemini
7. ⏱️ 1600ms: App sends `turnComplete`
8. ⏱️ 1700ms: Gemini processes and responds

**What Gemini sees:**
```
Turn 1: Audio streaming: "translate to French" (1.5 seconds of audio)
Turn 2: <INPUT>As I walked down the street...</INPUT>
Turn 3: turnComplete
```

**Result**: Gemini has BOTH the audio command AND the text to operate on, in the correct order. It translates the text successfully.

## The Core Principle

**Gemini Live API processes inputs SEQUENTIALLY in the order received:**

1. **Audio must stream FIRST** (as user speaks)
2. **Text context comes SECOND** (after silence detected)
3. **turnComplete comes LAST** (to trigger response)

Sending them out of order causes Gemini to process the text BEFORE it has heard the audio command.

## Why the Working Version Handles Both Modes

### Multimodal Mode (Screen Sharing ON)

```typescript
// init() is called with enableScreenSharing = true
if (enableScreenSharing === true) {
  console.log('[VoiceEdit] Screen sharing enabled - starting capture...')
  await startScreenSharing()
}
```

**What Gemini receives:**
- Video frames at 1 FPS (screen context)
- Audio streaming (voice command)
- Text `<INPUT>` (selected text from clipboard)

Gemini can SEE the screen, HEAR the command, and READ the selected text.

### Text-Only Mode (Screen Sharing OFF)

```typescript
// init() is called with enableScreenSharing = false
if (enableScreenSharing === true) {
  // NOT executed
} else {
  console.log('[VoiceEdit] Screen sharing disabled - using text-only mode')
  isScreenSharing.value = false
}
```

**What Gemini receives:**
- Audio streaming (voice command)
- Text `<INPUT>` (selected text from clipboard)
- NO video frames

Gemini can HEAR the command and READ the selected text, but cannot see the screen.

## Summary of Fixes

### 1. Fixed Timing Issue ✅
- Restored working version that sends audio FIRST, then text context AFTER silence

### 2. Fixed Screen Sharing Logic ✅
- Added explicit check: `if (enableScreenSharing === true)`
- Added clear logging for both modes
- Screen sharing is NOT attempted when disabled

### 3. Fixed getSelectedText() ✅
- Implemented proper clipboard polling (up to 500ms)
- Always restore original clipboard
- Clear logging at each step
- Permission error detection

## Expected Behavior Now

### With Multimodal OFF:
```
[VoiceEdit] Screen sharing disabled - using text-only mode
[VoiceEdit] Starting voice recording...
[VoiceEdit] ✅ Recording started
[User speaks: "translate to French"]
[VoiceEdit] Silence detected - processing...
[ClipboardManager] Getting selected text...
[ClipboardManager] ✅ Got selection after 100 ms
[ClipboardManager] ✅ Restored original clipboard
[VoiceEdit] Got selected text: As I walked down the street...
[VoiceEdit] 📤 Sending INPUT context: <INPUT>...
[GeminiLiveSDK] ✅ Gemini finished response
[VoiceEdit] ✅ Pasted: Alors que je marchais dans la rue...
```

### With Multimodal ON:
```
[VoiceEdit] Screen sharing enabled - starting capture...
[VoiceEdit] ✅ Screen sharing active
[VoiceEdit] Starting voice recording...
[VoiceEdit] ✅ Recording started
[User speaks: "translate to French"]
[VoiceEdit] Silence detected - processing...
[ClipboardManager] Getting selected text...
[ClipboardManager] ✅ Got selection after 100 ms
[VoiceEdit] Got selected text: As I walked down the street...
[VoiceEdit] 📤 Sending INPUT context: <INPUT>...
[GeminiLiveSDK] ✅ Gemini finished response
[VoiceEdit] ✅ Pasted: Alors que je marchais dans la rue...
```

## Lessons Learned

1. **Never send text context before audio completes** - Gemini processes inputs in order
2. **The VAD silence detection is THE trigger** - It marks when audio is complete
3. **Screen sharing is independent** - Video frames stream continuously, text context is sent after silence
4. **Trust the working implementation** - If it was working, understand WHY before changing

## Files Changed

- `src/renderer/composables/useVoiceEdit.ts` - Reverted to working timing logic
- `src/main/clipboard-manager.ts` - Improved getSelectedText() with polling

## Commit to Reference

Working version: `4c86656` - "debug: Add logging to see what context is sent to Gemini"

This commit has the correct timing and should be used as the reference implementation.
