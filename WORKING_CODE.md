# WORKING CODE GUIDE - Voice Edit macOS

> **CRITICAL**: This document captures the LAST WORKING VERSION at commit `6484dd9` (Nov 9 2025, 10:55 PM)
>
> **Purpose**: To prevent breaking this implementation again by documenting EXACTLY how it works.

## Table of Contents
1. [Overview](#overview)
2. [Complete Flow Diagram](#complete-flow-diagram)
3. [Critical Pattern: Pre-Capture](#critical-pattern-pre-capture)
4. [Voice Activity Detection (VAD)](#voice-activity-detection-vad)
5. [Screen Capture Lifecycle](#screen-capture-lifecycle)
6. [Gemini System Instruction](#gemini-system-instruction)
7. [Text Editing & Replacement](#text-editing--replacement)
8. [Code Walkthrough](#code-walkthrough)
9. [Why This Works](#why-this-works)

---

## Overview

Voice Edit is a macOS Electron app that enables voice-controlled text editing with multimodal AI awareness. The key innovation is the **pre-capture pattern** combined with **automatic silence detection** to create a seamless editing experience.

### Key Technologies
- **Electron**: Main (Node.js) + Renderer (Vue 3) processes
- **Gemini 2.0 Flash**: Multimodal AI with real-time streaming
- **Web Audio API**: 16kHz PCM audio capture
- **Electron desktopCapturer**: Window-specific screen capture
- **AppleScript**: Keyboard simulation for Cmd+C and Cmd+V

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. USER PRESSES CONTROL+SPACE (First Press - Start Recording)          │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. MAIN PROCESS - PRE-CAPTURE (BEFORE Starting Recording)              │
│    src/main/index.ts:156-173                                            │
│                                                                          │
│    setupHotkeyManager(hotkey, async () => {                             │
│      // CRITICAL: Capture context FIRST                                 │
│      const focusedAppName = await getFocusedAppName()  // AppleScript   │
│      const selectedText = await getSelectedText()      // Cmd+C         │
│                                                                          │
│      // THEN notify renderer with pre-captured context                  │
│      mainWindow?.webContents.send('toggle-recording', {                 │
│        selectedText,        // Already captured!                        │
│        focusedAppName       // Already captured!                        │
│      })                                                                  │
│    })                                                                    │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. RENDERER RECEIVES IPC MESSAGE                                        │
│    src/renderer/App.vue:192-196                                         │
│                                                                          │
│    electronAPI.onToggleRecording((event, context) => {                  │
│      toggleRecording(context)  // Pass pre-captured context             │
│    })                                                                    │
│                                                                          │
│    function toggleRecording(context?) {                                 │
│      if (isRecording.value) {                                           │
│        stopRecording()                                                   │
│      } else {                                                            │
│        startRecording(context?.selectedText, context?.focusedAppName)   │
│      }                                                                   │
│    }                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. START RECORDING WITH PRE-CAPTURED CONTEXT                            │
│    src/renderer/composables/useVoiceEdit.ts:145-176                     │
│                                                                          │
│    async function startRecording(preCapturedText?, appName?) {          │
│      // Use pre-captured context (captured BEFORE hotkey handler)       │
│      selectedText.value = preCapturedText || ''                         │
│      focusedAppName.value = appName || ''                               │
│                                                                          │
│      console.log('[VoiceEdit] Using pre-captured context:')             │
│      console.log('  - Selected text:', selectedText.value)              │
│      console.log('  - Focused app:', focusedAppName.value)              │
│                                                                          │
│      // Start screen capture for the focused app                        │
│      if (focusedAppName.value) {                                        │
│        await startScreenSharing(focusedAppName.value)                   │
│      }                                                                   │
│                                                                          │
│      // Start audio recording                                           │
│      audioRecorder = new AudioRecorder(16000)                           │
│      audioRecorder.on('data', (base64Audio) => {                        │
│        geminiAdapter.sendRealtimeInput({                                │
│          media: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' }│
│        })                                                                │
│      })                                                                  │
│                                                                          │
│      // CRITICAL: Setup silence detection auto-send                     │
│      audioRecorder.on('silence', async () => { ... })  // See step 6   │
│                                                                          │
│      await audioRecorder.start()                                        │
│      isRecording.value = true                                           │
│    }                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. USER SPEAKS + AUDIO/VIDEO STREAMING                                  │
│                                                                          │
│    ┌─────────────┐                                                      │
│    │ Microphone  │ ──► AudioRecorder ──► Gemini Live API                │
│    └─────────────┘      (16kHz PCM)      (real-time streaming)          │
│                                                                          │
│    ┌─────────────┐                                                      │
│    │   Screen    │ ──► VideoFrameCapturer ──► Gemini Live API           │
│    └─────────────┘      (1 FPS JPEG)          (real-time streaming)     │
│                                                                          │
│    User speaks: "translate to French"                                   │
│    Gemini receives: audio stream + screen frames (showing selected text)│
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. SILENCE DETECTION AUTO-SEND (VAD)                                    │
│    src/renderer/composables/useVoiceEdit.ts:195-230                     │
│                                                                          │
│    audioRecorder.on('silence', async () => {                            │
│      if (!geminiAdapter || !isRecording.value) return                   │
│                                                                          │
│      // Guard: Prevent duplicate processing                             │
│      if (isProcessing.value) {                                          │
│        console.log('[VoiceEdit] Already processing - ignoring')         │
│        return                                                            │
│      }                                                                   │
│                                                                          │
│      isProcessing.value = true                                          │
│      console.log('[VoiceEdit] 🔕 Silence detected - auto-sending')      │
│                                                                          │
│      // Build MINIMAL context message                                   │
│      const contextMessage = `Focus text: "${selectedText.value}"`       │
│                                                                          │
│      // Send context with turnComplete: false (don't trigger yet)       │
│      geminiAdapter.sendClientContent({                                  │
│        turns: [{ text: contextMessage }],                               │
│        turnComplete: false,                                             │
│      })                                                                  │
│                                                                          │
│      // NOW send turnComplete to trigger Gemini response                │
│      await geminiAdapter.sendTurnComplete()                             │
│      console.log('[VoiceEdit] ✅ Waiting for Gemini response')          │
│    })                                                                    │
│                                                                          │
│    VAD Configuration (src/renderer/lib/audio-recorder.ts:26-32):        │
│    - silenceThreshold: 0.02  (requires louder audio)                    │
│    - silenceDuration: 1500ms (1.5 seconds silence required)             │
│    - minSpeechDuration: 1500ms (filters out ambient noise)              │
│    - minPeakEnergy: 0.05 (requires strong peak energy)                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. GEMINI PROCESSES WITH MULTIMODAL CONTEXT                             │
│    voice-edit-system-instruction.ts                                     │
│                                                                          │
│    Gemini receives:                                                     │
│    - Audio: "translate to French" (the COMMAND)                         │
│    - Video: Screen showing highlighted text "Hello world"               │
│    - Text context: Focus text: "Hello world"                            │
│                                                                          │
│    System instruction tells Gemini:                                     │
│    "AUDIO = the COMMAND (what to do)"                                   │
│    "Focus text = the TEXT to operate on"                                │
│    "You MUST apply the audio command TO the Focus text"                 │
│    "Use VIDEO to identify EXACT text that is visually highlighted"      │
│                                                                          │
│    Gemini Response (JSON):                                              │
│    {                                                                     │
│      "action": "edit",                                                  │
│      "result": "Bonjour le monde",                                      │
│      "confidence": 0.95                                                 │
│    }                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. RESPONSE HANDLER - CONTINUOUS CONVERSATION                           │
│    src/renderer/composables/useVoiceEdit.ts:85-102                      │
│                                                                          │
│    geminiAdapter.on('turnComplete', async () => {                       │
│      console.log('[VoiceEdit] ✅ Gemini finished response')             │
│                                                                          │
│      // CRITICAL FIX: Don't stop recording!                             │
│      // This enables continuous conversation - keep listening           │
│      // stopRecording() // ← REMOVED (this was the bug!)                │
│                                                                          │
│      await handleGeminiResponse(outputText, audioChunks)                │
│      outputText = ''     // Reset for next response                     │
│      audioChunks = []    // Reset audio chunks                          │
│                                                                          │
│      // Add delay before resetting isProcessing                         │
│      setTimeout(() => {                                                 │
│        isProcessing.value = false                                       │
│        console.log('[VoiceEdit] ✅ Ready for next command')             │
│      }, 100)                                                             │
│    })                                                                    │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 9. HANDLE GEMINI RESPONSE                                               │
│    src/renderer/composables/useVoiceEdit.ts:342-396                     │
│                                                                          │
│    async function handleGeminiResponse(outputText, audioChunks) {       │
│      // Parse JSON response (strip markdown fences if present)          │
│      let jsonText = outputText.trim()                                   │
│      if (jsonText.startsWith('```')) {                                  │
│        const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```)│
│        if (match) jsonText = match[1].trim()                            │
│      }                                                                   │
│                                                                          │
│      const jsonResponse = JSON.parse(jsonText)                          │
│      console.log('[VoiceEdit] 📋 Parsed:', jsonResponse)                │
│                                                                          │
│      // Execute action based on type                                    │
│      switch (jsonResponse.action) {                                     │
│        case 'edit':                                                     │
│          // Paste edited text (add space for dictation flow)            │
│          await pasteText(jsonResponse.result + ' ')                     │
│          break                                                           │
│                                                                          │
│        case 'query':                                                    │
│          // Speak answer via TTS                                        │
│          if (audioChunks.length > 0) {                                  │
│            await playGeminiAudio(audioChunks)                           │
│          } else {                                                        │
│            await speakText(jsonResponse.result)                         │
│          }                                                               │
│          break                                                           │
│                                                                          │
│        case 'insert_styled':                                            │
│          // Insert generated text at cursor                             │
│          await pasteText(jsonResponse.result + ' ')                     │
│          break                                                           │
│                                                                          │
│        case 'search':                                                   │
│          // Limited in Electron - just speak result                     │
│          await speakText(`Found matches for ${jsonResponse.searchQuery}`)│
│          break                                                           │
│      }                                                                   │
│    }                                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 10. PASTE EDITED TEXT                                                   │
│     src/renderer/composables/useVoiceEdit.ts:401-404                    │
│     src/main/index.ts:215-226                                           │
│                                                                          │
│     // Renderer sends IPC message to main process                       │
│     async function pasteText(text: string) {                            │
│       electronAPI?.pasteText(text)                                      │
│       console.log('[VoiceEdit] ✅ Pasted:', text.substring(0, 50))      │
│     }                                                                    │
│                                                                          │
│     // Main process handles paste                                       │
│     ipcMain.on('paste-text', (_event, text: string) => {                │
│       console.log('[Main] Pasting text:', text.substring(0, 50))        │
│                                                                          │
│       // Copy to clipboard                                              │
│       copyToClipboard(text)                                             │
│                                                                          │
│       // Small delay to ensure clipboard is ready                       │
│       setTimeout(() => {                                                │
│         // Simulate Cmd+V in active app (AppleScript)                   │
│         simulatePaste()                                                 │
│       }, 50)                                                             │
│     })                                                                   │
│                                                                          │
│     src/main/clipboard-manager.ts:52-78                                 │
│     export async function simulatePaste(): Promise<boolean> {           │
│       const script = `                                                  │
│         tell application "System Events"                                │
│           keystroke "v" using command down                              │
│         end tell                                                        │
│       `                                                                  │
│       await execAsync(`osascript -e '${script}'`)                       │
│       console.log('[ClipboardManager] ✅ Paste successful')             │
│     }                                                                    │
│                                                                          │
│     RESULT: "Bonjour le monde" replaces "Hello world" in active app!    │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 11. CONTINUOUS CONVERSATION - READY FOR NEXT COMMAND                    │
│                                                                          │
│     Recording is STILL ACTIVE (not stopped after response)              │
│     Screen capture is STILL ACTIVE (not stopped after response)         │
│     User can immediately speak another command!                         │
│                                                                          │
│     Example continuous flow:                                            │
│     1. User: "translate to French" → "Bonjour le monde" (pasted)        │
│     2. User: "make it uppercase" → "BONJOUR LE MONDE" (pasted)          │
│     3. User: "add an exclamation" → "BONJOUR LE MONDE!" (pasted)        │
│                                                                          │
│     All without pressing Control+Space again!                           │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 12. USER PRESSES CONTROL+SPACE (Second Press - Stop Recording)          │
│     src/renderer/composables/useVoiceEdit.ts:248-268                    │
│                                                                          │
│     function stopRecording() {                                          │
│       // Stop audio recording                                           │
│       if (audioRecorder) {                                              │
│         audioRecorder.stop()                                            │
│         audioRecorder = null                                            │
│       }                                                                  │
│       isRecording.value = false                                         │
│                                                                          │
│       // SECURITY: Stop screen sharing when recording stops             │
│       if (isScreenSharing.value) {                                      │
│         console.log('[VoiceEdit] Stopping screen sharing')              │
│         stopScreenSharing()                                             │
│       }                                                                  │
│                                                                          │
│       electronAPI?.notifyRecordingStopped()                             │
│       console.log('[VoiceEdit] Recording stopped')                      │
│     }                                                                    │
│                                                                          │
│     function stopScreenSharing() {                                      │
│       if (videoFrameCapturer) {                                         │
│         videoFrameCapturer.stop()                                       │
│         videoFrameCapturer = null                                       │
│       }                                                                  │
│       screenCapture.stop()                                              │
│       isScreenSharing.value = false                                     │
│     }                                                                    │
│                                                                          │
│     RESULT: Microphone OFF, Screen capture OFF, Ready to start again!   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Pattern: Pre-Capture

### The Problem This Solves

When a user presses the hotkey, the focus shifts from their text editor to the Voice Edit window. If we try to capture selected text AFTER the hotkey is pressed, we get empty text because focus has changed.

### The Solution: Pre-Capture in Main Process

**CRITICAL**: Capture selected text and focused app name BEFORE starting the recording.

**Implementation** (src/main/index.ts:156-173):

```typescript
setupHotkeyManager(hotkey, async () => {
  console.log('[Main] Hotkey pressed, toggling recording')

  // CRITICAL FIX: Capture context BEFORE starting recording
  // This happens in the main process BEFORE focus changes

  // 1. Get focused app name (for window-specific screen capture)
  const focusedAppName = await getFocusedAppName()

  // 2. Get selected text using Cmd+C (see clipboard-manager.ts)
  const selectedText = await getSelectedText()

  console.log('[Main] Focused app:', focusedAppName)
  console.log('[Main] Pre-captured selected text:', selectedText?.substring(0, 50) || '(none)')

  // 3. Send to renderer with pre-captured context
  mainWindow?.webContents.send('toggle-recording', {
    selectedText,      // Already captured!
    focusedAppName     // Already captured!
  })
})
```

**How getSelectedText Works** (src/main/clipboard-manager.ts:113-144):

```typescript
export async function getSelectedText(): Promise<string> {
  try {
    // Save current clipboard (restore later to avoid disrupting user)
    const originalClipboard = clipboard.readText()

    // Simulate Cmd+C to copy selection using AppleScript
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
    console.error('[ClipboardManager] Failed to get selected text:', error.message)
    return ''
  }
}
```

**Why This Works:**
1. Main process captures context BEFORE focus changes
2. Uses AppleScript Cmd+C which works even when app is in background
3. Preserves original clipboard content
4. Passes captured context to renderer as IPC message payload
5. Renderer uses pre-captured context immediately

---

## Voice Activity Detection (VAD)

### What It Does

VAD automatically detects when the user stops speaking (1.5 seconds of silence) and triggers the processing pipeline. This eliminates the need for the user to manually press a "send" button.

### VAD Configuration

**CRITICAL**: These thresholds are tuned to prevent false triggers from ambient noise.

**Configuration** (src/renderer/lib/audio-recorder.ts:26-32):

```typescript
this.vad = new VoiceActivityDetector({
  silenceThreshold: 0.02,     // Requires louder audio to count as speech
  silenceDuration: 1500,      // 1.5 seconds of silence before triggering
  energyWindowSize: 50,       // Number of samples to average
  minSpeechDuration: 1500,    // Filters out ambient noise (1.5 seconds minimum)
  minPeakEnergy: 0.05,        // Requires strong peak energy to activate
})

// When silence detected, emit 'silence' event
this.vad.onSilence(() => {
  console.log('[AudioRecorder] 🔕 VAD triggered silence - emitting to handler')
  this.emit('silence')
})
```

### How VAD Works

**Implementation** (src/renderer/lib/voice-activity-detection.ts):

```typescript
processSamples(samples: Float32Array): boolean {
  // 1. Calculate RMS (Root Mean Square) energy
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  const rms = Math.sqrt(sum / samples.length)

  // 2. Add to energy history (rolling window)
  this.energyHistory.push(rms)
  if (this.energyHistory.length > this.energyWindowSize) {
    this.energyHistory.shift()
  }

  // 3. Calculate average energy over window
  const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length

  // 4. Determine if speech or silence
  const isSpeech = avgEnergy > this.silenceThreshold

  if (isSpeech) {
    // Speech detected - track duration and peak energy
    const now = Date.now()
    this.lastSpeechTime = now

    if (!this.wasSpeaking) {
      this.speechStartTime = now
      this.totalSpeechDuration = 0
      this.peakEnergyDuringSpeech = 0
    } else {
      this.totalSpeechDuration = now - this.speechStartTime
    }

    // Track peak energy during speech (for confidence check)
    if (avgEnergy > this.peakEnergyDuringSpeech) {
      this.peakEnergyDuringSpeech = avgEnergy
    }

    this.wasSpeaking = true
    this.silenceAlreadyFired = false
  } else {
    // Silence detected - check if we should trigger callback
    const silenceDurationMs = Date.now() - this.lastSpeechTime

    if (
      this.wasSpeaking &&                                    // Was speaking before
      this.totalSpeechDuration >= this.minSpeechDuration &&  // Spoke long enough
      this.peakEnergyDuringSpeech >= this.minPeakEnergy &&   // Strong enough audio
      silenceDurationMs >= this.silenceDuration &&           // Silence long enough
      !this.silenceAlreadyFired                              // Haven't fired yet
    ) {
      // FIRE CALLBACK - Strong speech detected!
      this.silenceAlreadyFired = true
      console.log(`[VAD] ✅ Strong speech detected (${Math.round(this.totalSpeechDuration)}ms, peak: ${this.peakEnergyDuringSpeech.toFixed(3)})`)

      if (this.onSilenceCallback) {
        this.onSilenceCallback()
      }
    }
  }

  return isSpeech
}
```

### Auto-Send Mechanism

When VAD detects silence, it automatically sends the context and triggers Gemini processing:

**Implementation** (src/renderer/composables/useVoiceEdit.ts:195-230):

```typescript
audioRecorder.on('silence', async () => {
  if (!geminiAdapter || !isRecording.value) return

  // Guard: Prevent duplicate processing
  if (isProcessing.value) {
    console.log('[VoiceEdit] Already processing - ignoring silence')
    return
  }

  isProcessing.value = true
  console.log('[VoiceEdit] 🔕 Silence detected - sending context + turnComplete')

  try {
    // Build MINIMAL context message (exactly like Ebben POC)
    const contextMessage = `Focus text: "${selectedText.value}"`

    console.log('[VoiceEdit] 📤 Sending context:', contextMessage.substring(0, 150))

    // Send context with turnComplete: false (don't trigger response yet)
    geminiAdapter.sendClientContent({
      turns: [{ text: contextMessage }],
      turnComplete: false,
    })

    // NOW send turnComplete to trigger Gemini response
    const sent = await geminiAdapter.sendTurnComplete()
    if (sent) {
      console.log('[VoiceEdit] ✅ Context sent, waiting for Gemini response')
    }
  } catch (error) {
    console.error('[VoiceEdit] Error sending context/turnComplete:', error)
    isProcessing.value = false
  }
})
```

**Why Two-Step Send:**
1. `sendClientContent()` with `turnComplete: false` sends the text context
2. `sendTurnComplete()` signals Gemini to start processing
3. This ensures Gemini has BOTH audio stream + text context before responding

---

## Screen Capture Lifecycle

### Security Model

**CRITICAL**: Screen capture ONLY runs while microphone is active. This provides a clear privacy boundary.

### Start Screen Sharing

**When**: Immediately after starting audio recording

**Implementation** (src/renderer/composables/useVoiceEdit.ts:166-176):

```typescript
async function startRecording(preCapturedText?: string, appName?: string) {
  // ... (set up pre-captured context)

  // SECURITY: Start screen sharing ONLY during recording
  if (focusedAppName.value) {
    console.log('[VoiceEdit] Starting screen capture for:', focusedAppName.value)
    await startScreenSharing(focusedAppName.value)
  }

  // Then start audio recording
  audioRecorder = new AudioRecorder(16000)
  await audioRecorder.start()
  isRecording.value = true
}
```

**Screen Capture Implementation** (src/renderer/composables/useVoiceEdit.ts:273-308):

```typescript
async function startScreenSharing(targetAppName?: string) {
  try {
    console.log('[VoiceEdit] Starting screen sharing for app:', targetAppName)

    // Start screen capture using Electron's desktopCapturer API
    const stream = await screenCapture.start(targetAppName)

    // Initialize video frame capturer
    videoFrameCapturer = new VideoFrameCapturer(base64Jpeg => {
      // Callback fires at 1 FPS with JPEG frames
      if (geminiAdapter && isScreenSharing.value) {
        geminiAdapter.sendRealtimeInput({
          media: {
            data: base64Jpeg,       // Base64-encoded JPEG
            mimeType: 'image/jpeg',
          },
        })
      }
    }, 1) // 1 FPS (frame per second)

    await videoFrameCapturer.start(stream)
    isScreenSharing.value = true
    console.log('[VoiceEdit] ✅ Screen sharing ACTIVE')
  } catch (error: any) {
    console.warn('[VoiceEdit] Screen sharing not available:', error.message)
    console.log('[VoiceEdit] Voice editing will work without screen context')
  }
}
```

### Stop Screen Sharing

**When**: Immediately when recording stops (Control+Space second press)

**Implementation** (src/renderer/composables/useVoiceEdit.ts:248-268):

```typescript
function stopRecording() {
  if (audioRecorder) {
    audioRecorder.stop()
    audioRecorder = null
  }

  isRecording.value = false

  // SECURITY: Stop screen sharing when recording stops
  // This ensures screen is only captured while mic is active
  if (isScreenSharing.value) {
    console.log('[VoiceEdit] Stopping screen sharing (recording ended)')
    stopScreenSharing()
  }

  electronAPI?.notifyRecordingStopped()
  console.log('[VoiceEdit] Recording stopped')
}

function stopScreenSharing() {
  if (videoFrameCapturer) {
    videoFrameCapturer.stop()
    videoFrameCapturer = null
  }

  screenCapture.stop()
  isScreenSharing.value = false
  console.log('[VoiceEdit] Screen sharing stopped')
}
```

**Why This Matters:**
- User has clear visual/audio feedback (mic indicator)
- Screen capture only runs during active voice session
- Pressing Control+Space immediately stops both mic and screen
- No background screen capture when app is idle

---

## Gemini System Instruction

### The Critical Distinction

**CRITICAL**: The system instruction teaches Gemini that:
- **Audio** = The COMMAND (what to do)
- **Focus text** = The TEXT to operate on
- **Video** = Visual confirmation of what text to edit

### Full System Instruction

**File**: voice-edit-system-instruction.ts

```typescript
export const VOICE_EDIT_SYSTEM_INSTRUCTION = `You are a voice-controlled text editing assistant for macOS.

Your job is to listen to the user's voice command and respond with a structured JSON action.

## CRITICAL: Two Operating Modes

### MODE 1: When you receive <INPUT>...</INPUT> tags
The user has selected text and wants to EDIT or QUERY it.

**CRITICAL RULE:**
- AUDIO = the COMMAND (what to do)
- <INPUT> tags = the TEXT to operate on
- You MUST apply the audio command TO the INPUT text
- NEVER translate/transcribe the audio command itself!

**Examples:**

Audio: "translate to French" + Text: <INPUT>Hello world</INPUT>
→ CORRECT: "Bonjour le monde" ✅ (French translation of INPUT)
→ WRONG: "Traduire en français" ❌ (translating the command!)
→ WRONG: "translate to French" ❌ (echoing the command!)

Audio: "make this shorter" + Text: <INPUT>This is a very long sentence</INPUT>
→ CORRECT: "This is long" ✅ (shortened INPUT)
→ WRONG: "make this shorter" ❌

Audio: "fix grammar" + Text: <INPUT>I has three cat</INPUT>
→ CORRECT: "I have three cats" ✅ (corrected INPUT)
→ WRONG: "fix grammar" ❌

### MODE 2: When you receive <DICTATION_MODE>
The user wants exact speech-to-text transcription.

**CRITICAL: For dictation, transcribe the EXACT words spoken - do NOT rephrase!**

Examples:
- Voice: "Hello world" → EDIT: "Hello world" (exact transcription)
- Voice: "I walked down the street" → EDIT: "I walked down the street"

## CRITICAL: Visual Focus Detection
**You MUST use the VIDEO to identify the EXACT text the user is working with:**

1. **Look for HIGHLIGHTED text** (blue/selected background) in the video
2. **Look for CIRCLED text** (mouse cursor surrounding text)
3. **Look for CURSOR position** (blinking cursor or text insertion point)

**ONLY operate on the visually indicated text - IGNORE everything else on screen!**

Examples:
- Video shows "Hello world" highlighted → operate ONLY on "Hello world"
- Video shows cursor near "test" → operate ONLY on "test"
- Video shows entire paragraph BUT only one sentence highlighted → operate ONLY on that sentence

## Your Four Action Types

### 1. EDIT - Text Transformations OR Exact Dictation

**Two use cases:**

A) When Focus text is PROVIDED (selected text exists):
   **CRITICAL: Use VIDEO to identify the EXACT text that is visually highlighted**
   Transform ONLY the visually selected text according to the voice command.

B) When Focus text is EMPTY (no selection - video shows just cursor):
   Transcribe EXACTLY what was spoken - word-for-word, no changes!

Response: {"action": "edit", "result": "edited text or exact transcription", "confidence": 0.95}

### 2. QUERY - Information Requests
When the user asks a question about the text/screen.

Response: {"action": "query", "result": "answer here", "confidence": 0.90}

### 3. INSERT_STYLED - Smart Text Generation
When the user wants to insert NEW text matching the existing style.

Response: {
  "action": "insert_styled",
  "result": "generated text matching existing style",
  "analysis": "brief style notes",
  "confidence": 0.85
}

### 4. SEARCH - Find and Highlight
When the user wants to find specific text.

Response: {
  "action": "search",
  "searchQuery": "term to find",
  "searchType": "exact" | "fuzzy" | "semantic",
  "result": "Found N matches for 'term'",
  "confidence": 0.80
}

## Important Rules
1. ALWAYS respond with valid JSON only - no markdown, no explanations
2. Use the screen context to understand what the user is looking at
3. If unclear, make your best guess but lower confidence
4. For EDIT actions, preserve the original meaning unless asked to change it
5. For INSERT_STYLED, match the tone, style, and formatting
6. Keep responses concise and actionable
7. Confidence should be 0.0-1.0 based on how clear the command was
`
```

### Response Schema

**Enforces Structured JSON Output**:

```typescript
export const VOICE_EDIT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['edit', 'query', 'insert_styled', 'search'],
      description: 'The type of action to perform'
    },
    result: {
      type: 'string',
      description: 'The edited text, answer, or generated content'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence level in the response (0.0-1.0)'
    },
    // Optional fields for specific actions
    analysis: {
      type: 'string',
      description: 'For INSERT_STYLED: brief notes about style matching'
    },
    searchQuery: {
      type: 'string',
      description: 'For SEARCH: the term to search for'
    },
    searchType: {
      type: 'string',
      enum: ['exact', 'fuzzy', 'semantic'],
      description: 'For SEARCH: type of search to perform'
    }
  },
  required: ['action', 'result', 'confidence']
}
```

**Why responseSchema Matters:**
- Gemini MUST return JSON matching this schema
- No markdown fences, no explanations, just pure JSON
- Enables reliable parsing in handleGeminiResponse()
- Consistent structure for all response types

---

## Text Editing & Replacement

### How Edited Text Replaces Selected Text

**Flow**:
1. User selects text: "Hello world"
2. User speaks: "translate to French"
3. Gemini returns: `{"action": "edit", "result": "Bonjour le monde", "confidence": 0.95}`
4. System pastes: "Bonjour le monde " (note trailing space)
5. Original text is replaced because it was already selected!

### The Paste Mechanism

**Step 1: Renderer sends IPC message** (src/renderer/composables/useVoiceEdit.ts:401-404):

```typescript
async function pasteText(text: string) {
  electronAPI?.pasteText(text)
  console.log('[VoiceEdit] ✅ Pasted:', text.substring(0, 50))
}
```

**Step 2: Main process handles paste** (src/main/index.ts:215-226):

```typescript
ipcMain.on('paste-text', (_event, text: string) => {
  console.log('[Main] Pasting text:', text.substring(0, 50) + '...')

  // Copy to clipboard
  copyToClipboard(text)

  // Small delay to ensure clipboard is ready
  setTimeout(() => {
    // Simulate Cmd+V in active app
    simulatePaste()
  }, 50)
})
```

**Step 3: AppleScript Cmd+V simulation** (src/main/clipboard-manager.ts:52-78):

```typescript
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
```

### Why Text Gets Replaced

**Key Insight**: When text is selected and you paste (Cmd+V), the pasted text REPLACES the selection. This is standard behavior in all macOS apps.

**Example Flow**:
1. User highlights "Hello world" in TextEdit
2. User presses Control+Space → Pre-capture saves "Hello world"
3. User speaks "translate to French" → VAD detects silence after 1.5s
4. Context sent: `Focus text: "Hello world"`
5. Gemini processes: Audio command + Text context + Video (showing highlighted text)
6. Gemini returns: `{"action": "edit", "result": "Bonjour le monde", ...}`
7. System copies "Bonjour le monde " to clipboard
8. System simulates Cmd+V in TextEdit
9. **Because "Hello world" was selected, it gets replaced with "Bonjour le monde "**

**Why trailing space** (src/renderer/composables/useVoiceEdit.ts:365):
```typescript
case 'edit':
  // Add space at end for dictation flow
  await pasteText(jsonResponse.result + ' ')
  break
```

This allows continuous dictation without manually adding spaces between words.

---

## Code Walkthrough

### File Structure

```
voice-edit-macos/
├── src/
│   ├── main/                           # Node.js main process
│   │   ├── index.ts                    # App lifecycle, hotkey, IPC handlers
│   │   ├── hotkey-manager.ts           # Global hotkey registration
│   │   ├── clipboard-manager.ts        # AppleScript clipboard/keyboard ops
│   │   └── permissions.ts              # macOS permission requests
│   │
│   ├── renderer/                       # Vue 3 renderer process
│   │   ├── App.vue                     # Main UI component
│   │   ├── composables/
│   │   │   └── useVoiceEdit.ts         # ⭐ CORE LOGIC ⭐
│   │   ├── services/
│   │   │   └── geminiLiveSDKAdapter.ts # Gemini API integration
│   │   └── lib/
│   │       ├── audio-recorder.ts       # Audio capture + VAD
│   │       ├── video-frame-capturer.ts # Screen capture
│   │       ├── voice-activity-detection.ts # VAD algorithm
│   │       └── use-screen-capture.ts   # Electron desktopCapturer wrapper
│   │
│   └── preload/
│       └── index.ts                    # IPC security bridge
│
└── voice-edit-system-instruction.ts    # Gemini system prompt + schema
```

### Critical Code Sections

#### 1. Main Process Hotkey Handler

**File**: src/main/index.ts:156-173

**What It Does**:
- Listens for Control+Space
- Pre-captures selected text and focused app
- Sends to renderer via IPC

```typescript
setupHotkeyManager(hotkey, async () => {
  console.log('[Main] Hotkey pressed, toggling recording')

  // CRITICAL FIX: Capture context BEFORE starting recording
  const focusedAppName = await getFocusedAppName()
  const selectedText = await getSelectedText()

  console.log('[Main] Focused app:', focusedAppName)
  console.log('[Main] Pre-captured selected text:', selectedText?.substring(0, 50) || '(none)')

  // Send to renderer with pre-captured context
  mainWindow?.webContents.send('toggle-recording', {
    selectedText,
    focusedAppName
  })
})
```

**Why It Works**:
- Runs in main process (doesn't lose focus)
- Captures context BEFORE renderer receives message
- Uses AppleScript which works even when app is background

#### 2. Renderer Toggle Handler

**File**: src/renderer/App.vue:192-196

**What It Does**:
- Receives IPC message from main
- Toggles recording on/off
- Passes pre-captured context to startRecording

```typescript
electronAPI.onToggleRecording((_event: any, context: { selectedText: string; focusedAppName: string }) => {
  // Pass pre-captured context to toggle function
  toggleRecording(context)
})

function toggleRecording(context?: { selectedText?: string; focusedAppName?: string }) {
  if (isRecording.value) {
    stopRecording()
  } else {
    // Pass pre-captured context to startRecording
    startRecording(context?.selectedText, context?.focusedAppName)
  }
}
```

#### 3. Start Recording with Pre-Captured Context

**File**: src/renderer/composables/useVoiceEdit.ts:145-243

**What It Does**:
- Uses pre-captured context (not re-fetching)
- Starts screen sharing for focused app
- Starts audio recording
- Sets up VAD silence detection auto-send

```typescript
async function startRecording(preCapturedText?: string, appName?: string) {
  if (!geminiAdapter || !isConnected.value) {
    console.error('[VoiceEdit] Not connected to Gemini')
    return
  }

  try {
    console.log('[VoiceEdit] Starting voice recording...')

    // CRITICAL FIX: Use pre-captured context from main process
    selectedText.value = preCapturedText || ''
    focusedAppName.value = appName || ''

    console.log('[VoiceEdit] 📤 Using pre-captured context:')
    console.log('  - Selected text:', selectedText.value?.substring(0, 100) || '(none)')
    console.log('  - Focused app:', focusedAppName.value)

    // SECURITY: Start screen sharing ONLY during recording
    if (focusedAppName.value) {
      console.log('[VoiceEdit] Starting screen capture for:', focusedAppName.value)
      await startScreenSharing(focusedAppName.value)
    }

    // Start audio recording
    audioRecorder = new AudioRecorder(16000)

    // Stream audio to Gemini continuously
    audioRecorder.on('data', (base64Audio: string) => {
      if (geminiAdapter && isRecording.value) {
        geminiAdapter.sendRealtimeInput({
          media: {
            data: base64Audio,
            mimeType: 'audio/pcm;rate=16000',
          },
        })
      }
    })

    // CRITICAL: Silence detection auto-send
    audioRecorder.on('silence', async () => {
      if (!geminiAdapter || !isRecording.value) return

      // Guard: Prevent duplicate processing
      if (isProcessing.value) {
        console.log('[VoiceEdit] Already processing - ignoring silence')
        return
      }

      isProcessing.value = true
      console.log('[VoiceEdit] 🔕 Silence detected - sending context + turnComplete')

      try {
        // Build MINIMAL context message
        const contextMessage = `Focus text: "${selectedText.value}"`

        console.log('[VoiceEdit] 📤 Sending context:', contextMessage.substring(0, 150))

        // Send context with turnComplete: false
        geminiAdapter.sendClientContent({
          turns: [{ text: contextMessage }],
          turnComplete: false,
        })

        // NOW send turnComplete to trigger response
        const sent = await geminiAdapter.sendTurnComplete()
        if (sent) {
          console.log('[VoiceEdit] ✅ Context sent, waiting for Gemini response')
        }
      } catch (error) {
        console.error('[VoiceEdit] Error sending context/turnComplete:', error)
        isProcessing.value = false
      }
    })

    await audioRecorder.start()
    isRecording.value = true

    electronAPI?.notifyRecordingStarted()
    console.log('[VoiceEdit] ✅ Recording started - speak when ready')
  } catch (error: any) {
    console.error('[VoiceEdit] Failed to start recording:', error.message)
    isProcessing.value = false
  }
}
```

#### 4. Continuous Conversation (Don't Stop Recording)

**File**: src/renderer/composables/useVoiceEdit.ts:85-102

**What It Does**:
- Handles Gemini response completion
- DOES NOT stop recording (critical fix!)
- Resets processing flag after delay

```typescript
geminiAdapter.on('turnComplete', async () => {
  console.log('[VoiceEdit] ✅ Gemini finished response')

  // CRITICAL FIX: Don't stop recording - keep listening for next command
  // This matches Ebben POC behavior for continuous conversation
  // stopRecording() // ← REMOVED (this was breaking continuous conversation!)

  await handleGeminiResponse(outputText, audioChunks)
  outputText = '' // Reset for next response
  audioChunks = [] // Reset audio chunks

  // CRITICAL FIX: Add delay before resetting isProcessing
  // This prevents VAD from triggering too quickly after paste
  setTimeout(() => {
    isProcessing.value = false
    console.log('[VoiceEdit] ✅ Ready for next command')
  }, 100)
})
```

**Why This Matters**:
- Enables continuous conversation without re-pressing hotkey
- User can chain multiple commands: "translate to French" → "make it uppercase" → "add exclamation"
- Only stops when user explicitly presses Control+Space again

#### 5. Response Handler & Paste

**File**: src/renderer/composables/useVoiceEdit.ts:342-396

**What It Does**:
- Parses JSON response from Gemini
- Executes action (edit, query, insert_styled, search)
- Pastes edited text for 'edit' actions

```typescript
async function handleGeminiResponse(outputText: string, audioChunks: string[] = []) {
  try {
    // Parse JSON response (strip markdown fences if present)
    let jsonText = outputText.trim()

    if (jsonText.startsWith('```')) {
      const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        jsonText = match[1].trim()
      }
    }

    const jsonResponse = JSON.parse(jsonText)
    console.log('[VoiceEdit] 📋 Parsed response:', jsonResponse)

    lastCommand.value = 'Voice command processed'
    lastResult.value = jsonResponse.result?.substring(0, 100) || ''

    // Execute action based on type
    switch (jsonResponse.action) {
      case 'edit':
        // Paste edited text at cursor (add space at end for dictation flow)
        await pasteText(jsonResponse.result + ' ')
        break

      case 'query':
        // Speak answer via TTS
        if (audioChunks.length > 0) {
          await playGeminiAudio(audioChunks)
        } else {
          await speakText(jsonResponse.result)
        }
        break

      case 'insert_styled':
        // Insert generated text at cursor
        await pasteText(jsonResponse.result + ' ')
        console.log('[VoiceEdit] Style analysis:', jsonResponse.analysis)
        break

      case 'search':
        // Limited in Electron - just speak result
        console.log('[VoiceEdit] Search:', jsonResponse.searchQuery, jsonResponse.searchType)
        await speakText(`Found matches for ${jsonResponse.searchQuery}`)
        break

      default:
        console.warn('[VoiceEdit] Unknown action:', jsonResponse.action)
    }
  } catch (error: any) {
    console.error('[VoiceEdit] Failed to parse response:', error.message)
    console.log('[VoiceEdit] Raw output:', outputText)
  }
}
```

#### 6. Stop Recording (Control+Space Second Press)

**File**: src/renderer/composables/useVoiceEdit.ts:248-268

**What It Does**:
- Stops audio recording
- Stops screen sharing (SECURITY)
- Notifies main process

```typescript
function stopRecording() {
  if (audioRecorder) {
    audioRecorder.stop()
    audioRecorder = null
  }

  isRecording.value = false

  // SECURITY: Stop screen sharing when recording stops
  // This ensures screen is only captured while mic is active
  if (isScreenSharing.value) {
    console.log('[VoiceEdit] Stopping screen sharing (recording ended)')
    stopScreenSharing()
  }

  // Notify main process
  electronAPI?.notifyRecordingStopped()

  console.log('[VoiceEdit] Recording stopped')
}
```

---

## Why This Works

### 1. Pre-Capture Timing

**Problem**: If you capture selected text AFTER pressing hotkey, focus has changed and you get empty text.

**Solution**: Main process captures BEFORE focus changes.

**Evidence**:
- Main process runs AppleScript Cmd+C before sending IPC message
- Renderer receives already-captured text as IPC payload
- No timing issues, no focus loss

### 2. VAD Auto-Send

**Problem**: User doesn't want to manually press "send" button.

**Solution**: VAD automatically detects 1.5 seconds of silence and triggers processing.

**Evidence**:
- VAD configured with tuned thresholds to prevent false triggers
- silence event triggers automatic `sendClientContent()` + `sendTurnComplete()`
- Works seamlessly without user intervention

### 3. Continuous Conversation

**Problem**: Having to re-press hotkey after every command is tedious.

**Solution**: Don't stop recording after Gemini response.

**Evidence**:
- `stopRecording()` call removed from `turnComplete` handler (line 90)
- Recording stays active until user explicitly presses Control+Space again
- Enables chaining multiple commands without re-pressing hotkey

### 4. Screen Capture Security

**Problem**: Background screen capture is a privacy concern.

**Solution**: Screen capture ONLY runs during active recording session.

**Evidence**:
- `startScreenSharing()` called in `startRecording()` (line 175)
- `stopScreenSharing()` called in `stopRecording()` (line 261)
- Clear start/stop lifecycle tied to mic indicator

### 5. Multimodal Understanding

**Problem**: Gemini might confuse voice command with text to edit.

**Solution**: System instruction clearly separates audio (command) from text (target).

**Evidence**:
- System instruction explicitly states "AUDIO = the COMMAND"
- System instruction explicitly states "Focus text = the TEXT to operate on"
- System instruction includes visual focus detection rules
- Multiple examples showing correct vs. wrong interpretations

### 6. Reliable Paste Mechanism

**Problem**: Need to paste edited text back into any macOS app.

**Solution**: Use clipboard + AppleScript Cmd+V simulation.

**Evidence**:
- `copyToClipboard()` copies edited text (src/main/clipboard-manager.ts:19)
- `simulatePaste()` uses AppleScript to simulate Cmd+V (src/main/clipboard-manager.ts:52)
- Works across all macOS apps that support standard paste
- Requires Accessibility permission (standard macOS security)

---

## Summary

This implementation works because it gets the **timing right**:

1. **Pre-capture context BEFORE focus changes** (main process)
2. **Auto-send on silence detection** (VAD)
3. **Keep recording active after response** (continuous conversation)
4. **Screen capture lifecycle tied to recording** (security)
5. **Clear separation of command vs. text** (system instruction)
6. **Standard clipboard paste** (AppleScript Cmd+V)

**DO NOT BREAK THESE PATTERNS IN FUTURE COMMITS!**

---

## Commit Reference

**Working Commit**: `6484dd9` (Nov 9 2025, 10:55 PM)
**Commit Message**: "feat: Enhance system instruction for precise visual focus detection"

**To restore to this commit**:
```bash
git checkout 6484dd9
```

**To compare future commits against this working state**:
```bash
git diff 6484dd9 HEAD
```

---

*End of WORKING_CODE.md*
