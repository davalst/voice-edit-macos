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
  const isRecording = ref(false)
  const isConnected = ref(false)
  const isScreenSharing = ref(false)
  const lastCommand = ref('')
  const lastResult = ref('')
  const selectedText = ref('')
  const focusedAppName = ref('')
  const isProcessing = ref(false) // Guard to prevent duplicate processing
  const currentMode = ref<RecordingMode>(RecordingMode.IDLE)
  const routeToCommand = ref(false) // true = Fn+Command (commands), false = Fn+Ctrl (dictation/AI classifier)

  // Services
  let geminiAdapter: GeminiLiveSDKAdapter | null = null
  let audioRecorder: AudioRecorder | null = null
  let videoFrameCapturer: VideoFrameCapturer | null = null
  const screenCapture = useScreenCapture()

  // Electron API
  const electronAPI = (window as any).electronAPI

  /**
   * Initialize Gemini connection
   */
  async function init(apiKey: string, enableScreenSharing: boolean = true) {
    if (!apiKey) {
      console.error('[VoiceEdit] No API key provided')
      electronAPI?.log?.('[Renderer] ❌ No API key - cannot initialize')
      return
    }

    try {
      console.log('[VoiceEdit] Initializing Gemini connection...')
      electronAPI?.log?.(`[Renderer] Initializing Gemini with screen sharing: ${enableScreenSharing}`)

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
        electronAPI?.log?.('[Renderer] ✅ Gemini connected successfully')
        isConnected.value = true
        // Ready - waiting for user to press hotkey to start recording
      })

      let outputText = ''
      let audioChunks: string[] = []
      geminiAdapter.on('modelTurn', (parts: any[]) => {
        for (const part of parts) {
          if (part.text) {
            outputText += part.text
          }
          if (part.inlineData?.mimeType === 'audio/pcm') {
            // Collect audio chunks for natural TTS playback
            audioChunks.push(part.inlineData.data)
          }
        }
      })

      geminiAdapter.on('turnComplete', async () => {
        console.log('[VoiceEdit] ✅ Gemini finished response')

        // CRITICAL FIX: Don't stop recording - keep listening for next command
        // This matches Ebben POC behavior for continuous conversation
        // stopRecording() // ← REMOVED

        await handleGeminiResponse(outputText, audioChunks)
        outputText = '' // Reset for next response
        audioChunks = [] // Reset audio chunks

        // CRITICAL FIX: Add delay before resetting isProcessing (like Ebben POC)
        // This prevents VAD from triggering too quickly after paste
        setTimeout(() => {
          isProcessing.value = false
          console.log('[VoiceEdit] ✅ Ready for next command')
        }, 100)
      })

      geminiAdapter.on('error', (error: Error) => {
        console.error('[VoiceEdit] Gemini error:', error.message)
      })

      geminiAdapter.on('close', () => {
        console.log('[VoiceEdit] Connection closed')
        isConnected.value = false
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
      electronAPI?.log?.('[Renderer] ✅ Ready - screen sharing will activate during recording only')
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to initialize:', error.message)
      electronAPI?.log?.(`[Renderer] ❌ Initialization failed: ${error.message}`)
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
      routeToCommand.value = config.routeToCommand // Store routing flag for context message

      console.log('[VoiceEdit] ===== TRACE: startRecordingWithMode called =====')
      console.log('[VoiceEdit] TRACE: Full config object:', JSON.stringify(config, null, 2))
      console.log('[VoiceEdit] 📤 Recording config:')
      console.log('  - Mode:', config.mode)
      console.log('  - Screen capture:', config.enableScreenCapture)
      console.log('  - Route to command:', config.routeToCommand, config.routeToCommand ? '(Fn+Command)' : '(Fn+Ctrl - dictation)')
      console.log('  - Selected text:', selectedText.value?.substring(0, 100) || '(none)')
      console.log('  - Focused app:', focusedAppName.value)

      electronAPI?.log?.(`[Renderer] Starting ${config.mode}, screen=${config.enableScreenCapture}`)

      // SECURITY: Start screen sharing ONLY if mode requires it
      // - STT_SCREEN_HOLD: Fn+Ctrl held = screen ON
      // - STT_SCREEN_TOGGLE: Double-tap Fn+Ctrl = screen ON
      // - STT_ONLY_HOLD: Fn held = screen OFF
      // - STT_ONLY_TOGGLE: Double-tap Fn = screen OFF
      if (config.enableScreenCapture && focusedAppName.value) {
        console.log('[VoiceEdit] Starting screen capture for target app:', focusedAppName.value)
        electronAPI?.log?.(`[Renderer] Screen capture enabled: ${focusedAppName.value}`)

        // Stop any existing screen sharing first
        if (videoFrameCapturer) {
          stopScreenSharing()
        }

        await startScreenSharing(focusedAppName.value)
      } else {
        console.log('[VoiceEdit] Screen capture disabled for this mode')
        electronAPI?.log?.('[Renderer] Screen capture OFF (STT-only mode)')
      }

      // Now start audio recording
      await startAudioRecording()

      // CRITICAL: Send context immediately to prevent Gemini from responding too early
      console.log('[VoiceEdit] ===== TRACE: About to send context to Gemini =====')
      console.log('[VoiceEdit] TRACE: config.routeToCommand =', config.routeToCommand)
      console.log('[VoiceEdit] TRACE: selectedText.value =', selectedText.value ? `"${selectedText.value.substring(0, 50)}..."` : '(empty)')

      if (config.routeToCommand) {
        console.log('[VoiceEdit] TRACE: ✅ BRANCH: Fn+Command mode (routeToCommand = true)')
        // Fn+Command mode - ALWAYS command processing
        if (selectedText.value) {
          console.log('[VoiceEdit] TRACE: ✅ BRANCH: Has selection - sending <INPUT> tags')
          // With selected text: send <INPUT> tags for command processing on text
          console.log('[VoiceEdit] 🎯 Fn+Command mode: Sending <INPUT> context immediately')
          const contextMessage = `<INPUT>${selectedText.value}</INPUT>`
          console.log('[VoiceEdit] TRACE: Context message:', contextMessage.substring(0, 200))
          geminiAdapter?.sendClientContent({
            turns: [{ text: contextMessage }],
            turnComplete: false, // Don't trigger response yet - wait for audio
          })
          console.log('[VoiceEdit] 📤 Sent context:', contextMessage.substring(0, 150))
          electronAPI?.log?.(`[Renderer] Sent <INPUT> context: "${contextMessage.substring(0, 100)}"`)
        } else {
          console.log('[VoiceEdit] TRACE: ✅ BRANCH: NO selection - sending <COMMAND_MODE_NO_SELECTION>')
          // NO selection: Commands can still work using screen/video context
          // Examples: "What's on screen?", "Write a paragraph about AI", etc.
          console.log('[VoiceEdit] 🎯 Fn+Command mode (no selection): Command mode using screen context')
          geminiAdapter?.sendClientContent({
            turns: [{ text: '<COMMAND_MODE_NO_SELECTION>' }],
            turnComplete: false,
          })
          console.log('[VoiceEdit] 📤 Sent <COMMAND_MODE_NO_SELECTION>')
          electronAPI?.log?.('[Renderer] Sent command mode marker (no selection)')
        }
      } else {
        console.log('[VoiceEdit] TRACE: ✅ BRANCH: Fn+Ctrl mode (routeToCommand = false)')
        console.log('[VoiceEdit] TRACE: ✅ BRANCH: Sending <DICTATION_MODE> (ignoring selection)')
        // Fn+Ctrl mode: Always pure STT transcription
        console.log('[VoiceEdit] 📝 Fn+Ctrl mode: Sending <DICTATION_MODE> immediately')
        geminiAdapter?.sendClientContent({
          turns: [{ text: '<DICTATION_MODE>' }],
          turnComplete: false,
        })
        console.log('[VoiceEdit] 📤 Sent <DICTATION_MODE>')
        electronAPI?.log?.('[Renderer] Sent <DICTATION_MODE>')
      }

      console.log('[VoiceEdit] ===== TRACE: Context sending complete =====')
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
      routeToCommand: false,  // Legacy mode defaults to dictation (AI classifier)
      selectedText: preCapturedText || '',
      focusedAppName: appName || ''
    }

    await startRecordingWithMode(config)
  }

  /**
   * Start audio recording
   */
  async function startAudioRecording() {
    if (!geminiAdapter || !isConnected.value) {
      return
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

    // CRITICAL: Silence detection - THEN send context + turnComplete
    // This matches the working Ebben POC pattern exactly
    audioRecorder.on('silence', async () => {
      if (!geminiAdapter || !isRecording.value) return

      // Guard: Prevent duplicate processing
      if (isProcessing.value) {
        console.log('[VoiceEdit] Already processing - ignoring silence')
        return
      }

      isProcessing.value = true
      console.log('[VoiceEdit] 🔕 Silence detected - sending context + turnComplete')
      electronAPI?.log?.(`[Renderer] Silence detected - sending context + turnComplete`)

      try {
        // Context was already sent at recording start for ALL modes
        // Just send turnComplete to trigger Gemini's response
        console.log('[VoiceEdit] 🔕 Silence detected - context already sent, sending turnComplete')
        electronAPI?.log?.('[Renderer] Silence detected - sending turnComplete')

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

    await audioRecorder.start()
    // isRecording.value is already set to true at the start of startRecordingWithMode()

    // Notify main process
    electronAPI?.notifyRecordingStarted()

    console.log('[VoiceEdit] ✅ Recording started - speak when ready')
  }

  /**
   * Stop voice recording
   */
  function stopRecording() {
    // Guard: Prevent stopping if not recording
    if (!isRecording.value) {
      console.log('[VoiceEdit] Not recording, ignoring stop request')
      return
    }

    if (audioRecorder) {
      audioRecorder.stop()
      audioRecorder = null
    }

    isRecording.value = false
    currentMode.value = RecordingMode.IDLE

    // SECURITY: Stop screen sharing when recording stops
    // This ensures screen is only captured while mic is active
    if (isScreenSharing.value) {
      console.log('[VoiceEdit] Stopping screen sharing (recording ended)')
      electronAPI?.log?.('[Renderer] Stopping screen sharing (recording ended)')
      stopScreenSharing()
    }

    // Notify main process
    electronAPI?.notifyRecordingStopped()

    console.log('[VoiceEdit] Recording stopped, mode reset to IDLE')
  }

  /**
   * Start screen sharing
   */
  async function startScreenSharing(targetAppName?: string) {
    try {
      if (targetAppName) {
        console.log('[VoiceEdit] Starting screen sharing for app:', targetAppName)
        electronAPI?.log?.(`[Renderer] Starting screen capture for: ${targetAppName}`)
      } else {
        console.log('[VoiceEdit] Starting screen sharing (full screen)...')
        electronAPI?.log?.('[Renderer] Starting screen capture (full screen)')
      }

      // Start screen capture using Electron's desktopCapturer API
      const stream = await screenCapture.start(targetAppName)
      electronAPI?.log?.('[Renderer] ✅ Screen capture started, initializing video capturer')

      // Initialize video frame capturer
      videoFrameCapturer = new VideoFrameCapturer(base64Jpeg => {
        if (geminiAdapter && isScreenSharing.value) {
          geminiAdapter.sendRealtimeInput({
            media: {
              data: base64Jpeg,
              mimeType: 'image/jpeg',
            },
          })
        }
      }, 1) // 1 FPS

      await videoFrameCapturer.start(stream)
      isScreenSharing.value = true
      console.log('[VoiceEdit] ✅ Screen sharing active')
      electronAPI?.log?.('[Renderer] ✅ Screen sharing ACTIVE - sending frames to Gemini')
    } catch (error: any) {
      console.warn('[VoiceEdit] Screen sharing not available:', error.message)
      console.log('[VoiceEdit] Voice editing will work without screen context')
      electronAPI?.log?.(`[Renderer] ❌ Screen sharing failed: ${error.message}`)
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
    try {
      // Parse JSON response
      let jsonText = outputText.trim()

      // Remove markdown code fences if present
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

      // CRITICAL: Auto-stop recording after response is processed
      // This implements the "one-turn" workflow: Fn → Speak → Pause → Process → Auto-stop
      if (isRecording.value) {
        console.log('[VoiceEdit] ✅ Response processed - auto-stopping recording')
        electronAPI?.log?.('[Renderer] Auto-stopping after response')
        stopRecording()
      }
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to parse response:', error.message)
      console.log('[VoiceEdit] Raw output:', outputText)

      // Auto-stop even on error to prevent stuck recording state
      if (isRecording.value) {
        console.log('[VoiceEdit] ⚠️ Error during processing - auto-stopping recording')
        stopRecording()
      }
    }
  }

  /**
   * Apply dictionary corrections to text
   * Replaces incorrect word variants with correct words
   */
  async function applyDictionary(text: string): Promise<string> {
    try {
      const dictionary = await electronAPI?.dictionaryGetAll?.()
      if (!dictionary || dictionary.length === 0) {
        return text
      }

      let processedText = text
      for (const entry of dictionary) {
        // Replace each incorrect variant with the correct word (case-insensitive)
        for (const incorrectWord of entry.incorrectVariants) {
          const regex = new RegExp(`\\b${incorrectWord}\\b`, 'gi')
          processedText = processedText.replace(regex, entry.correctWord)
        }
      }

      if (processedText !== text) {
        console.log('[VoiceEdit] 📖 Dictionary applied:', { original: text, corrected: processedText })
      }

      return processedText
    } catch (error) {
      console.error('[VoiceEdit] Dictionary error:', error)
      return text
    }
  }

  /**
   * Apply snippet expansions to text
   * Replaces trigger phrases with their expansions
   */
  async function applySnippets(text: string): Promise<string> {
    try {
      const snippets = await electronAPI?.snippetsGetAll?.()
      if (!snippets || snippets.length === 0) {
        return text
      }

      let processedText = text
      for (const snippet of snippets) {
        // Replace trigger with expansion (case-insensitive, whole word match)
        const regex = new RegExp(`\\b${snippet.trigger}\\b`, 'gi')
        processedText = processedText.replace(regex, snippet.expansion)
      }

      if (processedText !== text) {
        console.log('[VoiceEdit] ✂️ Snippets applied:', { original: text, expanded: processedText })
      }

      return processedText
    } catch (error) {
      console.error('[VoiceEdit] Snippets error:', error)
      return text
    }
  }

  /**
   * Paste text at cursor in active application
   * Applies dictionary and snippets before pasting
   */
  async function pasteText(text: string) {
    // Apply dictionary corrections and snippet expansions
    let processedText = await applyDictionary(text)
    processedText = await applySnippets(processedText)

    electronAPI?.pasteText(processedText)
    console.log('[VoiceEdit] ✅ Pasted:', processedText.substring(0, 50))
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
   * Speak text using native macOS say command with Samantha voice
   * This is more reliable than Web Speech API in Electron
   */
  async function speakText(text: string) {
    console.log('[VoiceEdit] 🔊 Speaking with Samantha voice (native macOS):', text)
    // Use native macOS say command via IPC to main process
    // This bypasses Web Speech API limitations in Electron
    electronAPI?.speak?.(text)
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
  }

  return {
    isRecording,
    isConnected,
    isScreenSharing,
    lastCommand,
    lastResult,
    currentMode,
    init,
    startRecording,
    startRecordingWithMode,
    stopRecording,
    startScreenSharing,
    stopScreenSharing,
    cleanup,
  }
}
