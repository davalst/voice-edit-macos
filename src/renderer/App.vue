<template>
  <div class="app">
    <!-- Sidebar Navigation (Wispr Flow style) -->
    <aside class="sidebar">
      <!-- App Header -->
      <div class="app-header">
        <div class="app-logo">
          <span class="logo-icon">🎤</span>
          <span class="app-name">Voice Edit</span>
        </div>
      </div>

      <!-- Main Navigation -->
      <nav class="main-nav">
        <a
          v-for="item in mainNavItems"
          :key="item.id"
          :class="['nav-item', { active: currentView === item.id }]"
          @click="currentView = item.id"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <!-- Settings Navigation -->
      <nav class="settings-nav">
        <div class="nav-section-label">SETTINGS</div>
        <a
          v-for="item in settingsNavItems"
          :key="item.id"
          :class="['nav-item', { active: currentView === item.id }]"
          @click="currentView = item.id"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <!-- Footer -->
      <div class="sidebar-footer">
        <div class="version">Voice Edit v1.0.0</div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="main-content">
      <!-- Home View -->
      <div v-if="currentView === 'home'" class="view">
        <header class="view-header">
          <h1>Welcome back</h1>
        </header>

        <div class="activity-feed">
          <div class="feed-header">
            <h2>Recent Activity</h2>
          </div>

          <div v-if="lastCommand" class="activity-item">
            <div class="activity-time">Just now</div>
            <div class="activity-content">
              <div class="activity-command">"{{ lastCommand }}"</div>
              <div v-if="lastResult" class="activity-result">{{ lastResult }}</div>
            </div>
          </div>

          <div v-else class="empty-state">
            <div class="empty-icon">🎤</div>
            <div class="empty-title">No activity yet</div>
            <div class="empty-description">Press Fn and speak to get started</div>
          </div>
        </div>
      </div>

      <!-- Dictionary View -->
      <div v-else-if="currentView === 'dictionary'" class="view">
        <header class="view-header">
          <h1>Dictionary</h1>
          <button class="primary-button">Add new</button>
        </header>

        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <div class="empty-title">No custom words yet</div>
          <div class="empty-description">Add words and names for better recognition</div>
        </div>
      </div>

      <!-- Snippets View -->
      <div v-else-if="currentView === 'snippets'" class="view">
        <header class="view-header">
          <h1>Snippets</h1>
          <button class="primary-button">Add new</button>
        </header>

        <div class="empty-state">
          <div class="empty-icon">✂️</div>
          <div class="empty-title">No snippets yet</div>
          <div class="empty-description">Save shortcuts to expand text instantly</div>
        </div>
      </div>

      <!-- General Settings View -->
      <div v-else-if="currentView === 'settings-general'" class="view">
        <header class="view-header">
          <h1>General</h1>
        </header>

        <div class="settings-content">
          <div class="setting-section">
            <h3>Keyboard shortcuts</h3>
            <p class="setting-description">Hold <strong>fn</strong> and speak. <a href="#">Learn more →</a></p>
            <div class="setting-value">
              <button class="change-button">Change</button>
            </div>
          </div>

          <div class="setting-section">
            <h3>Gemini API Key</h3>
            <p class="setting-description">Your AI model API key for voice processing</p>
            <div class="setting-input">
              <input
                v-model="apiKey"
                type="password"
                placeholder="Enter your Gemini API key"
                @blur="saveSettings"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- System Settings View -->
      <div v-else-if="currentView === 'settings-system'" class="view">
        <header class="view-header">
          <h1>System</h1>
        </header>

        <div class="settings-content">
          <div class="setting-section">
            <h3>App settings</h3>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Launch app at login</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="launchAtLogin" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Enable screen sharing (multimodal)</div>
              <div class="setting-hint">Allows AI to see your screen for context</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="screenSharingEnabled" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- Experimental Settings View -->
      <div v-else-if="currentView === 'settings-experimental'" class="view">
        <header class="view-header">
          <h1>Experimental</h1>
        </header>

        <div class="settings-content">
          <div class="empty-state">
            <div class="empty-icon">🧪</div>
            <div class="empty-title">No experimental features</div>
            <div class="empty-description">Check back later for beta features</div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVoiceEdit } from './composables/useVoiceEdit'

// Current view
const currentView = ref('home')

// Navigation items
const mainNavItems = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'dictionary', icon: '📖', label: 'Dictionary' },
  { id: 'snippets', icon: '✂️', label: 'Snippets' },
]

const settingsNavItems = [
  { id: 'settings-general', icon: '⚙️', label: 'General' },
  { id: 'settings-system', icon: '💻', label: 'System' },
  { id: 'settings-experimental', icon: '🧪', label: 'Experimental' },
]

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
  startRecordingWithMode,
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
    // Legacy Control+Space hotkey (toggle mode)
    electronAPI.onToggleRecording((_event: any, context: { selectedText: string; focusedAppName: string }) => {
      toggleRecording(context)
    })

    // New Fn/Fn+Ctrl hotkey (multi-mode)
    electronAPI.onStartRecording((_event: any, config: any) => {
      console.log('[App] Start recording event received:', config)
      startRecordingWithMode(config)
    })

    electronAPI.onStopRecording(() => {
      console.log('[App] Stop recording event received')
      stopRecording()
    })
  }
})
</script>

<style scoped>
/* Wispr Flow-inspired Design System */
.app {
  display: flex;
  height: 100vh;
  background: #f9fafb;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.app-header {
  padding: 20px;
  border-bottom: 1px solid #f3f4f6;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 24px;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.main-nav, .settings-nav {
  padding: 16px;
}

.nav-section-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding: 0 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
}

.nav-item:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.nav-item.active {
  background: #f3f4f6;
  color: #1f2937;
  font-weight: 500;
}

.nav-icon {
  font-size: 18px;
  line-height: 1;
}

.nav-label {
  font-size: 14px;
}

.sidebar-footer {
  margin-top: auto;
  padding: 20px;
  border-top: 1px solid #f3f4f6;
}

.version {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

/* Main Content */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
}

.view {
  max-width: 900px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.view-header h1 {
  font-size: 32px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.primary-button {
  padding: 10px 20px;
  background: #1f2937;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-button:hover {
  background: #111827;
}

/* Activity Feed */
.activity-feed {
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.feed-header {
  padding: 20px;
  border-bottom: 1px solid #f3f4f6;
}

.feed-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.activity-item {
  padding: 20px;
  border-bottom: 1px solid #f3f4f6;
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-time {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 8px;
}

.activity-command {
  font-size: 15px;
  color: #1f2937;
  margin-bottom: 8px;
  font-style: italic;
}

.activity-result {
  font-size: 13px;
  color: #6b7280;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
}

/* Empty States */
.empty-state {
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
}

.empty-description {
  font-size: 14px;
  color: #6b7280;
}

/* Settings */
.settings-content {
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 24px;
}

.setting-section {
  margin-bottom: 32px;
}

.setting-section:last-child {
  margin-bottom: 0;
}

.setting-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 8px 0;
}

.setting-description {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 16px 0;
}

.setting-description strong {
  font-weight: 600;
  color: #1f2937;
}

.setting-description a {
  color: #3b82f6;
  text-decoration: none;
}

.setting-description a:hover {
  text-decoration: underline;
}

.setting-input input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
}

.setting-input input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.change-button {
  padding: 8px 16px;
  background: #f3f4f6;
  color: #1f2937;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.change-button:hover {
  background: #e5e7eb;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f3f4f6;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-label {
  font-size: 15px;
  color: #1f2937;
  margin-bottom: 4px;
}

.setting-hint {
  font-size: 13px;
  color: #6b7280;
}

/* Toggle Switch */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #d1d5db;
  border-radius: 24px;
  transition: 0.3s;
}

.toggle-slider:before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background-color: #10b981;
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(20px);
}
</style>
