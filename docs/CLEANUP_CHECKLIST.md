# Cleanup Checklist

## Priority 1: Remove Ebben-Specific Code

### MultimodalEditMode.vue.template
- [ ] Remove `executeToolCall()` function
- [ ] Remove all `create_action` / `create_obstacle` / `create_workstream` logic
- [ ] Remove `BATCH_EXTRACT` command handling
- [ ] Remove `OPEN_BROWSER` command handling
- [ ] Remove `CONFIRM_SAVE` / `CONFIRM_CANCEL` handlers
- [ ] Simplify response schema (remove Ebben action types)
- [ ] Remove props: `workstreamId`, `organizationId`, `userId`
- [ ] Remove emits: `show-confirmation-dialog`, `confirm-save`, `confirm-cancel`, `show-ingest`

### System Instruction Cleanup
- [ ] Remove Ebben tool call examples from system instruction
- [ ] Keep only: EDIT, QUERY, INSERT_STYLED, SEARCH commands
- [ ] Update examples to be generic (not Ebben-specific)
- [ ] Remove references to "actions", "obstacles", "goals", "workstreams"

### TTS Service
- [ ] Replace apiClient TTS with browser SpeechSynthesis API
- [ ] OR: Integrate ElevenLabs API for premium TTS
- [ ] Remove dependency on backend `/api/tts` endpoint

## Priority 2: Convert to Electron-Compatible Code

### File Conversions
- [ ] Convert `MultimodalEditMode.vue` → `VoiceEditEngine.ts` (TypeScript service)
- [ ] Create `useVoiceEdit.ts` composable for state management
- [ ] Create Electron IPC events for main/renderer communication

### Electron Integration
- [ ] Create `src/main/index.ts` - Main process entry
- [ ] Create `src/main/hotkey-manager.ts` - Global Fn key registration
- [ ] Create `src/main/clipboard-manager.ts` - Clipboard + paste simulation
- [ ] Create `src/main/permissions.ts` - macOS permissions requests

### UI Components
- [ ] Create minimal status window (menubar or floating)
- [ ] Create settings panel (API key, hotkey config, VAD sensitivity)
- [ ] Create recording indicator (visual feedback)

## Priority 3: Testing

### Unit Tests
- [ ] Test audio capture starts/stops correctly
- [ ] Test screen capture works on macOS
- [ ] Test Gemini API connection
- [ ] Test VAD silence detection (1.5s threshold)
- [ ] Test clipboard copy/paste simulation

### Integration Tests
- [ ] Test Fn key triggers recording
- [ ] Test recording → Gemini → edited text flow
- [ ] Test paste works in external apps (Notes, TextEdit, VS Code)
- [ ] Test screen sharing captures correct window
- [ ] Test TTS doesn't interfere with microphone

### macOS-Specific Tests
- [ ] Test permissions prompts (microphone, screen recording)
- [ ] Test works with System Integrity Protection (SIP) enabled
- [ ] Test menubar icon shows correct status
- [ ] Test launches at login (optional feature)

## Priority 4: Polish

- [ ] Add app icon (resources/icon.icns)
- [ ] Add launcher splash screen (optional)
- [ ] Add keyboard shortcuts help panel
- [ ] Add onboarding tutorial on first launch
- [ ] Add error handling for API failures
- [ ] Add offline detection

## Optional Enhancements

- [ ] Add support for multiple Gemini API keys (switching)
- [ ] Add command history (recent edits)
- [ ] Add custom voice commands (user-defined macros)
- [ ] Add support for other LLMs (OpenAI, Claude)
- [ ] Add analytics/telemetry (privacy-respecting)
