<template>
  <!-- Wispr Flow-style minimal overlay -->
  <div class="overlay-container">
    <!-- Idle state: tiny hollow dash -->
    <div v-if="state === 'idle'" class="overlay-idle">
      <div class="idle-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>

    <!-- Recording state: compact waveform bar with mode indicator -->
    <div v-else-if="state === 'recording'" class="overlay-recording">
      <!-- Mode indicator -->
      <div class="mode-indicator">
        <span v-if="enableScreenCapture" class="mode-icon">📹</span>
        <span v-else class="mode-icon">🎤</span>
      </div>

      <!-- Waveform -->
      <canvas ref="waveformCanvas" class="waveform"></canvas>

      <!-- Stop button -->
      <button @click="stopRecording" class="stop-button">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="6" fill="currentColor"/>
        </svg>
      </button>
    </div>

    <!-- Result state: shows last command/result briefly -->
    <div v-else-if="state === 'result'" class="overlay-result">
      <div class="result-text">{{ lastResult }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

// State management
type OverlayState = 'idle' | 'recording' | 'result'
const state = ref<OverlayState>('idle')
const enableScreenCapture = ref(false)
const currentMode = ref('')
const lastResult = ref('')
const waveformCanvas = ref<HTMLCanvasElement | null>(null)
const waveformData = ref<number[]>([])

// Result display timer
let resultTimer: NodeJS.Timeout | null = null

// Electron API
const electronAPI = (window as any).electronAPI

/**
 * Draw waveform visualization (Wispr style: vertical bars)
 */
function drawWaveform() {
  const canvas = waveformCanvas.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const data = waveformData.value

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  if (data.length === 0) {
    // No data - draw flat bars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    const barCount = 20
    const barWidth = 2
    const gap = (width - barCount * barWidth) / (barCount - 1)

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap)
      const barHeight = height * 0.2
      ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight)
    }
    return
  }

  // Draw animated waveform bars
  ctx.fillStyle = '#ffffff'
  const barCount = Math.min(data.length, 20)
  const barWidth = 2
  const gap = (width - barCount * barWidth) / (barCount - 1)
  const maxAmplitude = Math.max(...data, 0.1)

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * data.length)
    const amplitude = data[dataIndex] / maxAmplitude
    const x = i * (barWidth + gap)
    const barHeight = Math.max(height * 0.2, height * amplitude * 0.8)
    ctx.fillRect(x, (height - barHeight) / 2, barWidth, barHeight)
  }
}

/**
 * Stop recording (red circle button)
 */
function stopRecording() {
  electronAPI?.notifyRecordingStopped?.()
}

/**
 * Handle overlay show event
 */
function handleOverlayShow(config: { mode: string; enableScreenCapture: boolean }) {
  console.log('[Overlay] Show:', config)
  state.value = 'recording'
  currentMode.value = config.mode
  enableScreenCapture.value = config.enableScreenCapture
  waveformData.value = []

  // Clear any pending result timer
  if (resultTimer) {
    clearTimeout(resultTimer)
    resultTimer = null
  }
}

/**
 * Handle overlay hide event
 */
function handleOverlayHide() {
  console.log('[Overlay] Hide')
  state.value = 'idle'
  waveformData.value = []
  currentMode.value = ''
  enableScreenCapture.value = false
}

/**
 * Handle result display (shows command or edited text briefly)
 */
function handleResultDisplay(result: string) {
  console.log('[Overlay] Result:', result)
  lastResult.value = result
  state.value = 'result'

  // Show result for 3 seconds, then return to idle
  if (resultTimer) {
    clearTimeout(resultTimer)
  }
  resultTimer = setTimeout(() => {
    state.value = 'idle'
    lastResult.value = ''
  }, 3000)
}

/**
 * Handle waveform update
 */
function handleWaveformUpdate(data: number[]) {
  waveformData.value = data
  drawWaveform()
}

/**
 * Lifecycle
 */
onMounted(() => {
  // Setup canvas size (compact like Wispr - 1/3 size)
  const canvas = waveformCanvas.value
  if (canvas) {
    canvas.width = 80
    canvas.height = 16
    drawWaveform()
  }

  // Listen for overlay events
  electronAPI?.onOverlayShow?.(handleOverlayShow)
  electronAPI?.onOverlayHide?.(handleOverlayHide)
  electronAPI?.onOverlayWaveform?.(handleWaveformUpdate)
  electronAPI?.onOverlayResult?.(handleResultDisplay)
})

// Redraw waveform when data changes
watch(waveformData, drawWaveform)
</script>

<style scoped>
/* Wispr Flow-style minimal overlay */
.overlay-container {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  z-index: 9999;
}

/* Idle state: tiny hollow dash with dots - 1/3 size (Wispr style) */
.overlay-idle {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 14px;
  padding: 6px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
}

.idle-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  animation: pulse 2s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
.dot:nth-child(4) { animation-delay: 0.6s; }
.dot:nth-child(5) { animation-delay: 0.8s; }

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* Recording state: compact waveform bar with mode indicator - 1/3 size (Wispr style) */
.overlay-recording {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 18px;
  padding: 6px 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.mode-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0.9;
}

.mode-icon {
  display: block;
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.3));
}

.waveform {
  width: 80px;
  height: 16px;
  display: block;
}

.stop-button {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, opacity 0.2s;
}

.stop-button:hover {
  transform: scale(1.1);
  opacity: 0.8;
}

.stop-button:active {
  transform: scale(0.95);
}

/* Result state: shows last command/result - 1/3 size */
.overlay-result {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 8px 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  max-width: 280px;
  transition: all 0.2s ease;
}

.result-text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
