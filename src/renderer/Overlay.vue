<template>
  <div :class="['overlay-container', { visible: isVisible }]" v-if="isVisible">
    <!-- Main overlay card -->
    <div class="overlay-card">
      <!-- Mode indicator -->
      <div class="mode-indicator">
        <div class="mode-icon">{{ modeIcon }}</div>
        <div class="mode-text">
          <div class="mode-title">{{ modeTitle }}</div>
          <div class="mode-subtitle">{{ modeSubtitle }}</div>
        </div>
      </div>

      <!-- Waveform visualization -->
      <div class="waveform-container">
        <canvas ref="waveformCanvas" class="waveform"></canvas>
      </div>

      <!-- Screen capture indicator -->
      <div v-if="screenCaptureEnabled" class="screen-indicator">
        <span class="screen-icon">📺</span>
        <span class="screen-text">Screen Recording</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

// State
const isVisible = ref(false)
const currentMode = ref('idle')
const screenCaptureEnabled = ref(false)
const waveformCanvas = ref<HTMLCanvasElement | null>(null)
const waveformData = ref<number[]>([])

// Electron API
const electronAPI = (window as any).electronAPI

// Mode display info
const modeInfo = computed(() => {
  const modes: Record<string, { icon: string; title: string; subtitle: string }> = {
    idle: {
      icon: '⏸️',
      title: 'Ready',
      subtitle: 'Press Fn to start',
    },
    stt_only_hold: {
      icon: '🎤',
      title: 'Listening',
      subtitle: 'Hold Fn to record',
    },
    stt_screen_hold: {
      icon: '🎬',
      title: 'Recording',
      subtitle: 'Hold Fn+Ctrl for screen',
    },
    stt_only_toggle: {
      icon: '🎙️',
      title: 'Recording',
      subtitle: 'Double-tap Fn to stop',
    },
    stt_screen_toggle: {
      icon: '📹',
      title: 'Recording + Screen',
      subtitle: 'Double-tap Fn+Ctrl to stop',
    },
  }

  return modes[currentMode.value] || modes.idle
})

const modeIcon = computed(() => modeInfo.value.icon)
const modeTitle = computed(() => modeInfo.value.title)
const modeSubtitle = computed(() => modeInfo.value.subtitle)

/**
 * Draw waveform visualization
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

  // Ebben POC colors
  const gradientColor = ctx.createLinearGradient(0, 0, width, 0)
  gradientColor.addColorStop(0, '#667EEA') // Purple-ish
  gradientColor.addColorStop(1, '#64B5F6') // Blue

  ctx.strokeStyle = gradientColor
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (data.length === 0) {
    // No data - draw flat line
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
    return
  }

  // Draw waveform
  const barWidth = width / data.length
  const maxAmplitude = Math.max(...data, 0.1)

  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const x = i * barWidth
    const amplitude = (data[i] / maxAmplitude) * (height / 2)
    const y = height / 2 + (i % 2 === 0 ? amplitude : -amplitude)

    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}

/**
 * Handle overlay show event
 */
function handleOverlayShow(data: { mode: string; enableScreenCapture: boolean }) {
  console.log('[Overlay] Show:', data)
  currentMode.value = data.mode
  screenCaptureEnabled.value = data.enableScreenCapture
  isVisible.value = true
}

/**
 * Handle overlay hide event
 */
function handleOverlayHide() {
  console.log('[Overlay] Hide')
  isVisible.value = false
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
  // Setup canvas size
  const canvas = waveformCanvas.value
  if (canvas) {
    canvas.width = 360
    canvas.height = 60
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
/* Ebben POC Design System */
.overlay-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.overlay-container.visible {
  opacity: 1;
}

.overlay-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  min-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mode-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-icon {
  font-size: 32px;
  line-height: 1;
}

.mode-text {
  flex: 1;
}

.mode-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
}

.mode-subtitle {
  font-size: 13px;
  color: #718096;
  margin-top: 2px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
}

.waveform-container {
  padding: 8px 0;
}

.waveform {
  width: 100%;
  height: 60px;
  display: block;
}

.screen-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667EEA 0%, #64B5F6 100%);
  border-radius: 8px;
  color: white;
}

.screen-icon {
  font-size: 16px;
  line-height: 1;
}

.screen-text {
  font-size: 13px;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .overlay-card {
    background: rgba(26, 32, 44, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .mode-title {
    color: #f7fafc;
  }

  .mode-subtitle {
    color: #a0aec0;
  }
}
</style>
