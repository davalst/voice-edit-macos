<template>
  <div class="shortcut-customizer">
    <h3 class="section-title">Keyboard Shortcuts</h3>
    <p class="section-description">
      Voice Edit supports multiple input modes for different workflows
    </p>

    <!-- Fn Key Gestures -->
    <div class="gesture-section">
      <h4 class="gesture-title">🎙️ Fn Key Gestures (Recommended)</h4>
      <div class="gesture-grid">
        <div class="gesture-card">
          <div class="gesture-key">
            <kbd>Fn</kbd>
            <span class="gesture-action">Hold</span>
          </div>
          <div class="gesture-description">
            <div class="gesture-name">Voice Dictation</div>
            <div class="gesture-detail">Speech-to-text only, no screen context</div>
          </div>
        </div>

        <div class="gesture-card">
          <div class="gesture-key">
            <kbd>Fn</kbd>
            <span class="gesture-plus">+</span>
            <kbd>Ctrl</kbd>
            <span class="gesture-action">Hold</span>
          </div>
          <div class="gesture-description">
            <div class="gesture-name">Multimodal Edit</div>
            <div class="gesture-detail">Voice + screen context for intelligent edits</div>
          </div>
        </div>

        <div class="gesture-card">
          <div class="gesture-key">
            <kbd>Fn</kbd>
            <span class="gesture-action">Double-tap</span>
          </div>
          <div class="gesture-description">
            <div class="gesture-name">Toggle Dictation</div>
            <div class="gesture-detail">Stay in dictation mode until double-tap again</div>
          </div>
        </div>

        <div class="gesture-card">
          <div class="gesture-key">
            <kbd>Fn</kbd>
            <span class="gesture-plus">+</span>
            <kbd>Ctrl</kbd>
            <span class="gesture-action">Double-tap</span>
          </div>
          <div class="gesture-description">
            <div class="gesture-name">Toggle Multimodal</div>
            <div class="gesture-detail">Stay in multimodal mode until double-tap again</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legacy Hotkey -->
    <div class="gesture-section">
      <h4 class="gesture-title">⌨️ Legacy Hotkey</h4>
      <div class="legacy-hotkey">
        <select v-model="selectedHotkey" @change="$emit('hotkey-change', selectedHotkey)" class="hotkey-select">
          <option value="Control+Space">Control+Space</option>
          <option value="Command+Space">⌘+Space</option>
          <option value="CommandOrControl+Shift+Space">⌘+Shift+Space</option>
          <option value="CommandOrControl+Shift+V">⌘+Shift+V</option>
          <option value="Control+Alt+Space">Ctrl+Alt+Space</option>
          <option value="F13">F13</option>
          <option value="F14">F14</option>
          <option value="F15">F15</option>
        </select>
        <div class="hotkey-description">
          Toggle multimodal mode (backward compatible)
        </div>
      </div>
    </div>

    <!-- Tips -->
    <div class="tips-section">
      <div class="tip">
        <span class="tip-icon">💡</span>
        <span class="tip-text">
          Use <strong>Fn hold</strong> for quick dictation without screen sharing
        </span>
      </div>
      <div class="tip">
        <span class="tip-icon">💡</span>
        <span class="tip-text">
          Use <strong>Fn+Ctrl hold</strong> when you need AI to see your screen for context
        </span>
      </div>
      <div class="tip">
        <span class="tip-icon">💡</span>
        <span class="tip-text">
          <strong>Double-tap</strong> gestures keep recording active for hands-free operation
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  hotkey: string
}>()

const emit = defineEmits<{
  'hotkey-change': [hotkey: string]
}>()

const selectedHotkey = ref(props.hotkey)

// Update when prop changes
watch(() => props.hotkey, (newValue) => {
  selectedHotkey.value = newValue
})
</script>

<style scoped>
.shortcut-customizer {
  padding: 20px 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1a1a1a;
}

.section-description {
  font-size: 13px;
  color: #666;
  margin-bottom: 20px;
}

.gesture-section {
  margin-bottom: 30px;
}

.gesture-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #333;
}

.gesture-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.gesture-card {
  background: #f8f9fa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.gesture-card:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.gesture-key {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

kbd {
  display: inline-block;
  padding: 4px 10px;
  background: linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%);
  border: 1px solid #ccc;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.1);
  min-width: 40px;
  text-align: center;
}

.gesture-plus {
  font-size: 12px;
  color: #999;
  font-weight: 600;
}

.gesture-action {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.gesture-description {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gesture-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.gesture-detail {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

.legacy-hotkey {
  background: #f8f9fa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.hotkey-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  margin-bottom: 8px;
}

.hotkey-select:hover {
  border-color: #9ca3af;
}

.hotkey-select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.hotkey-description {
  font-size: 12px;
  color: #666;
  padding-left: 4px;
}

.tips-section {
  background: #e7f3ff;
  border: 1px solid #b3d9ff;
  border-radius: 8px;
  padding: 16px;
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.tip:last-child {
  margin-bottom: 0;
}

.tip-icon {
  font-size: 16px;
  line-height: 1.5;
}

.tip-text {
  font-size: 13px;
  color: #1a1a1a;
  line-height: 1.5;
  flex: 1;
}

.tip-text strong {
  font-weight: 600;
  color: #0066cc;
}
</style>
