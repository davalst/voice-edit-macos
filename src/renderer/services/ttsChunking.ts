/**
 * TTS Chunking Service
 *
 * Provides sentence-level chunking for faster TTS playback in voice mode.
 * This is a progressive enhancement - if it fails, the app falls back to existing behavior.
 */

/**
 * Convert base64 string to Blob (same as WorkstreamConversation.vue)
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

export interface TTSChunk {
  text: string
  index: number
}

interface TTSPlayerState {
  sentences: string[]
  currentIndex: number
  interrupted: boolean
  audioElement: HTMLAudioElement
}

export class TTSChunkPlayer {
  private state: TTSPlayerState
  private voiceService: any

  constructor(voiceService: any) {
    this.voiceService = voiceService
    this.state = {
      sentences: [],
      currentIndex: 0,
      interrupted: false,
      audioElement: new Audio(),
    }
  }

  /**
   * Play text as chunked sentences with pipelined generation
   * Each sentence plays sequentially, but next sentence generates while current plays
   */
  async playChunked(text: string): Promise<void> {
    console.log('🎵 Starting chunked TTS playback')

    // Split into sentences
    this.state.sentences = splitIntoSentences(text)
    this.state.currentIndex = 0
    this.state.interrupted = false

    console.log(`📝 Split into ${this.state.sentences.length} sentences`)

    if (this.state.sentences.length === 0) {
      console.warn('⚠️ No sentences found in text')
      return
    }

    // Pre-generate first sentence TTS
    let nextTTSPromise = this.generateTTS(this.state.sentences[0])

    for (let i = 0; i < this.state.sentences.length; i++) {
      if (this.state.interrupted) {
        console.log('⏸️ Playback interrupted')
        break
      }

      console.log(`🎵 Playing sentence ${i + 1}/${this.state.sentences.length}`)

      try {
        // Wait for TTS generation to complete
        const audioBlob = await nextTTSPromise

        // Start generating NEXT sentence WHILE current one plays
        nextTTSPromise = i < this.state.sentences.length - 1 ? this.generateTTS(this.state.sentences[i + 1]) : Promise.resolve(null)

        // Play current sentence (blocks until finished)
        await this.playSentence(audioBlob)

        this.state.currentIndex = i + 1
      } catch (error) {
        console.error(`❌ Error playing sentence ${i + 1}:`, error)
        // Continue to next sentence instead of failing completely
        continue
      }
    }

    console.log('✅ Chunked TTS playback complete')
  }

  /**
   * Generate TTS audio for a single sentence
   */
  private async generateTTS(sentence: string): Promise<Blob> {
    const preview = sentence.substring(0, 50)
    console.log(`🔊 Generating TTS for: "${preview}${sentence.length > 50 ? '...' : ''}"`)

    try {
      // Use the same TTS API as the original implementation
      const response = await this.voiceService.post('/api/tts/generate', {
        text: sentence,
      })

      if (response.data.success && response.data.audio_base64) {
        // Convert base64 to blob (same as original TTS code)
        const audioBlob = base64ToBlob(response.data.audio_base64, 'audio/mp3')
        console.log(`✅ TTS ready for: "${preview}${sentence.length > 50 ? '...' : ''}"`)
        return audioBlob
      } else {
        throw new Error('TTS API returned no audio data')
      }
    } catch (error) {
      console.error('❌ TTS generation failed:', error)
      throw error
    }
  }

  /**
   * Play a single sentence audio blob
   * Returns a promise that resolves when playback completes or is interrupted
   */
  private async playSentence(audioBlob: Blob | null): Promise<void> {
    if (!audioBlob || this.state.interrupted) {
      return
    }

    return new Promise<void>(resolve => {
      const audio = this.state.audioElement
      const blobUrl = URL.createObjectURL(audioBlob)
      audio.src = blobUrl

      const cleanup = () => {
        URL.revokeObjectURL(blobUrl)
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        clearInterval(checkInterval)
      }

      const onEnded = () => {
        cleanup()
        resolve()
      }

      const onError = (err: any) => {
        cleanup()
        console.error('Audio playback error:', err)
        resolve() // Continue to next sentence instead of failing
      }

      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)

      audio.play().catch(err => {
        console.error('Play error:', err)
        cleanup()
        resolve()
      })

      // Check for interrupts every 100ms
      const checkInterval = setInterval(() => {
        if (this.state.interrupted) {
          audio.pause()
          cleanup()
          resolve()
        }
      }, 100)
    })
  }

  /**
   * Interrupt playback immediately
   */
  interrupt(): void {
    console.log('⏸️ Interrupting chunked TTS playback')
    this.state.interrupted = true
    this.state.audioElement.pause()
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return !this.state.audioElement.paused
  }

  /**
   * Get current progress
   */
  getProgress(): { current: number; total: number } {
    return {
      current: this.state.currentIndex,
      total: this.state.sentences.length,
    }
  }
}

/**
 * Split text into sentences intelligently
 * Handles common abbreviations and edge cases
 */
export function splitIntoSentences(text: string): string[] {
  // Remove extra whitespace
  const cleaned = text.trim().replace(/\s+/g, ' ')

  // Split on sentence boundaries (. ! ?) followed by space and capital letter
  // But preserve the punctuation
  const sentences = cleaned
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1|SPLIT|')
    .split('|SPLIT|')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  // If no clear sentence boundaries found, return whole text as one sentence
  if (sentences.length === 0) {
    return [cleaned]
  }

  // Filter out very short fragments (likely abbreviations)
  const filtered = sentences.filter(s => s.length > 3)

  return filtered.length > 0 ? filtered : [cleaned]
}

/**
 * Estimate TTS generation time for a sentence (for UI feedback)
 */
export function estimateTTSDuration(sentence: string): number {
  // Rough estimate: ~150 words per minute = 2.5 words per second
  // Plus ~500ms base latency for TTS generation
  const words = sentence.split(/\s+/).length
  const speakingTime = (words / 2.5) * 1000
  const generationLatency = 500

  return speakingTime + generationLatency
}
