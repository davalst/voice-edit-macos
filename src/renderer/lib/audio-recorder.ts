/**
 * AudioRecorder for capturing microphone input and converting to PCM
 * Based on Google's official Gemini Live API implementation
 */

import { audioContext, arrayBufferToBase64 } from './utils'
import AudioRecordingWorklet from './worklets/audio-processing'
import { createWorketFromSrc } from './audioworklet-registry'
import { EventEmitter } from 'eventemitter3'
import { VoiceActivityDetector } from './voice-activity-detection'

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined
  audioContext: AudioContext | undefined
  source: MediaStreamAudioSourceNode | undefined
  recording: boolean = false
  recordingWorklet: AudioWorkletNode | undefined
  vad: VoiceActivityDetector

  private starting: Promise<void> | null = null

  constructor(public sampleRate = 16000) {
    super()
    // Configure VAD for 1.5 second silence detection
    // CRITICAL: Higher thresholds to prevent ambient sound/silence from triggering
    this.vad = new VoiceActivityDetector({
      silenceThreshold: 0.02, // Increased from 0.01 - requires louder audio to count as speech
      silenceDuration: 1500, // 1.5 seconds of silence (increased to reduce false triggers)
      energyWindowSize: 50,
      minSpeechDuration: 1500, // Increased from 500ms to 1.5 seconds - filters out ambient noise
      minPeakEnergy: 0.05, // NEW: Require strong peak energy to filter out weak/ambient sounds
    })

    // When silence detected, emit 'silence' event
    this.vad.onSilence(() => {
      this.emit('silence')
    })
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Could not request user media')
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        this.audioContext = await audioContext({ sampleRate: this.sampleRate })
        this.source = this.audioContext.createMediaStreamSource(this.stream)

        const workletName = 'audio-recorder-worklet'
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet)

        await this.audioContext.audioWorklet.addModule(src)
        this.recordingWorklet = new AudioWorkletNode(this.audioContext, workletName)

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          const eventType = ev.data.event

          if (eventType === 'chunk') {
            // Process audio chunk for transmission
            const arrayBuffer = ev.data.data.int16arrayBuffer
            if (arrayBuffer) {
              const arrayBufferString = arrayBufferToBase64(arrayBuffer)
              this.emit('data', arrayBufferString)
            }
          } else if (eventType === 'vad') {
            // Process samples for VAD
            const float32Samples = ev.data.data.float32Samples
            if (float32Samples) {
              this.vad.processSamples(float32Samples)
            }
          }
        }
        this.source.connect(this.recordingWorklet)

        this.recording = true
        resolve()
        this.starting = null
      } catch (error) {
        reject(error)
      }
    })

    return this.starting
  }

  stop() {
    // its plausible that stop would be called before start completes
    // such as if the websocket immediately hangs up
    const handleStop = () => {
      this.source?.disconnect()
      this.stream?.getTracks().forEach(track => track.stop())
      this.stream = undefined
      this.recordingWorklet = undefined
      this.recording = false
    }
    if (this.starting) {
      this.starting.then(handleStop)
      return
    }
    handleStop()
  }
}
