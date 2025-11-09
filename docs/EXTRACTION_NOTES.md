# Extraction Notes

## Source Repository
- **Repo**: ebben-poc
- **Path**: `web/src/`
- **Branches**: drag-drop-analyze, extended-multimodal, multimodal-edits

## Extraction Date
Generated: $(date '+%Y-%m-%d %H:%M:%S')

## Files Extracted (Clean - No Modifications Needed)

### Audio/Video Capture Libraries
- ✅ `lib/audio-recorder.ts` - 16kHz PCM audio capture with VAD
- ✅ `lib/use-screen-capture.ts` - Screen sharing via getDisplayMedia()
- ✅ `lib/video-frame-capturer.ts` - Video → JPEG base64 conversion
- ✅ `lib/voice-activity-detection.ts` - 1.5s silence detection
- ✅ `lib/audioworklet-registry.ts` - Audio worklet management
- ✅ `lib/worklets/audio-processing.ts` - Audio processing worklet

### Gemini API Integration
- ✅ `services/geminiLiveSDKAdapter.ts` - Clean Gemini Live API wrapper

### Composables
- ✅ `composables/useMultimodalEdit.ts` - State management (minimal cleanup needed)

## Files Requiring Cleanup

### MultimodalEditMode.vue → VoiceEditEngine.ts
**File**: `components/MultimodalEditMode.vue.template`

**Remove These Functions**:
- `executeToolCall()` (lines 295-432) - Ebben-specific tool execution
- All tool call handlers: create_action, create_obstacle, create_workstream, etc.
- `BATCH_EXTRACT` command handling (lines 792-895)
- `OPEN_BROWSER` command handling (lines 938-946)
- `CONFIRM_SAVE` / `CONFIRM_CANCEL` handlers (lines 926-937)

**Keep These Functions**:
- `connectToGemini()` - Core Gemini connection
- `startVoiceEdit()` / `stopVoiceEdit()` - Audio capture
- `startScreenShare()` / `stopScreenShare()` - Screen capture
- `highlightSearchResults()` - Search functionality
- `speakWithTTS()` - Text-to-speech feedback
- `setupSelectionListener()` - Text selection tracking

**Simplify Response Schema**:
Remove these action types:
- `create_action`, `create_obstacle`, `create_workstream`, `create_goal`
- `add_team_member`, `create_team_member`
- `batch_extract`, `open_browser`, `confirm_save`, `confirm_cancel`

Keep these action types:
- `edit` - Text editing commands
- `query` - Information queries
- `insert_styled` - Style-matched insertions
- `search` - Find/highlight text

## Dependencies Removed
- ❌ Firebase (no authentication needed)
- ❌ apiClient (no backend API)
- ❌ Ebben-specific stores (workstreamStore, etc.)
- ❌ Backend TTS service (use browser TTS or ElevenLabs API)

## Dependencies to Add
- ✅ Electron IPC for main/renderer communication
- ✅ electron-store for settings persistence
- ✅ robotjs for keyboard simulation (Cmd+V paste)
- ✅ Browser SpeechSynthesis API (or ElevenLabs for better TTS)

## Next Steps
1. Review `MultimodalEditMode.vue.template` and remove Ebben-specific code
2. Convert Vue component to TypeScript composable/service
3. Create Electron main process integration
4. Test with Fn key activation
5. Package as macOS .dmg installer
