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
        responseModalities: ['TEXT'],
        systemInstruction: VOICE_EDIT_SYSTEM_INSTRUCTION,
        responseSchema: VOICE_EDIT_RESPONSE_SCHEMA,
      })

      // Setup event listeners
      geminiAdapter.on('setupComplete', () => {
        console.log('[VoiceEdit] ✅ Connected to Gemini')
        isConnected.value = true
      })

      let outputText = ''
      geminiAdapter.on('modelTurn', (parts: any[]) => {
        for (const part of parts) {
          if (part.text) {
            outputText += part.text
          }
        }
      })

      geminiAdapter.on('turnComplete', async () => {
        console.log('[VoiceEdit] ✅ Gemini finished response')
        await handleGeminiResponse(outputText)
        outputText = '' // Reset for next response
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

      // Setup screen sharing if enabled
      if (enableScreenSharing) {
        await startScreenSharing()
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

          // Send context
          const contextMessage = `Focus text: "${selectedText.value}"`
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
      console.error('[VoiceEdit] Screen sharing failed:', error.message)
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
      // Use Electron IPC to get selected text via clipboard
      const clipboard = await electronAPI?.getClipboard()
      return clipboard || ''
    } catch (error) {
      console.error('[VoiceEdit] Failed to get selected text:', error)
      return ''
    }
  }

  /**
   * Handle Gemini response and execute appropriate action
   */
  async function handleGeminiResponse(outputText: string) {
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
          // Paste edited text at cursor
          await pasteText(jsonResponse.result)
          break

        case 'query':
          // Speak answer via TTS
          await speakText(jsonResponse.result)
          break

        case 'insert_styled':
          // Insert generated text at cursor
          await pasteText(jsonResponse.result)
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
   * Speak text using browser TTS
   */
  async function speakText(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 0.8
      window.speechSynthesis.speak(utterance)
      console.log('[VoiceEdit] 🔊 Speaking:', text)
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
