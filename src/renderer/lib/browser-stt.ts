/**
 * Browser Speech-to-Text Service
 *
 * Uses the browser's built-in Web Speech API (webkit) for pure STT transcription.
 * This is ONLY for Fn+Ctrl dictation mode - 100% deterministic, no AI interpretation.
 *
 * Accuracy: Same as Google Cloud STT (uses Google's cloud service under the hood)
 * Cost: FREE
 * Determinism: 100% - just transcribes what's spoken, no commands executed
 */

import { EventEmitter } from 'events'

// TypeScript declarations for webkit Speech Recognition API
declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}

export interface BrowserSTTConfig {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
}

export interface TranscriptResult {
  transcript: string
  isFinal: boolean
  confidence: number
  timestamp: number
}

/**
 * Browser-based Speech-to-Text service using Web Speech API
 */
export class BrowserSTT extends EventEmitter {
  private recognition: any = null
  private isRecording: boolean = false
  private config: BrowserSTTConfig

  // Accumulated transcript for final result
  private finalTranscript: string = ''
  private interimTranscript: string = ''

  constructor(config: BrowserSTTConfig = {}) {
    super()

    this.config = {
      language: config.language || 'en-US',
      continuous: config.continuous !== undefined ? config.continuous : true,
      interimResults: config.interimResults !== undefined ? config.interimResults : true,
      maxAlternatives: config.maxAlternatives || 1,
    }

    this.initializeRecognition()
  }

  /**
   * Initialize the Web Speech Recognition API
   */
  private initializeRecognition() {
    // Check if browser supports Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.error('[BrowserSTT] Speech Recognition API not supported in this browser')
      this.emit('error', new Error('Speech Recognition not supported'))
      return
    }

    this.recognition = new SpeechRecognition()

    // Configure recognition
    this.recognition.continuous = this.config.continuous
    this.recognition.interimResults = this.config.interimResults
    this.recognition.lang = this.config.language
    this.recognition.maxAlternatives = this.config.maxAlternatives

    // Event handlers
    this.recognition.onstart = () => {
      console.log('[BrowserSTT] Recognition started')
      this.isRecording = true
      this.finalTranscript = ''
      this.interimTranscript = ''
      this.emit('start')
    }

    this.recognition.onresult = (event: any) => {
      this.handleResult(event)
    }

    this.recognition.onerror = (event: any) => {
      console.error('[BrowserSTT] Recognition error:', event.error)
      this.emit('error', new Error(event.error))

      // Auto-restart on network errors (common in continuous mode)
      if (event.error === 'network' && this.isRecording) {
        console.log('[BrowserSTT] Network error, restarting...')
        setTimeout(() => {
          if (this.isRecording) {
            this.recognition.start()
          }
        }, 1000)
      }
    }

    this.recognition.onend = () => {
      console.log('[BrowserSTT] Recognition ended')

      // Auto-restart if we're supposed to be in continuous mode
      if (this.isRecording && this.config.continuous) {
        console.log('[BrowserSTT] Auto-restarting continuous recognition')
        this.recognition.start()
      } else {
        this.isRecording = false
        this.emit('end')
      }
    }

    console.log('[BrowserSTT] Speech Recognition initialized', this.config)
  }

  /**
   * Handle recognition results
   */
  private handleResult(event: any) {
    let interim = ''

    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0].transcript
      const confidence = result[0].confidence || 0.95

      if (result.isFinal) {
        // Final result - add to accumulated transcript
        this.finalTranscript += transcript + ' '

        console.log('[BrowserSTT] Final result:', {
          transcript,
          confidence,
          totalLength: this.finalTranscript.length,
        })

        this.emit('result', {
          transcript,
          isFinal: true,
          confidence,
          timestamp: Date.now(),
        } as TranscriptResult)

      } else {
        // Interim result - for real-time display
        interim += transcript

        console.log('[BrowserSTT] Interim result:', transcript)

        this.emit('result', {
          transcript,
          isFinal: false,
          confidence,
          timestamp: Date.now(),
        } as TranscriptResult)
      }
    }

    this.interimTranscript = interim
  }

  /**
   * Start speech recognition
   */
  start() {
    if (this.isRecording) {
      console.warn('[BrowserSTT] Already recording')
      return
    }

    if (!this.recognition) {
      console.error('[BrowserSTT] Recognition not initialized')
      return
    }

    try {
      console.log('[BrowserSTT] Starting recognition...')
      this.recognition.start()
    } catch (error) {
      console.error('[BrowserSTT] Failed to start recognition:', error)
      this.emit('error', error)
    }
  }

  /**
   * Stop speech recognition
   */
  stop() {
    if (!this.isRecording) {
      console.warn('[BrowserSTT] Not recording')
      return
    }

    try {
      console.log('[BrowserSTT] Stopping recognition...')
      this.isRecording = false
      this.recognition.stop()

      // Emit final accumulated transcript
      if (this.finalTranscript) {
        this.emit('finalTranscript', {
          transcript: this.finalTranscript.trim(),
          confidence: 0.95,
          timestamp: Date.now(),
        })
      }

    } catch (error) {
      console.error('[BrowserSTT] Failed to stop recognition:', error)
      this.emit('error', error)
    }
  }

  /**
   * Abort speech recognition (without emitting results)
   */
  abort() {
    if (!this.isRecording) {
      return
    }

    try {
      console.log('[BrowserSTT] Aborting recognition...')
      this.isRecording = false
      this.recognition.abort()
    } catch (error) {
      console.error('[BrowserSTT] Failed to abort recognition:', error)
    }
  }

  /**
   * Get current recording status
   */
  get recording(): boolean {
    return this.isRecording
  }

  /**
   * Get accumulated final transcript
   */
  get transcript(): string {
    return this.finalTranscript.trim()
  }

  /**
   * Check if browser supports Speech Recognition
   */
  static isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }
}

export default BrowserSTT
