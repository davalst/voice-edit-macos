/**
 * Voice Edit Composable
 *
 * Simplified version of MultimodalEditMode.vue - removes all Ebben-specific
 * tool calls and focuses only on general text editing commands.
 *
 * Supported Commands:
 * - EDIT: Text editing and transformations
 * - QUERY: Information queries
 * - INSERT_STYLED: Style-matched insertions
 * - SEARCH: Find and highlight text
 */

import { ref } from 'vue'
import { GeminiLiveSDKAdapter } from '../services/geminiLiveSDKAdapter'
import { AudioRecorder } from '../lib/audio-recorder'
import { VideoFrameCapturer } from '../lib/video-frame-capturer'
import { useScreenCapture } from '../lib/use-screen-capture'
import { VOICE_EDIT_SYSTEM_INSTRUCTION, VOICE_EDIT_RESPONSE_SCHEMA } from '../../../voice-edit-system-instruction'
import { RecordingMode, RecordingStartEvent } from '../../shared/types'

export function useVoiceEdit() {
  // State
  const inRecordMode = ref(false) // NEW: RECORD MODE (idle but ready for F5)
  const isRecording = ref(false) // Actual mic/screen recording (F5 held)
  const isConnected = ref(false)
  const isScreenSharing = ref(false)
  const lastCommand = ref('')
  const lastResult = ref('')
  const selectedText = ref('')
  const focusedAppName = ref('')
  const isProcessing = ref(false) // Guard to prevent duplicate processing
  const currentMode = ref<RecordingMode>(RecordingMode.IDLE)

  // Track chunks sent (for push-to-talk validation)
  let audioChunksSent = 0
  let videoFramesSent = 0

  // Services
  let geminiAdapter: GeminiLiveSDKAdapter | null = null
  let audioRecorder: AudioRecorder | null = null
  let videoFrameCapturer: VideoFrameCapturer | null = null
  const screenCapture = useScreenCapture()

  // Electron API - access lazily to avoid initialization errors during HMR
  const getElectronAPI = () => (window as any).electronAPI

  /**
   * Initialize Gemini connection
   * NOTE: Screen sharing is now per-command (Fn = STT, Fn+Ctrl = Multimodal)
   */
  async function init(apiKey: string) {
    if (!apiKey) {
      console.error('[VoiceEdit] No API key provided')
      getElectronAPI()?.log?.('[Renderer] ❌ No API key - cannot initialize')
      return
    }

    try {
      console.log('[VoiceEdit] Initializing Gemini connection...')
      getElectronAPI()?.log?.('[Renderer] Initializing Gemini (multimodal per-command via Fn+Ctrl)')

      geminiAdapter = new GeminiLiveSDKAdapter({
        apiKey,
        model: 'models/gemini-2.0-flash-exp',
        responseModalities: ['TEXT'], // AUDIO not compatible with responseSchema
        systemInstruction: VOICE_EDIT_SYSTEM_INSTRUCTION,
        responseSchema: VOICE_EDIT_RESPONSE_SCHEMA,
      })

      // Setup event listeners
      geminiAdapter.on('setupComplete', () => {
        console.log('[VoiceEdit] ✅ Connected to Gemini')
        getElectronAPI()?.log?.('[Renderer] ✅ Gemini connected successfully')
        isConnected.value = true
        // Ready - waiting for user to press hotkey to start recording
      })

      let outputText = ''
      let audioChunks: string[] = []
      geminiAdapter.on('modelTurn', (parts: any[]) => {
        console.log('[VoiceEdit] 📥 Received modelTurn with', parts.length, 'parts')
        getElectronAPI()?.log?.(`[Renderer] Received modelTurn with ${parts.length} parts`)

        for (const part of parts) {
          if (part.text) {
            console.log('[VoiceEdit] 📝 Text part:', part.text.substring(0, 100))
            outputText += part.text
          }
          if (part.inlineData?.mimeType === 'audio/pcm') {
            // Collect audio chunks for natural TTS playback
            console.log('[VoiceEdit] 🔊 Audio part received')
            audioChunks.push(part.inlineData.data)
          }
        }
        console.log('[VoiceEdit] 📊 Total output so far:', outputText.length, 'chars')
      })

      geminiAdapter.on('turnComplete', async () => {
        console.log('[VoiceEdit] ✅ Gemini finished response')
        console.log('[VoiceEdit] 📊 Final outputText length:', outputText.length, 'chars')
        console.log('[VoiceEdit] 📄 Final outputText:', outputText.substring(0, 200))
        getElectronAPI()?.log?.(`[Renderer] Gemini response: ${outputText.substring(0, 200)}`)

        // Guard: Skip if outputText is empty (stale/duplicate turnComplete)
        if (!outputText || outputText.trim().length === 0) {
          console.log('[VoiceEdit] ⚠️ Ignoring turnComplete - outputText is empty')
          return
        }

        await handleGeminiResponse(outputText, audioChunks)
        outputText = '' // Reset for next response
        audioChunks = [] // Reset audio chunks

        // Reset isProcessing flag
        isProcessing.value = false

        // STAY in RECORD MODE after response (wait for next Fn press or Ctrl+Space to exit)
        if (inRecordMode.value) {
          console.log('[VoiceEdit] ✅ Ready for next Fn key press (staying in RECORD MODE)')
          console.log('[VoiceEdit] 💡 Press Fn to speak again, or Ctrl+Space to exit mode')
        } else {
          console.log('[VoiceEdit] ✅ Ready for next command')
        }
      })

      geminiAdapter.on('error', (error: Error) => {
        console.error('[VoiceEdit] Gemini error:', error.message)
      })

      geminiAdapter.on('close', () => {
        console.log('[VoiceEdit] Connection closed')
        isConnected.value = false
      })

      geminiAdapter.on('reconnected' as any, () => {
        console.log('[VoiceEdit] ✅ Connection restored to Gemini')
        isConnected.value = true
        // You can add UI notification here: "Connection restored"
      })

      geminiAdapter.on('reconnect-failed' as any, (error: Error) => {
        console.error('[VoiceEdit] ❌ Failed to reconnect:', error.message)
        isConnected.value = false
        // You can add UI notification here: "Connection lost. Please check Settings."
      })

      // Connect to Gemini (wait for setup to complete)
      await geminiAdapter.connect()

      // Wait for setupComplete event to ensure Gemini is fully ready
      await new Promise<void>((resolve) => {
        if (isConnected.value) {
          resolve() // Already connected
        } else {
          const checkConnection = () => {
            if (isConnected.value) {
              resolve()
            } else {
              setTimeout(checkConnection, 100)
            }
          }
          checkConnection()
        }
      })

      // SECURITY: Do NOT start screen sharing automatically
      // Screen sharing will only start when recording begins (Control+Space pressed)
      console.log('[VoiceEdit] ✅ Initialization complete - screen sharing will start on first recording')
      getElectronAPI()?.log?.('[Renderer] ✅ Ready - screen sharing will activate during recording only')
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to initialize:', error.message)
      getElectronAPI()?.log?.(`[Renderer] ❌ Initialization failed: ${error.message}`)
    }
  }

  /**
   * Start voice recording with multi-mode support
   */
  async function startRecordingWithMode(config: RecordingStartEvent) {
    if (!geminiAdapter || !isConnected.value) {
      console.error('[VoiceEdit] Not connected to Gemini')
      return
    }

    // Guard: Prevent starting if already recording
    if (isRecording.value) {
      console.log('[VoiceEdit] Already recording, ignoring start request')
      return
    }

    // Set recording flag immediately to prevent race conditions
    isRecording.value = true

    try {
      console.log('[VoiceEdit] Starting recording with mode:', config.mode)

      // Update state
      currentMode.value = config.mode
      selectedText.value = config.selectedText || ''
      focusedAppName.value = config.focusedAppName || ''

      console.log('[VoiceEdit] 📤 Recording config:')
      console.log('  - Mode:', config.mode)
      console.log('  - Screen capture enabled:', config.enableScreenCapture)
      console.log('  - Selected text:', selectedText.value?.substring(0, 100) || '(none)')
      console.log('  - Focused app:', focusedAppName.value)

      getElectronAPI()?.log?.(`[Renderer] Starting ${config.mode}, screen=${config.enableScreenCapture}`)

      // ✅ FIXED: Respect the enableScreenCapture flag for dual-mode support
      // Fn only (STT) → enableScreenCapture: false (mic only)
      // Fn+Ctrl (Multimodal) → enableScreenCapture: true (mic + screen)
      if (config.enableScreenCapture) {
        console.log('[VoiceEdit] 🎥 Starting screen capture (multimodal mode)')
        getElectronAPI()?.log?.('[Renderer] Starting screen capture for multimodal mode')

        // Stop any existing screen sharing first
        if (videoFrameCapturer) {
          stopScreenSharing()
        }

        // Start screen capture (focusedAppName can be empty for full screen)
        await startScreenSharing(focusedAppName.value || undefined)
        console.log('[VoiceEdit] ✅ Screen capture active')
      } else {
        console.log('[VoiceEdit] 🎤 STT mode - NO screen capture (audio only)')
        getElectronAPI()?.log?.('[Renderer] STT mode - screen capture disabled')
      }

      // Start audio recording
      await startAudioRecording()
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to start recording:', error.message)
      isProcessing.value = false
    }
  }

  /**
   * Start voice recording (legacy - for Control+Space)
   */
  async function startRecording(preCapturedText?: string, appName?: string) {
    // Legacy mode: Always enable screen capture (backward compatibility)
    const config: RecordingStartEvent = {
      mode: RecordingMode.STT_SCREEN_HOLD,
      enableScreenCapture: true,
      isToggleMode: false,
      selectedText: preCapturedText || '',
      focusedAppName: appName || ''
    }

    await startRecordingWithMode(config)
  }

  /**
   * Start audio recording
   */
  async function startAudioRecording() {
    // CRITICAL: Don't silently fail - throw error if not connected
    if (!geminiAdapter) {
      const error = 'Gemini adapter not initialized'
      console.error('[VoiceEdit] ❌', error)
      throw new Error(error)
    }

    if (!isConnected.value) {
      const error = 'Not connected to Gemini. Connection may have been lost.'
      console.error('[VoiceEdit] ❌', error)
      throw new Error(error)
    }

    console.log('[VoiceEdit] 🎤 === AUDIO RECORDING START ===')
    console.log('[VoiceEdit] Creating AudioRecorder (16kHz)')

    // Reset chunk counter
    audioChunksSent = 0

    // Start audio recording
    // CRITICAL: Disable VAD for push-to-hold modes (manual key release triggers processing)
    const isPushToHold = currentMode.value === RecordingMode.STT_ONLY_HOLD ||
                         currentMode.value === RecordingMode.STT_SCREEN_HOLD
    const enableVAD = !isPushToHold  // Only enable VAD for toggle modes

    console.log(`[VoiceEdit] VAD ${enableVAD ? 'ENABLED' : 'DISABLED'} for mode: ${currentMode.value}`)
    audioRecorder = new AudioRecorder(16000, enableVAD)

    // Stream audio to Gemini continuously
    let audioChunkCount = 0
    audioRecorder.on('data', (base64Audio: string) => {
      audioChunkCount++

      // ALWAYS log chunks for debugging
      console.log(`[VoiceEdit] 🎵 Audio chunk #${audioChunkCount}: ${base64Audio.length} chars (isRecording: ${isRecording.value})`)

      if (geminiAdapter && isRecording.value) {
        console.log(`[VoiceEdit] 📤 Sending audio chunk #${audioChunkCount} to Gemini`)
        geminiAdapter.sendRealtimeInput({
          media: {
            data: base64Audio,
            mimeType: 'audio/pcm;rate=16000',
          },
        })
        audioChunksSent++  // Track successful sends
      } else {
        console.warn(`[VoiceEdit] ⏹️ DROPPED buffered chunk #${audioChunkCount} (isRecording=${isRecording.value}, adapter=${!!geminiAdapter})`)
      }
    })

    // CRITICAL FOR PUSH-TO-HOLD: Do NOT register VAD silence handler
    // In push-to-hold mode, key release triggers processing, not silence detection
    // (VAD is only used for toggle modes, registered separately)
    console.log('[VoiceEdit] 🎤 Starting microphone capture...')

    await audioRecorder.start()
    console.log('[VoiceEdit] ✅ Microphone active and streaming')

    // Notify main process
    getElectronAPI()?.notifyRecordingStarted()
  }

  /**
   * Stop voice recording
   */
  function stopRecording() {
    // Guard: Prevent duplicate stops
    if (!isRecording.value) {
      console.log('[VoiceEdit] Not recording, ignoring stop request')
      return
    }

    console.log('[VoiceEdit] 🛑 Stopping recording...')

    // Stop audio recording
    if (audioRecorder) {
      audioRecorder.stop()
      audioRecorder = null
      console.log('[VoiceEdit] 🎤 Audio recorder stopped')
    }

    // SECURITY: Stop screen sharing when recording stops
    if (isScreenSharing.value) {
      console.log('[VoiceEdit] 🎥 Stopping screen sharing (recording ended)')
      stopScreenSharing()
    }

    // Update state
    isRecording.value = false
    currentMode.value = RecordingMode.IDLE

    // Reset chunk counters for next recording
    audioChunksSent = 0
    videoFramesSent = 0

    // Notify main process
    getElectronAPI()?.notifyRecordingStopped()

    console.log('[VoiceEdit] ✅ Recording stopped completely')
  }

  /**
   * Start screen sharing
   */
  async function startScreenSharing(targetAppName?: string) {
    try {
      console.log('[VoiceEdit] 🎥 Starting screen capture for:', targetAppName || 'entire screen')

      // Reset video frame counter
      videoFramesSent = 0

      // Start screen capture
      const stream = await screenCapture.start(targetAppName)

      // Initialize video frame capturer for SINGLE FRAME capture
      videoFrameCapturer = new VideoFrameCapturer((base64Jpeg: string) => {
        // Callback fires once with a single frame

        videoFramesSent++
        console.log(`[VoiceEdit] 📸 Single video frame captured: ${base64Jpeg.length} chars`)

        if (geminiAdapter && isRecording.value && isScreenSharing.value) {
          console.log(`[VoiceEdit] 📤 Sending single frame to Gemini`)
          geminiAdapter.sendRealtimeInput({
            media: {
              data: base64Jpeg,
              mimeType: 'image/jpeg',
            },
          })
        } else {
          console.warn(`[VoiceEdit] ⚠️ Cannot send frame - not recording or no adapter`)
        }
      }, 1) // FPS parameter unused in single frame mode

      // Start in SINGLE FRAME mode (captures one frame and stops)
      await videoFrameCapturer.start(stream, true)
      isScreenSharing.value = true

      console.log('[VoiceEdit] ✅ Screen capture ACTIVE (single frame mode)')
      console.log('[VoiceEdit] 📸 One frame captured showing highlighted text')
    } catch (error: any) {
      console.warn('[VoiceEdit] ⚠️ Screen sharing failed:', error.message)
      console.log('[VoiceEdit] Voice editing will work in audio-only mode')
      isScreenSharing.value = false
    }
  }

  /**
   * Stop screen sharing
   */
  function stopScreenSharing() {
    if (videoFrameCapturer) {
      videoFrameCapturer.stop()
      videoFrameCapturer = null
    }

    screenCapture.stop()
    isScreenSharing.value = false
    console.log('[VoiceEdit] Screen sharing stopped')
  }


  /**
   * Handle Gemini response and execute appropriate action
   */
  async function handleGeminiResponse(outputText: string, audioChunks: string[] = []) {
    console.log('[VoiceEdit] 🔄 handleGeminiResponse called with outputText length:', outputText.length)
    getElectronAPI()?.log?.(`[Renderer] handleGeminiResponse called with ${outputText.length} chars`)

    // Guard: Check if outputText is empty
    if (!outputText || outputText.trim().length === 0) {
      console.log('[VoiceEdit] ⚠️ Empty response from Gemini - nothing to process')
      getElectronAPI()?.log?.('[Renderer] ⚠️ Empty Gemini response')
      return
    }

    try {
      // Parse JSON response
      let jsonText = outputText.trim()
      console.log('[VoiceEdit] 🔍 Attempting to parse JSON from:', jsonText.substring(0, 200))

      // Remove markdown code fences if present
      if (jsonText.startsWith('```')) {
        const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (match) {
          jsonText = match[1].trim()
          console.log('[VoiceEdit] 🧹 Stripped markdown fences')
        }
      }

      const jsonResponse = JSON.parse(jsonText)
      console.log('[VoiceEdit] 📋 Parsed response:', {
        action: jsonResponse.action,
        resultLength: jsonResponse.result?.length || 0,
        confidence: jsonResponse.confidence
      })

      // CRITICAL: Validate response has actual content
      if (!jsonResponse.result || jsonResponse.result.trim() === '') {
        console.error('[VoiceEdit] ❌ Gemini returned empty result!')
        console.error('[VoiceEdit] Possible causes:')
        console.error('  1. Recording was too short or no speech detected')
        console.error('  2. Gemini could not understand the audio')
        console.error('  3. Context was insufficient (video/text missing)')
        console.error('  4. API error or rate limiting')

        // Don't paste empty string - show error instead
        console.error('[VoiceEdit] 💡 TIP: Speak clearly and hold key for at least 1 second')
        return
      }

      lastCommand.value = 'Voice command processed'
      lastResult.value = jsonResponse.result?.substring(0, 100) || ''

      // Execute action based on type
      switch (jsonResponse.action) {
        case 'edit':
          // Paste edited text at cursor (add space at end for dictation flow)
          await pasteText(jsonResponse.result + ' ')
          break

        case 'query':
          // Speak answer via TTS (use Gemini audio if available, otherwise browser TTS)
          if (audioChunks.length > 0) {
            await playGeminiAudio(audioChunks)
          } else {
            await speakText(jsonResponse.result)
          }
          break

        case 'insert_styled':
          // Insert generated text at cursor (add space at end)
          await pasteText(jsonResponse.result + ' ')
          console.log('[VoiceEdit] Style analysis:', jsonResponse.analysis)
          break

        case 'search':
          // Highlight search results (limited in Electron without DOM access to active app)
          console.log('[VoiceEdit] Search:', jsonResponse.searchQuery, jsonResponse.searchType)
          await speakText(`Found matches for ${jsonResponse.searchQuery}`)
          break

        default:
          console.warn('[VoiceEdit] Unknown action:', jsonResponse.action)
      }
    } catch (error: any) {
      console.error('[VoiceEdit] ❌ Failed to parse response:', error.message)
      console.error('[VoiceEdit] 📄 Raw output:', outputText)
      console.error('[VoiceEdit] 🔍 Error stack:', error.stack)
      getElectronAPI()?.log?.(`[Renderer] ❌ Parse error: ${error.message}`)
      getElectronAPI()?.log?.(`[Renderer] Raw output: ${outputText}`)
    }
  }

  /**
   * Paste text at cursor in active application
   */
  async function pasteText(text: string) {
    getElectronAPI()?.pasteText(text)
    console.log('[VoiceEdit] ✅ Pasted:', text.substring(0, 50))
  }

  /**
   * Play Gemini's natural TTS audio (PCM audio chunks)
   */
  async function playGeminiAudio(audioChunks: string[]) {
    try {
      console.log('[VoiceEdit] 🔊 Playing Gemini audio:', audioChunks.length, 'chunks')

      // Convert base64 PCM chunks to playable audio
      const audioContext = new AudioContext({ sampleRate: 24000 })

      for (const base64Audio of audioChunks) {
        const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))
        const int16Array = new Int16Array(audioData.buffer)

        // Convert Int16 PCM to Float32 for Web Audio API
        const float32Array = new Float32Array(int16Array.length)
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0
        }

        // Create audio buffer
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000)
        audioBuffer.copyToChannel(float32Array, 0)

        // Play audio
        const source = audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContext.destination)
        source.start()

        // Wait for audio to finish
        await new Promise<void>(resolve => {
          source.onended = () => resolve()
        })
      }

      audioContext.close()
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to play Gemini audio:', error.message)
      console.warn('[VoiceEdit] Falling back to browser TTS')
    }
  }

  /**
   * Speak text using browser TTS (fallback)
   */
  async function speakText(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 0.8
      window.speechSynthesis.speak(utterance)
      console.log('[VoiceEdit] 🔊 Speaking (browser TTS):', text)
    } else {
      console.warn('[VoiceEdit] Speech synthesis not supported')
    }
  }

  /**
   * Enter RECORD MODE (idle, waiting for Fn key)
   */
  function enterRecordMode(context?: { selectedText?: string; focusedAppName?: string }) {
    console.log('[VoiceEdit] Entering RECORD MODE (hold Fn to talk)')
    getElectronAPI()?.log?.('[Renderer] Entered RECORD MODE - waiting for Fn key')

    // CRITICAL: Capture context NOW (from Ctrl+Space, before Fn press)
    selectedText.value = context?.selectedText || ''
    focusedAppName.value = context?.focusedAppName || ''

    console.log('[VoiceEdit] 📝 Context captured at mode entry:')
    console.log('  - Selected text:', selectedText.value.substring(0, 50) || '(none)')
    console.log('  - Focused app:', focusedAppName.value)

    // SAFETY: Reset isProcessing flag to prevent stuck state
    // This ensures clean state when entering RECORD MODE
    if (isProcessing.value) {
      console.log('[VoiceEdit] ⚠️ Resetting stuck isProcessing flag on RECORD MODE entry')
      isProcessing.value = false
    }

    inRecordMode.value = true

    // Notify main process to start Fn key monitoring
    getElectronAPI()?.notifyRecordModeEntered?.()
  }

  /**
   * Exit RECORD MODE (return to idle)
   */
  function exitRecordMode() {
    console.log('[VoiceEdit] Exiting RECORD MODE')
    getElectronAPI()?.log?.('[Renderer] Exited RECORD MODE')

    // Stop recording if currently active
    if (isRecording.value) {
      stopRecording()
    }

    inRecordMode.value = false
    selectedText.value = ''
    focusedAppName.value = ''

    // Notify main process to stop Fn key monitoring
    getElectronAPI()?.notifyRecordModeExited?.()
  }

  /**
   * Manual trigger for push-to-hold mode (called when key released)
   * This replaces VAD auto-send for hold modes
   */
  async function manualTriggerProcessing() {
    if (!isRecording.value) {
      console.log('[VoiceEdit] Not recording, ignoring manual trigger')
      return
    }

    if (isProcessing.value) {
      console.log('[VoiceEdit] Already processing, ignoring manual trigger')
      return
    }

    console.log('[VoiceEdit] 🎯 Key released - manually triggering processing')
    isProcessing.value = true

    // CRITICAL CHECK 1: Verify we sent audio chunks
    console.log('[VoiceEdit] 📊 Chunks sent:', {
      audio: audioChunksSent,
      video: videoFramesSent,
      mode: currentMode.value,
      screenSharing: isScreenSharing.value
    })

    if (audioChunksSent === 0) {
      console.error('[VoiceEdit] ❌ ABORTING - No audio chunks were sent to Gemini')
      console.error('[VoiceEdit] Possible causes:')
      console.error('  1. Recording duration too short (need at least 500ms)')
      console.error('  2. Microphone permission denied or not working')
      console.error('  3. Connection to Gemini lost during recording')
      console.error('  4. Audio recorder failed to capture audio')

      // Reset state and stop
      isProcessing.value = false
      await stopRecording()

      // Show error to user (you can add UI notification here)
      console.error('[VoiceEdit] 💡 TIP: Hold the key for at least 1 second while speaking')
      return
    }

    console.log('[VoiceEdit] ✅ Validation passed - proceeding with processing')
    console.log(`[VoiceEdit] Will send turnComplete for ${audioChunksSent} audio chunks`)

    // CRITICAL: Send text context BEFORE turnComplete to tell Gemini the mode
    // STT mode (no selected text) → <DICTATION_MODE> tag for exact transcription
    // Multimodal mode (with selected text) → <INPUT> tag for editing
    if (selectedText.value && selectedText.value.trim().length > 0) {
      // Multimodal mode: editing selected text
      console.log('[VoiceEdit] 📝 Sending selected text context for editing:', selectedText.value.substring(0, 50))
      geminiAdapter!.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: `<INPUT>${selectedText.value}</INPUT>` }]
        }]
      })
    } else {
      // STT mode: dictation (exact transcription)
      console.log('[VoiceEdit] 🎤 Sending DICTATION_MODE tag for exact transcription')
      geminiAdapter!.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text: '<DICTATION_MODE>Transcribe exactly what was spoken.</DICTATION_MODE>' }]
        }]
      })
    }

    try {
      console.log('[VoiceEdit] 📤 Sending turnComplete to Gemini...')
      const sent = await geminiAdapter!.sendTurnComplete()

      if (!sent) {
        console.error('[VoiceEdit] ❌ Failed to send turnComplete')
        isProcessing.value = false
        await stopRecording()
        return
      }

      console.log('[VoiceEdit] ✅ turnComplete sent successfully')
      console.log('[VoiceEdit] 🎧 Waiting for Gemini response...')
    } catch (error: any) {
      console.error('[VoiceEdit] ❌ Error sending turnComplete:', error.message)
      isProcessing.value = false
      await stopRecording()
      return
    }

    // CRITICAL: Stop audio/video streaming IMMEDIATELY to prevent sending more chunks
    // But keep the WebSocket connection open (don't disconnect from Gemini)
    console.log('[VoiceEdit] 🛑 Stopping audio/video capture (keeping WebSocket open)')

    // FIRST: Set flag to false to prevent data event handler from sending buffered chunks
    isRecording.value = false

    // THEN: Stop audio recorder (may still emit buffered chunks, but handler will skip them)
    if (audioRecorder) {
      audioRecorder.stop()
      audioRecorder = null
      console.log('[VoiceEdit] 🎤 Audio recorder stopped')
    }

    // Stop screen sharing
    if (isScreenSharing.value) {
      console.log('[VoiceEdit] 🎥 Stopping screen sharing')
      stopScreenSharing()
    }

    console.log('[VoiceEdit] ⏸️ Capture stopped, waiting for Gemini response...')
  }

  /**
   * Cleanup all resources
   */
  function cleanup() {
    stopRecording()
    stopScreenSharing()

    if (geminiAdapter) {
      geminiAdapter.disconnect()
      geminiAdapter = null
    }

    isConnected.value = false
    inRecordMode.value = false
  }

  return {
    inRecordMode,
    isRecording,
    isConnected,
    isScreenSharing,
    selectedText,      // ✅ Export for App.vue to use in mode selection
    focusedAppName,    // ✅ Export for App.vue to use in mode selection
    lastCommand,
    lastResult,
    currentMode,
    init,
    startRecording,
    startRecordingWithMode,
    stopRecording,
    enterRecordMode,
    exitRecordMode,
    manualTriggerProcessing,
    startScreenSharing,
    stopScreenSharing,
    cleanup,
  }
}
