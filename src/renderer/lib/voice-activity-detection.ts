/**
 * Voice Activity Detection (VAD) for detecting speech vs silence
 * Based on audio energy analysis
 */

export interface VADConfig {
  silenceThreshold?: number // Silence detection threshold (default: 0.01)
  silenceDuration?: number // How long silence before triggering (ms, default: 1000)
  energyWindowSize?: number // Number of samples to average (default: 50)
  minSpeechDuration?: number // Minimum speech duration to consider valid (ms, default: 300)
  minPeakEnergy?: number // Minimum peak energy for "strong" speech (default: 0.05)
}

export class VoiceActivityDetector {
  private silenceThreshold: number
  private silenceDuration: number
  private energyWindowSize: number
  private minSpeechDuration: number
  private minPeakEnergy: number
  private energyHistory: number[] = []
  private lastSpeechTime: number = Date.now()
  private silenceTimer: number | null = null
  private onSilenceCallback: (() => void) | null = null
  private wasSpeaking: boolean = false // Track speech state for transitions
  private silenceAlreadyFired: boolean = false // Prevent firing multiple times for same silence period
  private speechStartTime: number = 0 // Track when speech started
  private totalSpeechDuration: number = 0 // Track total speech duration
  private peakEnergyDuringSpeech: number = 0 // Track peak energy to detect "strong" speech

  constructor(config: VADConfig = {}) {
    this.silenceThreshold = config.silenceThreshold ?? 0.01
    this.silenceDuration = config.silenceDuration ?? 1000
    this.energyWindowSize = config.energyWindowSize ?? 50
    this.minSpeechDuration = config.minSpeechDuration ?? 300 // 300ms minimum
    this.minPeakEnergy = config.minPeakEnergy ?? 0.05 // Require strong speech
  }

  /**
   * Process audio samples and detect voice activity
   * @param samples Float32Array of audio samples
   * @returns true if speech detected, false if silence
   */
  processSamples(samples: Float32Array): boolean {
    // Calculate RMS (Root Mean Square) energy
    let sum = 0
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sum / samples.length)

    // Add to energy history
    this.energyHistory.push(rms)
    if (this.energyHistory.length > this.energyWindowSize) {
      this.energyHistory.shift()
    }

    // Calculate average energy
    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length

    // Determine if speech or silence
    const isSpeech = avgEnergy > this.silenceThreshold

    if (isSpeech) {
      // Speech detected
      const now = Date.now()
      this.lastSpeechTime = now

      // Track speech start time
      if (!this.wasSpeaking) {
        this.speechStartTime = now
        this.totalSpeechDuration = 0
        this.peakEnergyDuringSpeech = 0 // Reset peak energy for new speech
      } else {
        // Accumulate speech duration
        this.totalSpeechDuration = now - this.speechStartTime
      }

      // Track peak energy during speech (for confidence check)
      if (avgEnergy > this.peakEnergyDuringSpeech) {
        this.peakEnergyDuringSpeech = avgEnergy
      }

      this.wasSpeaking = true
      this.silenceAlreadyFired = false // Reset flag when speech starts again

      // Cancel any pending silence timer
      if (this.silenceTimer !== null) {
        clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
    } else {
      // Silence detected
      // Only trigger callback if:
      // 1. We were speaking before (speech-to-silence transition)
      // 2. Speech lasted long enough (minSpeechDuration)
      // 3. Peak energy was strong enough (minPeakEnergy) - NEW CONFIDENCE CHECK
      // 4. Enough silence time has passed
      // 5. We haven't already fired for this silence period
      const silenceDurationMs = Date.now() - this.lastSpeechTime

      if (
        this.wasSpeaking &&
        this.totalSpeechDuration >= this.minSpeechDuration &&
        this.peakEnergyDuringSpeech >= this.minPeakEnergy && // CONFIDENCE CHECK
        silenceDurationMs >= this.silenceDuration &&
        !this.silenceAlreadyFired &&
        this.silenceTimer === null
      ) {
        // Fire callback once for this silence period - STRONG SPEECH
        this.silenceAlreadyFired = true
        console.log(
          `[VAD] ✅ Strong speech detected (${Math.round(this.totalSpeechDuration)}ms, peak: ${this.peakEnergyDuringSpeech.toFixed(3)}) - triggering callback`
        )
        if (this.onSilenceCallback) {
          this.onSilenceCallback()
        }
      } else if (this.wasSpeaking && this.totalSpeechDuration < this.minSpeechDuration && silenceDurationMs >= this.silenceDuration) {
        // Speech was too short - ignore it
        console.log(`[VAD] ⚠️ Speech too short (${Math.round(this.totalSpeechDuration)}ms < ${this.minSpeechDuration}ms) - ignoring`)
        this.wasSpeaking = false
        this.totalSpeechDuration = 0
        this.peakEnergyDuringSpeech = 0
      } else if (this.wasSpeaking && this.peakEnergyDuringSpeech < this.minPeakEnergy && silenceDurationMs >= this.silenceDuration) {
        // Peak energy too weak - not confident this is real speech
        console.log(`[VAD] ⚠️ Weak speech detected (peak: ${this.peakEnergyDuringSpeech.toFixed(3)} < ${this.minPeakEnergy}) - ignoring ambient sound`)
        this.wasSpeaking = false
        this.totalSpeechDuration = 0
        this.peakEnergyDuringSpeech = 0
      }
    }

    return isSpeech
  }

  /**
   * Set callback for when silence is detected
   */
  onSilence(callback: () => void) {
    this.onSilenceCallback = callback
  }

  /**
   * Reset VAD state
   */
  reset() {
    this.energyHistory = []
    this.lastSpeechTime = Date.now()
    this.wasSpeaking = false
    this.silenceAlreadyFired = false
    this.speechStartTime = 0
    this.totalSpeechDuration = 0
    this.peakEnergyDuringSpeech = 0
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }

  /**
   * Get current speech status
   */
  isSpeaking(): boolean {
    const silenceDurationMs = Date.now() - this.lastSpeechTime
    return silenceDurationMs < this.silenceDuration
  }
}
