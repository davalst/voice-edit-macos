/**
 * Gemini Live SDK Adapter
 *
 * Wraps the official @google/genai SDK for multimodal live streaming.
 * Based on proven implementation from GeminiMultimodalTest.vue.
 *
 * Key Features:
 * - Uses official Google GenAI SDK (not manual WebSocket)
 * - Three-layer protection for turnComplete signals
 * - Event-driven architecture for UI integration
 * - Handles audio (PCM 16kHz) and video (JPEG base64) streaming
 */

import { EventEmitter } from 'eventemitter3'
import { GoogleGenAI } from '@google/genai'

export interface GeminiLiveConfig {
  apiKey: string
  model?: string
  responseModalities?: string[]
  systemInstruction?: string
  responseSchema?: any
}

export interface GeminiLiveEvents {
  setupComplete: () => void
  modelTurn: (parts: any[]) => void
  turnComplete: () => void
  error: (error: Error) => void
  open: () => void
  close: (event: CloseEvent) => void
  message: (message: any) => void
}

/**
 * Adapter for Gemini Live API using official SDK
 * Extracted from GeminiMultimodalTest.vue (lines 115-210)
 */
export class GeminiLiveSDKAdapter extends EventEmitter<GeminiLiveEvents> {
  private client: GoogleGenAI | null = null
  private session: any = null // SDK session type
  private isConnected = false

  // Three-layer protection state
  private isGeminiResponding = false
  private lastGeminiResponseTime = 0
  private lastUserTurnCompleteTime = 0

  // Configuration
  private config: GeminiLiveConfig

  constructor(config: GeminiLiveConfig) {
    super()
    this.config = {
      model: 'models/gemini-2.0-flash-exp',
      responseModalities: ['TEXT'],
      ...config,
    }
  }

  /**
   * Connect to Gemini Live API using SDK
   * Based on GeminiMultimodalTest.vue lines 134-210
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn('[GeminiLiveSDK] Already connected')
      return
    }

    try {
      console.log('[GeminiLiveSDK] Initializing Google GenAI client...')
      this.client = new GoogleGenAI({ apiKey: this.config.apiKey })

      const sdkConfig: any = {
        responseModalities: this.config.responseModalities,
      }

      // Add system instruction if provided
      if (this.config.systemInstruction) {
        sdkConfig.systemInstruction = this.config.systemInstruction
      }

      // Add response schema if provided (for structured JSON output)
      if (this.config.responseSchema) {
        sdkConfig.responseSchema = this.config.responseSchema
        sdkConfig.responseMimeType = 'application/json'
      }

      console.log('[GeminiLiveSDK] Connecting to Gemini Live API...', {
        hasSystemInstruction: !!this.config.systemInstruction,
        hasResponseSchema: !!this.config.responseSchema,
      })
      this.session = await this.client.live.connect({
        model: this.config.model!,
        config: sdkConfig,
        callbacks: {
          onopen: () => {
            console.log('[GeminiLiveSDK] ✅ WebSocket connected!')
            this.isConnected = true
            this.emit('open')
          },
          onmessage: async (message: any) => {
            console.log('[GeminiLiveSDK] Received:', JSON.stringify(message, null, 2))
            this.emit('message', message)

            if (message.setupComplete) {
              console.log('[GeminiLiveSDK] ✅ Setup complete!')
              this.emit('setupComplete')
            }

            if (message.serverContent?.modelTurn?.parts) {
              const parts = message.serverContent.modelTurn.parts
              console.log(`[GeminiLiveSDK] Server content with ${parts.length} parts`)

              // Gemini is responding - set flag (protection layer 1)
              this.isGeminiResponding = true

              // Emit model turn event with parts
              this.emit('modelTurn', parts)
            }

            // Reset accumulated response on turnComplete
            if (message.serverContent?.turnComplete) {
              this.lastGeminiResponseTime = Date.now() // Protection layer 2
              this.isGeminiResponding = false // Protection layer 1
              console.log('[GeminiLiveSDK] ✅ Gemini finished response - ready for next input')
              this.emit('turnComplete')
            }

            if (message.error) {
              console.error('[GeminiLiveSDK] ❌ Error:', JSON.stringify(message.error))
              this.emit('error', new Error(message.error.message || 'Gemini API error'))
            }
          },
          onerror: (error: ErrorEvent) => {
            console.error('[GeminiLiveSDK] ❌ WebSocket error:', error.message)
            this.emit('error', new Error(error.message))
          },
          onclose: (event: CloseEvent) => {
            console.log('[GeminiLiveSDK] WebSocket closed:', event.code, event.reason)
            this.isConnected = false
            this.emit('close', event)
          },
        },
      })

      console.log('[GeminiLiveSDK] ✅ Connected successfully')
    } catch (error: any) {
      console.error('[GeminiLiveSDK] ❌ Connection failed:', error.message)
      throw error
    }
  }

  /**
   * Send realtime input (audio or video)
   * Based on GeminiMultimodalTest.vue lines 237-246 and 277-284
   */
  sendRealtimeInput(input: { media: { data: string; mimeType: string } }): void {
    if (!this.session || !this.isConnected) {
      console.error('[GeminiLiveSDK] Cannot send input - not connected')
      return
    }

    this.session.sendRealtimeInput(input)
  }

  /**
   * Send client content (e.g., initial instruction)
   * Based on GeminiMultimodalTest.vue lines 360-363
   */
  sendClientContent(content: { turns?: any[]; turnComplete?: boolean }): void {
    if (!this.session || !this.isConnected) {
      console.error('[GeminiLiveSDK] Cannot send content - not connected')
      return
    }

    this.session.sendClientContent(content)
  }

  /**
   * Send turn complete signal with three-layer protection
   * Based on GeminiMultimodalTest.vue lines 288-348
   *
   * CRITICAL: This implements three protection layers to prevent WebSocket 1007 error:
   * Layer 1: Don't send if Gemini is currently responding
   * Layer 2: Wait 500ms after Gemini finishes responding (debounce)
   * Layer 3: Minimum 2000ms between user turns (prevent duplicates)
   */
  async sendTurnComplete(): Promise<boolean> {
    if (!this.session || !this.isConnected) {
      console.error('[GeminiLiveSDK] Cannot send turnComplete - not connected')
      return false
    }

    // LAYER 1: Only send turnComplete if Gemini is NOT currently responding
    if (this.isGeminiResponding) {
      console.warn('[GeminiLiveSDK] 🔇 Silence detected but Gemini is responding - waiting...')
      return false
    }

    // LAYER 2: Add 500ms debounce after Gemini finishes responding
    const timeSinceLastResponse = Date.now() - this.lastGeminiResponseTime
    const DEBOUNCE_MS = 500

    if (timeSinceLastResponse < DEBOUNCE_MS) {
      console.warn(`[GeminiLiveSDK] 🔇 Silence detected but too soon after Gemini response (${timeSinceLastResponse}ms) - waiting...`)
      return false
    }

    // LAYER 3: Prevent duplicate turnComplete signals (minimum 2 seconds between user turns)
    const timeSinceLastUserTurn = Date.now() - this.lastUserTurnCompleteTime
    const MIN_TURN_INTERVAL_MS = 2000

    if (this.lastUserTurnCompleteTime > 0 && timeSinceLastUserTurn < MIN_TURN_INTERVAL_MS) {
      console.warn(`[GeminiLiveSDK] 🔇 Silence detected but too soon after last user turn (${timeSinceLastUserTurn}ms) - ignoring...`)
      return false
    }

    console.log('[GeminiLiveSDK] 🔇 Silence detected - sending turnComplete')

    // CORRECT: Use SDK's sendClientContent() method
    // Per SDK docs: "sendClientContent()" with no params is short form for turnComplete:true
    try {
      this.session.sendClientContent({ turnComplete: true })
      this.lastUserTurnCompleteTime = Date.now()
      console.log('[GeminiLiveSDK] ✅ Turn complete sent - Gemini has audio + visual context')
      return true
    } catch (error: any) {
      console.error('[GeminiLiveSDK] ❌ Failed to send turnComplete:', error.message)
      this.emit('error', error)
      return false
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.session) {
      console.log('[GeminiLiveSDK] Disconnecting...')
      this.session.close()
      this.session = null
    }
    this.client = null
    this.isConnected = false

    // Reset protection state
    this.isGeminiResponding = false
    this.lastGeminiResponseTime = 0
    this.lastUserTurnCompleteTime = 0
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected
  }

  /**
   * Reset protection state (useful for testing)
   */
  resetProtectionState(): void {
    this.isGeminiResponding = false
    this.lastGeminiResponseTime = 0
    this.lastUserTurnCompleteTime = 0
  }
}

/**
 * Factory function to create adapter with environment API key
 */
export function createGeminiLiveSDKAdapter(options: Partial<GeminiLiveConfig> = {}): GeminiLiveSDKAdapter {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY not configured in environment')
  }

  return new GeminiLiveSDKAdapter({
    apiKey,
    ...options,
  })
}
