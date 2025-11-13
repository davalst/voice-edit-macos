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
        </header>

        <div class="dictionary-container">
          <!-- Add Form - always visible at top -->
          <div class="dictionary-add-form">
            <div class="form-row">
              <div class="form-field">
                <label>Correct Word</label>
                <input
                  v-model="dictionaryForm.correctWord"
                  type="text"
                  placeholder="e.g., Ebben"
                  class="text-input"
                  @keydown.enter="saveDictionaryEntry"
                />
              </div>
              <div class="form-field flex-grow">
                <label>Incorrect Variants (comma-separated)</label>
                <input
                  v-model="dictionaryVariantsInput"
                  type="text"
                  placeholder="e.g., Ebon, Evan, Eben"
                  class="text-input"
                  @keydown.enter="saveDictionaryEntry"
                />
              </div>
              <div class="form-actions">
                <button
                  v-if="dictionaryEditMode"
                  class="secondary-button-small"
                  @click="cancelDictionaryEdit"
                >
                  Cancel
                </button>
                <button
                  class="primary-button-small"
                  @click="saveDictionaryEntry"
                  :disabled="!dictionaryForm.correctWord.trim() || !dictionaryVariantsInput.trim()"
                >
                  {{ dictionaryEditMode ? 'Update' : 'Add' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="dictionaryEntries.length === 0" class="empty-state-inline">
            <div class="empty-icon">📖</div>
            <div class="empty-text">No custom words yet. Add your first entry above.</div>
          </div>

          <!-- Dictionary entries list -->
          <div v-else class="entries-list">
            <div
              v-for="entry in dictionaryEntries"
              :key="entry.id"
              :class="['entry-item', { editing: dictionaryEditMode && dictionaryEditId === entry.id }]"
            >
              <div class="entry-content">
                <div class="entry-word">{{ entry.correctWord }}</div>
                <div class="entry-variants">{{ entry.incorrectVariants.join(', ') }}</div>
              </div>
              <div class="entry-actions">
                <button class="icon-button" @click="editDictionaryEntry(entry)" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l6.286-6.286z"/>
                  </svg>
                </button>
                <button class="icon-button delete" @click="deleteDictionaryEntry(entry.id)" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19c.9 0 1.652-.681 1.741-1.576l.66-6.6a.75.75 0 00-1.492-.149l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6zM6.5 1.75V3h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Snippets View -->
      <div v-else-if="currentView === 'snippets'" class="view">
        <header class="view-header">
          <h1>Snippets</h1>
        </header>

        <div class="dictionary-container">
          <!-- Add Form - always visible at top -->
          <div class="dictionary-add-form">
            <div class="form-row">
              <div class="form-field">
                <label>Trigger Phrase</label>
                <input
                  v-model="snippetForm.trigger"
                  type="text"
                  placeholder="e.g., personal email"
                  class="text-input"
                  @keydown.enter="saveSnippetEntry"
                />
              </div>
              <div class="form-field flex-grow">
                <label>Expansion Text</label>
                <input
                  v-model="snippetForm.expansion"
                  type="text"
                  placeholder="e.g., user@example.com"
                  class="text-input"
                  @keydown.enter="saveSnippetEntry"
                />
              </div>
              <div class="form-actions">
                <button
                  v-if="snippetEditMode"
                  class="secondary-button-small"
                  @click="cancelSnippetEdit"
                >
                  Cancel
                </button>
                <button
                  class="primary-button-small"
                  @click="saveSnippetEntry"
                  :disabled="!snippetForm.trigger.trim() || !snippetForm.expansion.trim()"
                >
                  {{ snippetEditMode ? 'Update' : 'Add' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="snippetEntries.length === 0" class="empty-state-inline">
            <div class="empty-icon">✂️</div>
            <div class="empty-text">No snippets yet. Add your first entry above.</div>
          </div>

          <!-- Snippets entries list -->
          <div v-else class="entries-list">
            <div
              v-for="entry in snippetEntries"
              :key="entry.id"
              :class="['entry-item', { editing: snippetEditMode && snippetEditId === entry.id }]"
            >
              <div class="entry-content">
                <div class="entry-word">{{ entry.trigger }}</div>
                <div class="entry-variants">{{ entry.expansion }}</div>
              </div>
              <div class="entry-actions">
                <button class="icon-button" @click="editSnippetEntry(entry)" title="Edit">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.25.25 0 00.108-.064l6.286-6.286z"/>
                  </svg>
                </button>
                <button class="icon-button delete" @click="deleteSnippetEntry(entry.id)" title="Delete">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19c.9 0 1.652-.681 1.741-1.576l.66-6.6a.75.75 0 00-1.492-.149l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6zM6.5 1.75V3h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
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

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Show Flow bar at all times</div>
              <div class="setting-hint">Display overlay indicator on screen</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="showOverlay" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Show app in Dock</div>
              <div class="setting-hint">Display app icon in macOS Dock</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="showInDock" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">Dictation sound effects</div>
              <div class="setting-hint">Play beep when starting/stopping recording</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="dictationSoundEffects" @change="saveSettings" />
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
const showOverlay = ref(true)
const showInDock = ref(false)
const dictationSoundEffects = ref(false)

// Dictionary state
interface DictionaryEntry {
  id: string
  correctWord: string
  incorrectVariants: string[]
}
const dictionaryEntries = ref<DictionaryEntry[]>([])
const showDictionaryDialog = ref(false)
const dictionaryEditMode = ref(false)
const dictionaryEditId = ref<string | null>(null)
const dictionaryForm = ref({ correctWord: '', incorrectVariants: [] as string[] })
const dictionaryVariantsInput = ref('')

// Snippets state
interface SnippetEntry {
  id: string
  trigger: string
  expansion: string
}
const snippetEntries = ref<SnippetEntry[]>([])
const showSnippetDialog = ref(false)
const snippetEditMode = ref(false)
const snippetEditId = ref<string | null>(null)
const snippetForm = ref({ trigger: '', expansion: '' })

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

  // Keep unlimited logs (removed 100 limit for debugging)
  // if (consoleLogs.value.length > 100) {
  //   consoleLogs.value.shift()
  // }
}

/**
 * Clear console logs
 */
function clearConsoleLogs() {
  consoleLogs.value = []
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
      alert(`Failed to export logs:\n${result.error}`)
    }
  } catch (error: any) {
    console.error('[App] Export logs error:', error.message)
    alert(`Export error: ${error.message}`)
  }
}

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
  showOverlay.value = config.showOverlay !== false
  showInDock.value = config.showInDock === true
  dictationSoundEffects.value = config.dictationSoundEffects === true
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
    showOverlay: showOverlay.value,
    showInDock: showInDock.value,
    dictationSoundEffects: dictationSoundEffects.value,
  })

  console.log('Settings saved')

  // Reinitialize with new settings
  init(apiKey.value, screenSharingEnabled.value)
}

/**
 * Load Dictionary entries
 */
async function loadDictionaryEntries() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.dictionaryGetAll) return

  dictionaryEntries.value = await electronAPI.dictionaryGetAll()
}

/**
 * Show add dictionary dialog
 */
function showAddDictionaryDialog() {
  dictionaryEditMode.value = false
  dictionaryEditId.value = null
  dictionaryForm.value = { correctWord: '', incorrectVariants: [] }
  dictionaryVariantsInput.value = ''
  showDictionaryDialog.value = true
}

/**
 * Edit dictionary entry
 */
function editDictionaryEntry(entry: DictionaryEntry) {
  dictionaryEditMode.value = true
  dictionaryEditId.value = entry.id
  dictionaryForm.value = { correctWord: entry.correctWord, incorrectVariants: [...entry.incorrectVariants] }
  dictionaryVariantsInput.value = entry.incorrectVariants.join(', ')
}

/**
 * Cancel dictionary edit
 */
function cancelDictionaryEdit() {
  dictionaryEditMode.value = false
  dictionaryEditId.value = null
  dictionaryForm.value = { correctWord: '', incorrectVariants: [] }
  dictionaryVariantsInput.value = ''
}

/**
 * Save dictionary entry
 */
async function saveDictionaryEntry() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI) return

  // Parse variants from comma-separated input
  const variants = dictionaryVariantsInput.value
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0)

  const entry = {
    correctWord: dictionaryForm.value.correctWord.trim(),
    incorrectVariants: variants
  }

  if (!entry.correctWord || entry.incorrectVariants.length === 0) {
    return  // Button is disabled, but just in case
  }

  if (dictionaryEditMode.value && dictionaryEditId.value) {
    await electronAPI.dictionaryUpdate(dictionaryEditId.value, entry)
  } else {
    await electronAPI.dictionaryAdd(entry)
  }

  await loadDictionaryEntries()
  cancelDictionaryEdit()
}

/**
 * Delete dictionary entry
 */
async function deleteDictionaryEntry(id: string) {
  if (!confirm('Delete this dictionary entry?')) return

  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.dictionaryDelete) return

  await electronAPI.dictionaryDelete(id)
  await loadDictionaryEntries()
}

/**
 * Load Snippet entries
 */
async function loadSnippetEntries() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.snippetsGetAll) return

  snippetEntries.value = await electronAPI.snippetsGetAll()
}

/**
 * Show add snippet dialog
 */
function showAddSnippetDialog() {
  snippetEditMode.value = false
  snippetEditId.value = null
  snippetForm.value = { trigger: '', expansion: '' }
  showSnippetDialog.value = true
}

/**
 * Edit snippet entry
 */
function editSnippetEntry(entry: SnippetEntry) {
  snippetEditMode.value = true
  snippetEditId.value = entry.id
  snippetForm.value = { trigger: entry.trigger, expansion: entry.expansion }
}

/**
 * Cancel snippet edit
 */
function cancelSnippetEdit() {
  snippetEditMode.value = false
  snippetEditId.value = null
  snippetForm.value = { trigger: '', expansion: '' }
}

/**
 * Save snippet entry
 */
async function saveSnippetEntry() {
  const electronAPI = (window as any).electronAPI
  if (!electronAPI) return

  const entry = {
    trigger: snippetForm.value.trigger.trim(),
    expansion: snippetForm.value.expansion.trim()
  }

  if (!entry.trigger || !entry.expansion) {
    return  // Button is disabled, but just in case
  }

  if (snippetEditMode.value && snippetEditId.value) {
    await electronAPI.snippetsUpdate(snippetEditId.value, entry)
  } else {
    await electronAPI.snippetsAdd(entry)
  }

  await loadSnippetEntries()
  cancelSnippetEdit()
}

/**
 * Delete snippet entry
 */
async function deleteSnippetEntry(id: string) {
  if (!confirm('Delete this snippet?')) return

  const electronAPI = (window as any).electronAPI
  if (!electronAPI?.snippetsDelete) return

  await electronAPI.snippetsDelete(id)
  await loadSnippetEntries()
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
    addLog('info', args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '))
  }

  console.warn = (...args: any[]) => {
    originalConsole.warn(...args)
    addLog('warn', args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '))
  }

  console.error = (...args: any[]) => {
    originalConsole.error(...args)
    addLog('error', args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '))
  }

  // Load settings
  await loadSettings()

  // Load Dictionary and Snippets
  await loadDictionaryEntries()
  await loadSnippetEntries()

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

/* Test Controls */
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
