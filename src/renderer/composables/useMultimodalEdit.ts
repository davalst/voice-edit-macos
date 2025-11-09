/**
 * Composable for managing multimodal edit mode state
 *
 * This provides a global state to track when the user has clicked the Edit button
 * on an AI message. When active, the mic button in message input will use
 * multimodal recording instead of normal audio-only recording.
 */

import { ref, computed } from 'vue'

// Global state (shared across components)
const isEditModeActive = ref(false)
const editingMessageId = ref<number | null>(null)
const editingMessageContent = ref<string>('')
const voiceMode = ref<'auto' | 'record'>('auto')

export function useMultimodalEdit() {
  /**
   * Activate edit mode for a specific message
   */
  function activateEditMode(messageId: number, content: string, mode: 'auto' | 'record' = 'auto') {
    console.log('[MultimodalEdit] Activating edit mode', { messageId, mode })
    isEditModeActive.value = true
    editingMessageId.value = messageId
    editingMessageContent.value = content
    voiceMode.value = mode
  }

  /**
   * Deactivate edit mode
   */
  function deactivateEditMode() {
    console.log('[MultimodalEdit] Deactivating edit mode')
    isEditModeActive.value = false
    editingMessageId.value = null
    editingMessageContent.value = ''
  }

  /**
   * Check if edit mode is currently active
   */
  const isActive = computed(() => isEditModeActive.value)

  /**
   * Get the current voice mode setting
   */
  const currentVoiceMode = computed(() => voiceMode.value)

  /**
   * Get the message being edited
   */
  const editingMessage = computed(() => ({
    id: editingMessageId.value,
    content: editingMessageContent.value,
  }))

  return {
    isActive,
    currentVoiceMode,
    editingMessage,
    activateEditMode,
    deactivateEditMode,
  }
}
