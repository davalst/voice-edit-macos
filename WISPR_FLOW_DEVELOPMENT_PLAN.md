# Voice Edit - Wispr Flow Feature Parity Development Plan

## Executive Summary

This document outlines a comprehensive development plan to enhance Voice Edit with Wispr Flow-inspired features while maintaining all current functionality. The plan includes press-and-hold hotkey detection, overlay UI, local AI model support, and extensive UX improvements using Ebben POC styling.

---

## Current State Analysis

### ✅ Working Features (DO NOT BREAK)
1. **Screen Capture**: Window-specific capture during recording only
2. **Voice Recording**: Audio recording with VAD (1.5s silence detection)
3. **Gemini Integration**: Multimodal AI with video + audio streaming
4. **Security**: Screen sharing only active during recording
5. **Commands**: Translation, editing, queries working with highlighted text
6. **Hotkeys**: Control+Space and Command+Space toggle recording

### 🎯 Target Features (From Wispr Flow Analysis)
1. **Press-and-hold activation** (Fn key for STT, Fn+Ctrl for screen recording)
2. **Visual overlay indicators** showing mode and status
3. **Multiple input modes** with clear visual feedback
4. **Local AI model support** (Whisper, Llama, Mistral)
5. **Enhanced UX** matching Ebben POC design language
6. **Double-tap gestures** for alternative activation

---

## Phase 1: Press-and-Hold Hotkey System

### Technical Research Summary

**Challenge**: macOS Fn key returns keycode 0, making standard detection impossible
**Solution**: Multi-layered approach using IOKit + AppleScript monitoring

### Implementation Strategy

#### 1.1 Native Module for Fn Key Detection

```objective-c
// src/native/KeyMonitor.mm
// Uses IOKit to monitor Fn key state at low level

#import <IOKit/hid/IOHIDManager.h>
#import <IOKit/hid/IOHIDKeys.h>

@interface KeyMonitor : NSObject
- (void)startMonitoring;
- (void)stopMonitoring;
- (BOOL)isFnPressed;
- (BOOL)isCtrlPressed;
@end
```

**Dependencies**:
- `node-gyp` for native module compilation
- IOKit framework (built into macOS)
- Electron native addon API

**Files to Create**:
- `src/native/KeyMonitor.mm` - Objective-C++ key monitoring
- `src/native/binding.gyp` - Native module build configuration
- `src/native/index.ts` - TypeScript bindings
- `src/main/key-monitor-manager.ts` - Manager class for main process

#### 1.2 Press-and-Hold State Machine

```typescript
// src/main/hotkey-state-machine.ts

enum HotkeyState {
  IDLE = 'idle',
  FN_PRESSED = 'fn_pressed',          // Fn held (STT mode)
  FN_CTRL_PRESSED = 'fn_ctrl_pressed', // Fn+Ctrl held (STT + Screen mode)
  DOUBLE_TAP = 'double_tap'            // Double Fn/Ctrl (toggle mode)
}

interface HotkeyEvent {
  state: HotkeyState
  timestamp: number
  duration: number
}
```

**Features**:
- Press detection (keydown)
- Hold duration tracking
- Release detection (keyup)
- Double-tap gesture detection (< 300ms between presses)
- Debouncing for accidental presses

**Files to Create**:
- `src/main/hotkey-state-machine.ts` - State machine logic
- `src/main/gesture-detector.ts` - Double-tap detection

#### 1.3 Integration with Existing System

```typescript
// src/main/index.ts (modifications)

import { KeyMonitor } from './key-monitor-manager'
import { HotkeyStateMachine } from './hotkey-state-machine'

const keyMonitor = new KeyMonitor()
const stateMachine = new HotkeyStateMachine()

keyMonitor.on('fnPress', () => {
  stateMachine.transition('fn_pressed')
  // Start STT only (no screen capture)
  mainWindow?.webContents.send('start-recording', {
    mode: 'stt_only',
    selectedText: await getSelectedText(),
    focusedAppName: await getFocusedAppName()
  })
})

keyMonitor.on('fnCtrlPress', () => {
  stateMachine.transition('fn_ctrl_pressed')
  // Start STT + screen capture
  mainWindow?.webContents.send('start-recording', {
    mode: 'stt_with_screen',
    selectedText: await getSelectedText(),
    focusedAppName: await getFocusedAppName()
  })
})

keyMonitor.on('fnRelease', () => {
  // Stop recording immediately on release
  mainWindow?.webContents.send('stop-recording')
  stateMachine.transition('idle')
})
```

**Testing Strategy**:
- Unit tests for state machine transitions
- Integration tests for key press/release sequences
- Manual testing with all hotkey combinations
- Edge case testing (rapid press/release, held for long duration)

---

## Phase 2: Visual Overlay System

### Overlay UI Components (Inspired by Wispr Flow)

#### 2.1 Floating Overlay Window

```typescript
// src/main/overlay-window.ts

interface OverlayConfig {
  mode: 'stt_only' | 'stt_with_screen' | 'idle'
  position: 'top' | 'bottom' | 'center'
  theme: 'light' | 'dark' | 'auto'
}

function createOverlayWindow(config: OverlayConfig): BrowserWindow {
  return new BrowserWindow({
    width: 300,
    height: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
}
```

#### 2.2 Overlay Vue Components

```vue
<!-- src/overlay/OverlayIndicator.vue -->
<template>
  <div class="overlay-container" :class="modeClass">
    <!-- Mode Indicator -->
    <div class="mode-indicator">
      <div class="icon-container">
        <i v-if="mode === 'stt_only'" class="fa fa-microphone pulse" />
        <i v-else-if="mode === 'stt_with_screen'" class="fa fa-video pulse" />
        <i v-else class="fa fa-circle" />
      </div>

      <!-- Status Text -->
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- Waveform Visualization (during recording) -->
    <div v-if="isRecording" class="waveform">
      <canvas ref="waveformCanvas" />
    </div>

    <!-- Duration Counter -->
    <div v-if="isRecording" class="duration">
      {{ formattedDuration }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWaveformVisualizer } from './composables/useWaveformVisualizer'

interface Props {
  mode: 'stt_only' | 'stt_with_screen' | 'idle'
  isRecording: boolean
  audioDuration: number
}

const props = defineProps<Props>()

const statusText = computed(() => {
  if (props.mode === 'stt_only') return 'Listening...'
  if (props.mode === 'stt_with_screen') return 'Listening + Screen'
  return 'Ready'
})

const modeClass = computed(() => `mode-${props.mode}`)

const { waveformCanvas } = useWaveformVisualizer()
</script>

<style scoped>
.overlay-container {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 16px 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

.mode-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-container {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}

.mode-stt_only {
  border-left: 4px solid #4A90E2;
}

.mode-stt_with_screen {
  border-left: 4px solid #7B68EE;
}

.waveform canvas {
  width: 100%;
  height: 40px;
  margin-top: 8px;
}

.status-text {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.duration {
  margin-top: 8px;
  font-size: 12px;
  color: #666;
  font-variant-numeric: tabular-nums;
}
</style>
```

#### 2.3 Ebben POC Design System

```typescript
// src/overlay/design-system.ts

export const colors = {
  primary: '#4A90E2',      // Blue (from Ebben)
  secondary: '#7B68EE',    // Purple
  success: '#5CB85C',      // Green
  warning: '#F0AD4E',      // Orange
  danger: '#D9534F',       // Red
  text: '#333333',
  textLight: '#666666',
  background: 'rgba(255, 255, 255, 0.95)',
  border: 'rgba(255, 255, 255, 0.3)'
}

export const fonts = {
  primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
  mono: '"SF Mono", "Monaco", "Inconsolata", monospace'
}

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px'
}

export const borderRadius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  full: '9999px'
}
```

**Files to Create**:
- `src/overlay/` - New directory for overlay UI
- `src/overlay/App.vue` - Overlay root component
- `src/overlay/OverlayIndicator.vue` - Main indicator component
- `src/overlay/composables/useWaveformVisualizer.ts` - Audio visualization
- `src/overlay/design-system.ts` - Design tokens
- `src/main/overlay-window.ts` - Overlay window manager

---

## Phase 3: Local AI Model Integration

### 3.1 Architecture for Hybrid AI

```typescript
// src/main/ai-provider-manager.ts

interface AIProvider {
  name: string
  type: 'local' | 'cloud'
  capabilities: {
    stt: boolean
    llm: boolean
    vision: boolean
  }
}

const providers: AIProvider[] = [
  {
    name: 'gemini',
    type: 'cloud',
    capabilities: { stt: true, llm: true, vision: true }
  },
  {
    name: 'whisper-local',
    type: 'local',
    capabilities: { stt: true, llm: false, vision: false }
  },
  {
    name: 'llama-local',
    type: 'local',
    capabilities: { stt: false, llm: true, vision: false }
  },
  {
    name: 'mistral-local',
    type: 'local',
    capabilities: { stt: false, llm: true, vision: false }
  }
]

class AIProviderManager {
  private currentSTT: AIProvider = providers[0]
  private currentLLM: AIProvider = providers[0]

  async transcribe(audioData: Buffer): Promise<string> {
    if (this.currentSTT.name === 'whisper-local') {
      return this.whisperTranscribe(audioData)
    }
    return this.geminiTranscribe(audioData)
  }

  async processCommand(text: string, context: string): Promise<any> {
    if (this.currentLLM.name === 'llama-local') {
      return this.llamaProcess(text, context)
    }
    if (this.currentLLM.name === 'mistral-local') {
      return this.mistralProcess(text, context)
    }
    return this.geminiProcess(text, context)
  }
}
```

### 3.2 Local Whisper Integration

```typescript
// src/main/local-ai/whisper-service.ts

import { spawn } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

interface WhisperConfig {
  modelPath: string
  language: string
  task: 'transcribe' | 'translate'
}

class WhisperService {
  private config: WhisperConfig

  constructor(config: WhisperConfig) {
    this.config = config
  }

  async transcribe(audioBuffer: Buffer): Promise<string> {
    // Save audio to temp file
    const tempFile = join(tmpdir(), `voice-edit-${Date.now()}.wav`)
    writeFileSync(tempFile, audioBuffer)

    try {
      // Run whisper.cpp or whisper Python
      const result = await this.runWhisper(tempFile)
      return result.text
    } finally {
      // Cleanup temp file
      unlinkSync(tempFile)
    }
  }

  private async runWhisper(audioFile: string): Promise<{ text: string }> {
    return new Promise((resolve, reject) => {
      // Option 1: whisper.cpp (faster, C++ implementation)
      const whisper = spawn('/usr/local/bin/whisper', [
        audioFile,
        '-m', this.config.modelPath,
        '-l', this.config.language,
        '-f', 'json'
      ])

      let output = ''
      whisper.stdout.on('data', (data) => {
        output += data.toString()
      })

      whisper.on('close', (code) => {
        if (code === 0) {
          const result = JSON.parse(output)
          resolve(result)
        } else {
          reject(new Error(`Whisper failed with code ${code}`))
        }
      })
    })
  }
}

export default WhisperService
```

### 3.3 Local Llama Integration

```typescript
// src/main/local-ai/llama-service.ts

import { spawn } from 'child_process'

interface LlamaConfig {
  modelPath: string
  contextSize: number
  threads: number
}

class LlamaService {
  private config: LlamaConfig

  async processText(
    command: string,
    focusText: string,
    systemPrompt: string
  ): Promise<string> {
    const prompt = this.buildPrompt(command, focusText, systemPrompt)

    return new Promise((resolve, reject) => {
      // Use llama.cpp for local inference
      const llama = spawn('/usr/local/bin/llama', [
        '-m', this.config.modelPath,
        '-n', '512', // max tokens
        '-c', this.config.contextSize.toString(),
        '-t', this.config.threads.toString(),
        '-p', prompt
      ])

      let output = ''
      llama.stdout.on('data', (data) => {
        output += data.toString()
      })

      llama.on('close', (code) => {
        if (code === 0) {
          resolve(this.parseOutput(output))
        } else {
          reject(new Error(`Llama failed with code ${code}`))
        }
      })
    })
  }

  private buildPrompt(command: string, focusText: string, systemPrompt: string): string {
    return `${systemPrompt}

Command: ${command}
Focus Text: ${focusText}

Response:`
  }

  private parseOutput(output: string): string {
    // Extract JSON response from llama output
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return parsed.result || output
    }
    return output.trim()
  }
}

export default LlamaService
```

### 3.4 Settings UI for AI Provider Selection

```vue
<!-- src/renderer/components/AIProviderSettings.vue -->
<template>
  <div class="ai-settings">
    <h3>AI Provider Settings</h3>

    <!-- STT Provider -->
    <div class="setting-group">
      <label>Speech-to-Text</label>
      <select v-model="sttProvider">
        <option value="gemini">Gemini (Cloud, Fast)</option>
        <option value="whisper-local">Whisper (Local, Private)</option>
      </select>
      <p class="help-text">
        Local uses less API calls but requires Whisper installed
      </p>
    </div>

    <!-- LLM Provider -->
    <div class="setting-group">
      <label>Language Model</label>
      <select v-model="llmProvider">
        <option value="gemini">Gemini 2.0 Flash (Cloud, Multimodal)</option>
        <option value="llama-local">Llama (Local, Private)</option>
        <option value="mistral-local">Mistral (Local, Fast)</option>
      </select>
      <p class="help-text">
        Note: Local models cannot process screen video
      </p>
    </div>

    <!-- Screen Analysis -->
    <div class="setting-group">
      <label>
        <input type="checkbox" v-model="enableScreenAnalysis" />
        Enable Screen Analysis (Requires Cloud LLM)
      </label>
      <p class="help-text" v-if="!canUseScreenAnalysis">
        Switch to cloud LLM to enable screen analysis
      </p>
    </div>

    <!-- Model Paths (for local) -->
    <div v-if="isLocalSTT || isLocalLLM" class="setting-group">
      <h4>Local Model Configuration</h4>

      <div v-if="isLocalSTT">
        <label>Whisper Model Path</label>
        <input type="text" v-model="whisperModelPath" />
        <button @click="selectWhisperModel">Browse...</button>
      </div>

      <div v-if="llmProvider === 'llama-local'">
        <label>Llama Model Path</label>
        <input type="text" v-model="llamaModelPath" />
        <button @click="selectLlamaModel">Browse...</button>
      </div>

      <div v-if="llmProvider === 'mistral-local'">
        <label>Mistral Model Path</label>
        <input type="text" v-model="mistralModelPath" />
        <button @click="selectMistralModel">Browse...</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const sttProvider = ref('gemini')
const llmProvider = ref('gemini')
const enableScreenAnalysis = ref(true)

const whisperModelPath = ref('/usr/local/models/whisper/ggml-base.en.bin')
const llamaModelPath = ref('/usr/local/models/llama/llama-2-7b-chat.gguf')
const mistralModelPath = ref('/usr/local/models/mistral/mistral-7b-instruct.gguf')

const isLocalSTT = computed(() => sttProvider.value !== 'gemini')
const isLocalLLM = computed(() => llmProvider.value !== 'gemini')

const canUseScreenAnalysis = computed(() => {
  return llmProvider.value === 'gemini'
})

function selectWhisperModel() {
  // Use Electron dialog to select model file
  const electronAPI = (window as any).electronAPI
  electronAPI?.selectFile?.((path: string) => {
    whisperModelPath.value = path
  })
}

function selectLlamaModel() {
  // Similar to above
}

function selectMistralModel() {
  // Similar to above
}
</script>
```

**Files to Create**:
- `src/main/ai-provider-manager.ts` - Provider management
- `src/main/local-ai/whisper-service.ts` - Whisper integration
- `src/main/local-ai/llama-service.ts` - Llama integration
- `src/main/local-ai/mistral-service.ts` - Mistral integration
- `src/renderer/components/AIProviderSettings.vue` - Settings UI

---

## Phase 4: Multi-Mode Recording System

### 4.1 Recording Modes

```typescript
// src/shared/types.ts

export enum RecordingMode {
  IDLE = 'idle',
  STT_ONLY = 'stt_only',              // Fn held - audio only
  STT_WITH_SCREEN = 'stt_with_screen', // Fn+Ctrl held - audio + screen
  TOGGLE_STT = 'toggle_stt',           // Double Fn - toggle audio
  TOGGLE_FULL = 'toggle_full'          // Double Fn+Ctrl - toggle audio + screen
}

export interface RecordingContext {
  mode: RecordingMode
  selectedText: string
  focusedAppName: string
  timestamp: number
}
```

### 4.2 Mode Manager

```typescript
// src/renderer/composables/useRecordingMode.ts

import { ref, computed } from 'vue'
import { RecordingMode } from '@shared/types'

export function useRecordingMode() {
  const currentMode = ref<RecordingMode>(RecordingMode.IDLE)
  const isRecording = computed(() => currentMode.value !== RecordingMode.IDLE)
  const hasScreenCapture = computed(() =>
    currentMode.value === RecordingMode.STT_WITH_SCREEN ||
    currentMode.value === RecordingMode.TOGGLE_FULL
  )

  function startMode(mode: RecordingMode, context: RecordingContext) {
    currentMode.value = mode

    if (hasScreenCapture.value) {
      startScreenSharing(context.focusedAppName)
    }

    startAudioRecording()
    showOverlay(mode)
  }

  function stopMode() {
    if (hasScreenCapture.value) {
      stopScreenSharing()
    }

    stopAudioRecording()
    hideOverlay()
    currentMode.value = RecordingMode.IDLE
  }

  return {
    currentMode,
    isRecording,
    hasScreenCapture,
    startMode,
    stopMode
  }
}
```

**Files to Create**:
- `src/shared/types.ts` - Shared type definitions
- `src/renderer/composables/useRecordingMode.ts` - Mode management
- Updated `useVoiceEdit.ts` to use new mode system

---

## Phase 5: Enhanced UX Features

### 5.1 Keyboard Shortcut Customization

```vue
<!-- src/renderer/components/ShortcutCustomizer.vue -->
<template>
  <div class="shortcut-customizer">
    <h3>Keyboard Shortcuts</h3>

    <div class="shortcut-item">
      <div class="shortcut-label">Press & Hold for STT</div>
      <div class="shortcut-value">
        <kbd>Fn</kbd>
      </div>
      <p class="shortcut-hint">Hold to start, release to stop</p>
    </div>

    <div class="shortcut-item">
      <div class="shortcut-label">Press & Hold for STT + Screen</div>
      <div class="shortcut-value">
        <kbd>Fn</kbd> + <kbd>Ctrl</kbd>
      </div>
      <p class="shortcut-hint">Hold both to start, release to stop</p>
    </div>

    <div class="shortcut-item">
      <div class="shortcut-label">Double-tap to Toggle STT</div>
      <div class="shortcut-value">
        <kbd>Fn</kbd> <kbd>Fn</kbd>
      </div>
      <p class="shortcut-hint">Quick double-press</p>
    </div>

    <div class="shortcut-item">
      <div class="shortcut-label">Double-tap to Toggle Full</div>
      <div class="shortcut-value">
        <kbd>Fn</kbd> + <kbd>Ctrl</kbd> (2x)
      </div>
      <p class="shortcut-hint">Quick double-press both</p>
    </div>

    <div class="shortcut-item">
      <div class="shortcut-label">Legacy Toggle (Current Behavior)</div>
      <div class="shortcut-value">
        <select v-model="legacyShortcut">
          <option value="Control+Space">Control+Space</option>
          <option value="Command+Space">⌘+Space</option>
          <option value="F13">F13</option>
          <option value="F14">F14</option>
        </select>
      </div>
      <p class="shortcut-hint">Single press to toggle on/off</p>
    </div>
  </div>
</template>
```

### 5.2 Status Dashboard

```vue
<!-- src/renderer/components/StatusDashboard.vue -->
<template>
  <div class="status-dashboard">
    <div class="stats-grid">
      <!-- Recording Stats -->
      <div class="stat-card">
        <div class="stat-icon">🎤</div>
        <div class="stat-value">{{ totalRecordings }}</div>
        <div class="stat-label">Total Recordings</div>
      </div>

      <!-- API Usage -->
      <div class="stat-card">
        <div class="stat-icon">☁️</div>
        <div class="stat-value">{{ apiCallsToday }}</div>
        <div class="stat-label">API Calls Today</div>
        <div class="stat-hint">Estimated cost: ${{ estimatedCost }}</div>
      </div>

      <!-- Local Processing -->
      <div class="stat-card">
        <div class="stat-icon">💻</div>
        <div class="stat-value">{{ localProcessingPercent }}%</div>
        <div class="stat-label">Local Processing</div>
        <div class="stat-hint">Saves API costs</div>
      </div>

      <!-- Success Rate -->
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-value">{{ successRate }}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
    </div>

    <!-- Recent Commands -->
    <div class="recent-commands">
      <h4>Recent Commands</h4>
      <div class="command-list">
        <div
          v-for="cmd in recentCommands"
          :key="cmd.id"
          class="command-item"
        >
          <div class="command-text">"{{ cmd.text }}"</div>
          <div class="command-result">{{ cmd.result }}</div>
          <div class="command-meta">
            <span class="timestamp">{{ formatTimestamp(cmd.timestamp) }}</span>
            <span class="provider">{{ cmd.provider }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

**Files to Create**:
- `src/renderer/components/ShortcutCustomizer.vue`
- `src/renderer/components/StatusDashboard.vue`
- `src/renderer/components/UsageStats.vue`

---

## Phase 6: Testing Strategy

### 6.1 Unit Tests

```typescript
// tests/unit/hotkey-state-machine.test.ts

describe('HotkeyStateMachine', () => {
  it('should transition from idle to fn_pressed on Fn key down', () => {
    const machine = new HotkeyStateMachine()
    machine.transition('fn_pressed')
    expect(machine.currentState).toBe(HotkeyState.FN_PRESSED)
  })

  it('should detect double-tap within 300ms', () => {
    const machine = new HotkeyStateMachine()
    const detector = new GestureDetector()

    detector.onKeyPress('fn', 0)
    detector.onKeyRelease('fn', 50)
    detector.onKeyPress('fn', 200)

    expect(detector.isDoubleTap()).toBe(true)
  })

  it('should NOT detect double-tap after 300ms', () => {
    const detector = new GestureDetector()

    detector.onKeyPress('fn', 0)
    detector.onKeyRelease('fn', 50)
    detector.onKeyPress('fn', 400)

    expect(detector.isDoubleTap()).toBe(false)
  })
})
```

### 6.2 Integration Tests

```typescript
// tests/integration/recording-flow.test.ts

describe('Recording Flow', () => {
  it('should start STT-only mode when Fn pressed', async () => {
    const app = await createTestApp()

    await app.pressKey('fn')
    expect(app.getRecordingMode()).toBe('stt_only')
    expect(app.isScreenSharingActive()).toBe(false)
    expect(app.isAudioRecordingActive()).toBe(true)

    await app.releaseKey('fn')
    expect(app.getRecordingMode()).toBe('idle')
  })

  it('should start full mode when Fn+Ctrl pressed', async () => {
    const app = await createTestApp()

    await app.pressKey('fn')
    await app.pressKey('ctrl')

    expect(app.getRecordingMode()).toBe('stt_with_screen')
    expect(app.isScreenSharingActive()).toBe(true)
    expect(app.isAudioRecordingActive()).toBe(true)
  })

  it('should maintain existing toggle behavior', async () => {
    const app = await createTestApp()

    await app.pressHotkey('Control+Space')
    expect(app.isRecording()).toBe(true)

    await app.wait(2000) // Wait for silence
    expect(app.isRecording()).toBe(false)
  })
})
```

### 6.3 E2E Tests

```typescript
// tests/e2e/wispr-flow-parity.test.ts

describe('Wispr Flow Feature Parity', () => {
  it('should show overlay when recording starts', async () => {
    await app.pressKey('fn')

    const overlay = await app.getOverlay()
    expect(overlay.isVisible()).toBe(true)
    expect(overlay.getText()).toContain('Listening...')
  })

  it('should use local Whisper for transcription', async () => {
    await app.setSTTProvider('whisper-local')
    await app.pressKey('fn')
    await app.speak('test dictation')
    await app.releaseKey('fn')

    const transcription = await app.getLastTranscription()
    expect(transcription.text).toBe('test dictation')
    expect(transcription.provider).toBe('whisper-local')
  })

  it('should NOT break existing translation feature', async () => {
    await app.highlightText('Hello world')
    await app.pressHotkey('Control+Space')
    await app.speak('translate to French')
    await app.waitForSilence(1500)

    const result = await app.getClipboard()
    expect(result).toBe('Bonjour le monde')
  })
})
```

**Files to Create**:
- `tests/unit/` - Unit test suite
- `tests/integration/` - Integration test suite
- `tests/e2e/` - End-to-end test suite
- `tests/helpers/` - Test utilities and mocks

---

## Implementation Roadmap

### Week 1-2: Foundation
- [ ] Set up native module infrastructure (node-gyp, IOKit bindings)
- [ ] Implement basic Fn key detection
- [ ] Create hotkey state machine
- [ ] Unit tests for state machine
- **Deliverable**: Fn key press/release detection working

### Week 3-4: Press-and-Hold System
- [ ] Implement hold duration tracking
- [ ] Add Fn+Ctrl combination detection
- [ ] Implement double-tap gesture detection
- [ ] Integration tests for all hotkey combinations
- **Deliverable**: All 4 input modes working (press-hold STT, press-hold full, double-tap STT, double-tap full)

### Week 5-6: Overlay UI
- [ ] Create overlay window system
- [ ] Build Vue overlay components
- [ ] Implement waveform visualization
- [ ] Apply Ebben POC design system
- [ ] Test overlay positioning and transparency
- **Deliverable**: Visual overlay showing mode and status

### Week 7-8: Local AI Integration
- [ ] Integrate Whisper for local STT
- [ ] Integrate Llama for local LLM
- [ ] Integrate Mistral for local LLM
- [ ] Build AI provider selection UI
- [ ] Test hybrid AI workflows
- **Deliverable**: Local AI models working alongside Gemini

### Week 9-10: Multi-Mode Recording
- [ ] Implement mode manager
- [ ] Update useVoiceEdit for mode support
- [ ] Test STT-only vs full mode
- [ ] Test toggle vs press-and-hold
- **Deliverable**: All recording modes working correctly

### Week 11-12: Polish & Testing
- [ ] Comprehensive E2E testing
- [ ] Performance optimization
- [ ] Bug fixes
- [ ] Documentation
- **Deliverable**: Production-ready release

---

## Risk Mitigation

### Risk 1: Fn Key Detection Complexity
**Mitigation**: Start with alternative keys (F13-F15) that are easier to detect, then implement Fn key via native module in later phase

### Risk 2: Breaking Existing Functionality
**Mitigation**:
- Feature flags for new features (can disable to fallback to current behavior)
- Comprehensive regression test suite
- Keep current Control+Space hotkey as fallback

### Risk 3: Local AI Performance
**Mitigation**:
- Start with cloud-first, local-optional approach
- Provide clear performance expectations in UI
- Allow users to choose based on their hardware

### Risk 4: Native Module Compilation Issues
**Mitigation**:
- Bundle pre-compiled binaries for common macOS versions
- Provide detailed setup documentation
- Fallback to alternative key detection methods

---

## Success Criteria

### MVP (Minimum Viable Product)
- [ ] Fn key press-and-hold detection working
- [ ] Visual overlay showing recording status
- [ ] Local Whisper STT working (reduces Gemini API calls)
- [ ] All existing features still working
- [ ] 90%+ test coverage

### Full Release
- [ ] All 4 input modes working (Fn, Fn+Ctrl, double-tap variations)
- [ ] Local Llama/Mistral integration
- [ ] Wispr Flow-level UX polish
- [ ] Settings UI for all options
- [ ] Usage statistics dashboard
- [ ] Performance on par with or better than current implementation

---

## Files Structure

```
voice-edit-macos/
├── src/
│   ├── main/
│   │   ├── key-monitor-manager.ts        # NEW
│   │   ├── hotkey-state-machine.ts       # NEW
│   │   ├── gesture-detector.ts           # NEW
│   │   ├── overlay-window.ts             # NEW
│   │   ├── ai-provider-manager.ts        # NEW
│   │   └── local-ai/                     # NEW
│   │       ├── whisper-service.ts
│   │       ├── llama-service.ts
│   │       └── mistral-service.ts
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── AIProviderSettings.vue   # NEW
│   │   │   ├── ShortcutCustomizer.vue   # NEW
│   │   │   └── StatusDashboard.vue      # NEW
│   │   └── composables/
│   │       └── useRecordingMode.ts       # NEW
│   ├── overlay/                           # NEW
│   │   ├── App.vue
│   │   ├── OverlayIndicator.vue
│   │   ├── design-system.ts
│   │   └── composables/
│   │       └── useWaveformVisualizer.ts
│   ├── native/                            # NEW
│   │   ├── KeyMonitor.mm
│   │   ├── binding.gyp
│   │   └── index.ts
│   └── shared/
│       └── types.ts                       # NEW
├── tests/                                 # NEW
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── WISPR_FLOW_DEVELOPMENT_PLAN.md        # THIS FILE
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "node-addon-api": "^7.0.0",
    "@types/node-addon-api": "^1.0.0"
  },
  "devDependencies": {
    "node-gyp": "^10.0.0",
    "@vitest/ui": "^1.0.0",
    "vitest": "^1.0.0",
    "@testing-library/vue": "^8.0.0",
    "playwright": "^1.40.0"
  }
}
```

---

## Notes

1. **Preserve Current Behavior**: All existing hotkeys and features must continue working
2. **Progressive Enhancement**: New features are additive, not replacements
3. **User Choice**: Users can choose between cloud and local AI
4. **Performance**: Local AI reduces API costs but may be slower depending on hardware
5. **Privacy**: Screen recording only during Fn+Ctrl, never in STT-only mode
6. **Accessibility**: Maintain keyboard-first workflow, clear visual feedback

---

## Questions for User

1. Which local models do you already have installed? (Whisper, Llama, Mistral versions)
2. Preferred overlay position? (top, bottom, center, floating near cursor)
3. Should we prioritize Fn key detection or start with F13-F15 as interim solution?
4. Any specific Wispr Flow features from the screenshots that are highest priority?

---

**Last Updated**: 2025-11-09
**Status**: Planning Phase
**Next Steps**: User review and approval before implementation
