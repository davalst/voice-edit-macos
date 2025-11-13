<template>
  <div class="popover-container">
    <div class="popover-header">
      <h3>Voice Edit</h3>
    </div>
    
    <div class="frame-preview">
      <img v-if="screenshot" :src="screenshot" alt="Last captured frame" />
      <div v-else class="no-preview">
        No preview available
      </div>
    </div>
    
    <div class="selected-text-section">
      <label>Selected Text:</label>
      <div class="text-preview">
        {{ selectedText || '(none)' }}
      </div>
    </div>
    
    <div class="control-row">
      <div class="control-label">
        <span class="icon">📹</span>
        Multimodal
      </div>
      <label class="toggle">
        <input 
          type="checkbox" 
          v-model="multimodalEnabled" 
          @change="toggleMultimodal" 
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
    
    <div class="control-row">
      <div class="control-label">
        <span class="icon">🎤</span>
        Microphone
      </div>
      <button 
        class="mute-button"
        :class="{ muted: microphoneMuted }"
        @click="toggleMicrophoneMute"
      >
        {{ microphoneMuted ? 'Unmute' : 'Mute' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const screenshot = ref<string | null>(null)
const selectedText = ref<string>('')
const multimodalEnabled = ref(true)
const microphoneMuted = ref(false)

onMounted(() => {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI) {
    console.error('[ControlsPopover] electronAPI not available')
    return
  }

  electronAPI.onPopoverData((data: any) => {
    screenshot.value = data.screenshot
    selectedText.value = data.selectedText
    multimodalEnabled.value = data.multimodalEnabled
    microphoneMuted.value = data.microphoneMuted
  })
})

function toggleMultimodal() {
  const electronAPI = (window as any).electronAPI
  electronAPI?.setMultimodalEnabled(multimodalEnabled.value)
}

function toggleMicrophoneMute() {
  microphoneMuted.value = !microphoneMuted.value
  const electronAPI = (window as any).electronAPI
  electronAPI?.setMicrophoneMuted(microphoneMuted.value)
}
</script>
