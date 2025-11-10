<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <h1>🎤 Voice Edit</h1>
      <p class="subtitle">Intelligent voice-controlled text editing for macOS</p>
    </header>

    <!-- Recording Status -->
    <div class="status-section">
      <div :class="['status-indicator', { recording: isRecording }]">
        <div class="status-dot"></div>
        <span class="status-text">{{ isRecording ? 'Recording...' : 'Ready' }}</span>
      </div>

      <button @click="() => toggleRecording()" class="primary-button">
        {{ isRecording ? 'Stop Recording' : 'Start Recording' }}
      </button>

      <p class="hint">
        Press <kbd>{{ hotkey }}</kbd> to {{ isRecording ? 'stop' : 'start' }} recording
      </p>
    </div>

    <!-- Screen Sharing Status -->
    <div v-if="isScreenSharing" class="info-box">
      <span class="icon">📺</span>
      <span>Screen sharing active</span>
    </div>

    <!-- Last Command -->
    <div v-if="lastCommand" class="last-command">
      <div class="label">Last command:</div>
      <div class="command-text">"{{ lastCommand }}"</div>
      <div v-if="lastResult" class="result-preview">
        {{ lastResult }}
      </div>
    </div>

    <!-- Settings -->
    <div class="settings-section">
      <h2>Settings</h2>

      <div class="setting-item">
        <label>Gemini API Key:</label>
        <input
          v-model="apiKey"
          type="password"
          placeholder="Enter your Gemini API key"
          @blur="saveSettings"
        />
      </div>

      <div class="setting-item">
        <label>Hotkey:</label>
        <select v-model="hotkey" @change="saveSettings">
          <option value="Control+Space">Control+Space</option>
          <option value="Command+Space">⌘+Space</option>
          <option value="CommandOrControl+Shift+Space">⌘+Shift+Space</option>
          <option value="CommandOrControl+Shift+V">⌘+Shift+V</option>
          <option value="Control+Alt+Space">Ctrl+Alt+Space</option>
          <option value="F13">F13</option>
          <option value="F14">F14</option>
          <option value="F15">F15</option>
        </select>
      </div>

      <div class="setting-item">
        <label>
          <input type="checkbox" v-model="screenSharingEnabled" @change="saveSettings" />
          Enable screen sharing (multimodal)
        </label>
      </div>

      <div class="setting-item">
        <label>
          <input type="checkbox" v-model="launchAtLogin" @change="saveSettings" />
          Launch at login
        </label>
      </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
      <a href="#" @click.prevent="showHelp">Help</a>
      <span>•</span>
      <a href="#" @click.prevent="showAbout">About</a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVoiceEdit } from './composables/useVoiceEdit'

// Settings
const apiKey = ref('')
const hotkey = ref('Control+Space')
const screenSharingEnabled = ref(true)
const launchAtLogin = ref(false)

// Voice edit state
const {
  isRecording,
  isScreenSharing,
  lastCommand,
  lastResult,
  startRecording,
  stopRecording,
  init,
} = useVoiceEdit()

/**
 * Toggle recording on/off
 */
function toggleRecording(context?: { selectedText?: string; focusedAppName?: string }) {
  if (isRecording.value) {
    stopRecording()
  } else {
    // Pass pre-captured context to startRecording
    startRecording(context?.selectedText, context?.focusedAppName)
  }
}

/**
 * Load settings from Electron store
 */
async function loadSettings() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI) {
    console.error('electronAPI not available')
    return
  }

  const config = await electronAPI.getConfig()
  apiKey.value = config.apiKey || ''
  hotkey.value = config.hotkey || 'Control+Space'
  screenSharingEnabled.value = config.screenSharingEnabled !== false
  launchAtLogin.value = config.launchAtLogin === true
}

/**
 * Save settings to Electron store
 */
async function saveSettings() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI) {
    console.error('electronAPI not available')
    return
  }

  await electronAPI.saveConfig({
    apiKey: apiKey.value,
    hotkey: hotkey.value,
    screenSharingEnabled: screenSharingEnabled.value,
    launchAtLogin: launchAtLogin.value,
  })

  console.log('Settings saved')

  // Reinitialize with new settings
  init(apiKey.value, screenSharingEnabled.value)
}

/**
 * Show help dialog
 */
function showHelp() {
  alert('Voice Edit Help\n\nPress the configured hotkey to start recording.\nSpeak your editing command.\nPause for 1.5 seconds to process.\n\nSupported commands:\n- "make this shorter"\n- "translate to Spanish"\n- "find all mentions of X"\n- "what does this mean?"')
}

/**
 * Show about dialog
 */
function showAbout() {
  alert('Voice Edit v1.0.0\n\nIntelligent voice-controlled text editing for macOS.\n\nPowered by Google Gemini 2.0 Flash.')
}

/**
 * Lifecycle
 */
onMounted(async () => {
  // Load settings
  await loadSettings()

  // Initialize voice edit engine
  init(apiKey.value, screenSharingEnabled.value)

  // Listen for hotkey from main process
  const electronAPI = (window as any).electronAPI
  if (electronAPI) {
    electronAPI.onToggleRecording((_event: any, context: { selectedText: string; focusedAppName: string }) => {
      // Pass pre-captured context to toggle function
      toggleRecording(context)
    })
  }
})
</script>

<style scoped>
.app {
  max-width: 400px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  margin: 5px 0 0;
  font-size: 12px;
  color: #666;
}

.status-section {
  text-align: center;
  margin-bottom: 30px;
}

.status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  gap: 10px;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #28a745;
  animation: pulse 2s infinite;
}

.status-indicator.recording .status-dot {
  background: #dc3545;
}

.status-text {
  font-size: 16px;
  font-weight: 500;
}

.primary-button {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.primary-button:hover {
  background: #0056b3;
}

.hint {
  margin-top: 10px;
  font-size: 12px;
  color: #666;
}

kbd {
  padding: 2px 6px;
  background: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
}

.info-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: #e7f3ff;
  border-radius: 6px;
  margin-bottom: 20px;
  font-size: 13px;
}

.icon {
  font-size: 16px;
}

.last-command {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 30px;
}

.label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.command-text {
  font-size: 14px;
  font-style: italic;
  margin-bottom: 10px;
}

.result-preview {
  font-size: 12px;
  color: #333;
  padding: 8px;
  background: white;
  border-radius: 4px;
  max-height: 100px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 30px;
}

.settings-section h2 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 15px;
}

.setting-item {
  margin-bottom: 15px;
}

.setting-item label {
  display: block;
  font-size: 13px;
  margin-bottom: 5px;
  color: #333;
}

.setting-item input[type='text'],
.setting-item input[type='password'],
.setting-item select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}

.setting-item input[type='checkbox'] {
  margin-right: 8px;
}

.footer {
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid #eee;
  font-size: 12px;
  color: #666;
}

.footer a {
  color: #007bff;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}

.footer span {
  margin: 0 10px;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
