<template>
  <!-- Wispr Flow-style minimal overlay -->
  <div class="overlay-container">
    <!-- Idle state: tiny hollow dash -->
    <div v-if="!isRecording" class="overlay-idle">
      <div class="idle-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>

    <!-- Recording state: compact waveform bar -->
    <div v-else class="overlay-recording">
      <button @click="stopRecording" class="stop-button">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="6" fill="currentColor"/>
        </svg>
      </button>

      <canvas ref="waveformCanvas" class="waveform"></canvas>

      <button @click="cancelRecording" class="cancel-button">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

// State
const isRecording = ref(false)
const waveformCanvas = ref<HTMLCanvasElement | null>(null)
const waveformData = ref<number[]>([])

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
 * Cancel recording (X button)
 */
function cancelRecording() {
  electronAPI?.notifyRecordingStopped?.()
}

/**
 * Handle overlay show event
 */
function handleOverlayShow() {
  console.log('[Overlay] Show')
  isRecording.value = true
}

/**
 * Handle overlay hide event
 */
function handleOverlayHide() {
  console.log('[Overlay] Hide')
  isRecording.value = false
  waveformData.value = []
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
  // Setup canvas size (compact like Wispr)
  const canvas = waveformCanvas.value
  if (canvas) {
    canvas.width = 150
    canvas.height = 20
    drawWaveform()
  }

  // Listen for overlay events
  electronAPI?.onOverlayShow?.(handleOverlayShow)
  electronAPI?.onOverlayHide?.(handleOverlayHide)
  electronAPI?.onOverlayWaveform?.(handleWaveformUpdate)
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

/* Idle state: tiny hollow dash with dots */
.overlay-idle {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 8px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.idle-dots {
  display: flex;
  gap: 6px;
  align-items: center;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
}

/* Recording state: compact waveform bar */
.overlay-recording {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  padding: 12px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  gap: 12px;
}

.stop-button {
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 4px;
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

.waveform {
  width: 150px;
  height: 20px;
  display: block;
}

.cancel-button {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, transform 0.1s;
}

.cancel-button:hover {
  color: rgba(255, 255, 255, 0.9);
  transform: scale(1.1);
}

.cancel-button:active {
  transform: scale(0.95);
}
</style>
