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

          <!-- ✅ REMOVED: Multimodal toggle - now controlled by Fn+Ctrl key combination -->
          <!-- Mode selection is now per-command: Fn = STT only, Fn+Ctrl = Multimodal -->

          <div class="setting-info-box">
            <div class="info-title">🎤 Voice Input Modes</div>
            <div class="info-text">
              <p><strong>Fn key:</strong> Dictation mode (mic only)</p>
              <p><strong>Fn + Ctrl:</strong> Command mode with screen context</p>
              <p style="margin-top: 10px; opacity: 0.7;">Mode is selected per-command by which keys you press.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Experimental Settings View -->
      <div v-else-if="currentView === 'settings-experimental'" class="view">
        <header class="view-header">
          <h1>Experimental</h1>
        </header>

        <div class="settings-content">
          <!-- Recording Test Controls -->
          <div class="setting-section">
            <h3>Voice Recording Test</h3>
            <p class="setting-description">Manual controls for testing voice recording</p>
            <div class="test-controls">
              <button
                @click="toggleRecording()"
                :class="['test-button', isRecording ? 'recording' : '']"
              >
                <span v-if="!isRecording">▶️ Start Recording</span>
                <span v-else>⏸️ Stop Recording</span>
              </button>
              <div class="status-badge" :class="{ active: isRecording }">
                {{ isRecording ? '🔴 Recording' : '⚪️ Idle' }}
              </div>
              <div v-if="isScreenSharing" class="status-badge active">
                📹 Screen Capture Active
              </div>
            </div>
          </div>

          <!-- Console Log View -->
          <div class="setting-section">
            <div class="console-header">
              <h3>Console Logs</h3>
              <div class="console-buttons">
                <button @click="exportConsoleLogs" class="export-button">Export</button>
                <button @click="clearConsoleLogs" class="clear-button">Clear</button>
              </div>
            </div>
            <div class="console-log" ref="consoleLogContainer">
              <div
                v-for="(log, index) in consoleLogs"
                :key="index"
                :class="['log-entry', `log-${log.level}`]"
              >
                <span class="log-time">{{ log.time }}</span>
                <span class="log-level">{{ log.level.toUpperCase() }}</span>
                <span class="log-message">{{ log.message }}</span>
              </div>
              <div v-if="consoleLogs.length === 0" class="empty-console">
                No logs yet. Start recording to see activity.
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVoiceEdit } from './composables/useVoiceEdit'
import { RecordingMode } from '../shared/types'  // ✅ Import for mode selection

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
// ✅ REMOVED screenSharingEnabled - multimodal is now per-command via Fn+Ctrl
const launchAtLogin = ref(false)

// Voice edit state
const {
  inRecordMode,
  isRecording,
  isScreenSharing,
  lastCommand,
  lastResult,
  selectedText,
  focusedAppName,
  startRecordingWithMode,
  stopRecording,
  enterRecordMode,
  exitRecordMode,
  manualTriggerProcessing,
  init,
} = useVoiceEdit()

// Console logging
interface ConsoleLog {
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
}
const consoleLogs = ref<ConsoleLog[]>([])
const consoleLogContainer = ref<HTMLElement | null>(null)

/**
 * Add log entry
 */
function addLog(level: ConsoleLog['level'], message: string) {
  const time = new Date().toLocaleTimeString()
  consoleLogs.value.push({ time, level, message })

  // Auto-scroll to bottom
  setTimeout(() => {
    if (consoleLogContainer.value) {
      consoleLogContainer.value.scrollTop = consoleLogContainer.value.scrollHeight
    }
  }, 50)

  // NO LIMIT - Keep all logs for debugging
  // User requested unlimited log retention to see full history
}

/**
 * Export console logs to file
 */
async function exportConsoleLogs() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.exportLogs) {
    console.error('[App] Export logs API not available')
    return
  }

  try {
    // Format logs as text
    const logsText = consoleLogs.value
      .map(log => `[${log.time}] ${log.level.toUpperCase()}: ${log.message}`)
      .join('\n')

    // Call IPC to save file
    const result = await electronAPI.exportLogs(logsText)

    if (result.success) {
      console.log('[App] Logs exported successfully to:', result.filepath)
      alert(`Logs exported to:\n${result.filepath}`)
    } else {
      console.error('[App] Failed to export logs:', result.error)
      alert(`Failed to export logs: ${result.error}`)
    }
  } catch (error: any) {
    console.error('[App] Error exporting logs:', error)
    alert(`Error exporting logs: ${error.message}`)
  }
}

/**
 * Clear console logs
 */
function clearConsoleLogs() {
  consoleLogs.value = []
}

/**
 * Toggle recording on/off
 */
function toggleRecording(context?: { selectedText?: string; focusedAppName?: string }) {
  // Control+Space toggles RECORD MODE (not recording directly)
  if (inRecordMode.value) {
    addLog('info', '⏸️ Exiting RECORD MODE...')
    exitRecordMode()
  } else {
    addLog('info', '▶️ Entering RECORD MODE (hold Fn to talk)...')
    addLog('info', `📝 Context: ${context?.focusedAppName || '(none)'}, Text: ${context?.selectedText?.substring(0, 30) || '(none)'}`)
    enterRecordMode(context)
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
  // ✅ REMOVED screenSharingEnabled - multimodal is now per-command via Fn+Ctrl
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
    // ✅ REMOVED screenSharingEnabled - multimodal is now per-command via Fn+Ctrl
    launchAtLogin: launchAtLogin.value,
  })

  console.log('Settings saved')

  // Reinitialize with new API key (multimodal now per-command via Fn+Ctrl)
  init(apiKey.value)
}

/**
 * Lifecycle
 */
onMounted(async () => {
  // Intercept console methods to display in UI
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }

  console.log = (...args: any[]) => {
    originalConsole.log(...args)
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
    addLog('info', message)
    ;(window as any).electronAPI?.writeLog?.('info', message)
  }

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args)
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
    addLog('warn', message)
    ;(window as any).electronAPI?.writeLog?.('warn', message)
  }

  console.error = (...args: any[]) => {
    originalConsole.error(...args)
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
    addLog('error', message)
    ;(window as any).electronAPI?.writeLog?.('error', message)
  }

  // Load settings
  await loadSettings()

  // Initialize voice edit engine (multimodal now per-command via Fn+Ctrl)
  init(apiKey.value)

  // Listen for hotkey from main process
  const electronAPI = (window as any).electronAPI
  if (electronAPI) {
    // Control+Space hotkey (toggle RECORD MODE with context capture)
    electronAPI.onToggleRecording((_event: any, context: { selectedText?: string; focusedAppName?: string }) => {
      console.log('[App] Control+Space pressed - context:', {
        selectedText: context?.selectedText?.substring(0, 50) || '(none)',
        focusedAppName: context?.focusedAppName || '(none)'
      })
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

    // Fn Key Push-to-Talk handler (triggered by native key monitor from main process)
    // ✅ FIXED: Uses CACHED context from Ctrl+Space (not from Fn press!)
    electronAPI.onPttPressed(async (data: { isRecording: boolean; mode?: string }) => {
      console.log('[App] Fn key event, isRecording:', data.isRecording, 'mode:', data.mode)

      if (!inRecordMode.value) {
        console.log('[App] Not in RECORD MODE, ignoring Fn key')
        return
      }

      if (data.isRecording) {
        // Fn pressed - start recording using CACHED context from Ctrl+Space
        console.log('[App] Using context captured at Ctrl+Space:')
        console.log('  - Selected text:', selectedText.value.substring(0, 50) || '(none)')
        console.log('  - Focused app:', focusedAppName.value)

        if (data.mode === 'multimodal') {
          // Fn+Ctrl pressed - start multimodal mode (mic + screen)
          addLog('info', '🎤📺 Fn+Ctrl pressed - starting multimodal mode...')
          await startRecordingWithMode({
            mode: RecordingMode.STT_SCREEN_HOLD,
            enableScreenCapture: true,
            isToggleMode: false,
            selectedText: selectedText.value,  // ← USE CACHED CONTEXT!
            focusedAppName: focusedAppName.value
          })
        } else {
          // Fn only pressed - start STT mode (mic only, no screen)
          addLog('info', '🎤 Fn pressed - starting STT mode...')
          await startRecordingWithMode({
            mode: RecordingMode.STT_ONLY_HOLD,
            enableScreenCapture: false,  // ← NO screen capture
            isToggleMode: false,
            selectedText: selectedText.value,  // ← USE CACHED CONTEXT!
            focusedAppName: focusedAppName.value
          })
        }
      } else {
        // Fn released - trigger processing
        // NOTE: stopRecording() is called inside manualTriggerProcessing after sending turnComplete
        addLog('info', '🎤 Fn released - processing...')
        await manualTriggerProcessing()
      }
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

/* Setting Info Box */
.setting-info-box {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-top: 16px;
}

.info-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 12px;
}

.info-text {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.6;
}

.info-text p {
  margin: 6px 0;
}

.info-text strong {
  color: #1f2937;
  font-weight: 600;
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

/* Test Controls (Experimental Tab) */
.test-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.test-button {
  padding: 12px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-button:hover {
  background: #2563eb;
}

.test-button.recording {
  background: #ef4444;
}

.test-button.recording:hover {
  background: #dc2626;
}

.status-badge {
  padding: 6px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.status-badge.active {
  background: #dcfce7;
  color: #16a34a;
}

/* Console Log */
.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.console-buttons {
  display: flex;
  gap: 8px;
}

.export-button,
.clear-button {
  padding: 6px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.export-button:hover,
.clear-button:hover {
  background: #e5e7eb;
}

.export-button {
  background: #3b82f6;
  color: white;
}

.export-button:hover {
  background: #2563eb;
}

.console-log {
  background: #111827;
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
  font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.5;
}

.log-time {
  color: #6b7280;
  flex-shrink: 0;
}

.log-level {
  flex-shrink: 0;
  font-weight: 600;
}

.log-info .log-level {
  color: #3b82f6;
}

.log-warn .log-level {
  color: #f59e0b;
}

.log-error .log-level {
  color: #ef4444;
}

.log-message {
  color: #e5e7eb;
  flex: 1;
  word-break: break-word;
}

.empty-console {
  color: #6b7280;
  text-align: center;
  padding: 40px 20px;
  font-size: 13px;
}
</style>
