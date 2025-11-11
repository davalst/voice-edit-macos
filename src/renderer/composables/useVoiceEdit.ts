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

export function useVoiceEdit() {
  // State
  const isRecording = ref(false)
  const isConnected = ref(false)
  const isScreenSharing = ref(false)
  const lastCommand = ref('')
  const lastResult = ref('')
  const selectedText = ref('')

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
      return
    }

    try {
      console.log('[VoiceEdit] Initializing Gemini connection...')

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
        isConnected.value = true
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

        // Stop recording after receiving response
        stopRecording()

        await handleGeminiResponse(outputText, audioChunks)
        outputText = '' // Reset for next response
        audioChunks = [] // Reset audio chunks
      })

      geminiAdapter.on('error', (error: Error) => {
        console.error('[VoiceEdit] Gemini error:', error.message)
      })

      geminiAdapter.on('close', () => {
        console.log('[VoiceEdit] Connection closed')
        isConnected.value = false
      })

      // Connect to Gemini
      await geminiAdapter.connect()

      // Setup screen sharing ONLY if explicitly enabled
      if (enableScreenSharing === true) {
        console.log('[VoiceEdit] Screen sharing enabled - starting capture...')
        await startScreenSharing()
      } else {
        console.log('[VoiceEdit] Screen sharing disabled - using text-only mode')
        isScreenSharing.value = false
      }
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to initialize:', error.message)
    }
  }

  /**
   * Start voice recording
   */
  async function startRecording() {
    if (!geminiAdapter || !isConnected.value) {
      console.error('[VoiceEdit] Not connected to Gemini')
      return
    }

    try {
      console.log('[VoiceEdit] Starting voice recording...')

      audioRecorder = new AudioRecorder(16000)

      // Stream audio to Gemini
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

      // Detect silence → send context + turnComplete
      audioRecorder.on('silence', async () => {
        if (geminiAdapter && isRecording.value) {
          console.log('[VoiceEdit] Silence detected - processing...')

          // Get selected text from active app
          selectedText.value = await getSelectedTextFromApp()

          // Send context with clear structure
          let contextMessage = ''
          if (selectedText.value.trim()) {
            // Text is selected - provide it as INPUT to operate on
            contextMessage = `<INPUT>\n${selectedText.value}\n</INPUT>`
            console.log('[VoiceEdit] 📤 Sending INPUT context:', contextMessage)
          } else {
            // No text selected - dictation mode
            contextMessage = '<DICTATION_MODE>Transcribe the audio exactly as spoken</DICTATION_MODE>'
            console.log('[VoiceEdit] 📤 Sending DICTATION context')
          }

          geminiAdapter.sendClientContent({
            turns: [{ text: contextMessage }],
            turnComplete: false,
          })

          // Send turnComplete to trigger response
          await geminiAdapter.sendTurnComplete()
        }
      })

      await audioRecorder.start()
      isRecording.value = true

      // Notify main process
      electronAPI?.notifyRecordingStarted()

      console.log('[VoiceEdit] ✅ Recording started')
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to start recording:', error.message)
      isRecording.value = false
    }
  }

  /**
   * Stop voice recording
   */
  function stopRecording() {
    if (audioRecorder) {
      audioRecorder.stop()
      audioRecorder = null
    }

    isRecording.value = false

    // Notify main process
    electronAPI?.notifyRecordingStopped()

    console.log('[VoiceEdit] Recording stopped')
  }

  /**
   * Start screen sharing
   */
  async function startScreenSharing() {
    try {
      console.log('[VoiceEdit] Starting screen sharing...')

      // Check if we're in Electron environment
      if (typeof navigator.mediaDevices?.getDisplayMedia === 'undefined') {
        console.warn('[VoiceEdit] Screen sharing not available in this environment')
        console.warn('[VoiceEdit] This is normal - screen sharing requires Electron desktopCapturer')
        console.warn('[VoiceEdit] Voice editing will work without screen context')
        return
      }

      const stream = await screenCapture.start()

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
    } catch (error: any) {
      console.warn('[VoiceEdit] Screen sharing not available:', error.message)
      console.log('[VoiceEdit] Voice editing will work without screen context')
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
   * Get selected text from active macOS application
   */
  async function getSelectedTextFromApp(): Promise<string> {
    try {
      // Use Electron IPC to get selected text (uses Cmd+C behind the scenes)
      const selectedText = await electronAPI?.getSelectedText()
      console.log('[VoiceEdit] Got selected text:', selectedText?.substring(0, 50) + '...')
      return selectedText || ''
    } catch (error) {
      console.error('[VoiceEdit] Failed to get selected text:', error)
      return ''
    }
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
    } catch (error: any) {
      console.error('[VoiceEdit] Failed to parse response:', error.message)
      console.log('[VoiceEdit] Raw output:', outputText)
    }
  }

  /**
   * Paste text at cursor in active application
   */
  async function pasteText(text: string) {
    electronAPI?.pasteText(text)
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
    init,
    startRecording,
    stopRecording,
    startScreenSharing,
    stopScreenSharing,
    cleanup,
  }
}
