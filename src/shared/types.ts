/**
 * Shared types between main and renderer processes
 */

/**
 * Recording modes for voice editing
 */
export enum RecordingMode {
  IDLE = 'idle',                           // No recording
  STT_ONLY_HOLD = 'stt_only_hold',        // Fn held - STT without screen
  STT_SCREEN_HOLD = 'stt_screen_hold',    // Fn+Ctrl held - STT with screen
  STT_ONLY_TOGGLE = 'stt_only_toggle',    // Double-tap Fn - STT stays on
  STT_SCREEN_TOGGLE = 'stt_screen_toggle' // Double-tap Fn+Ctrl - STT+Screen stays on
}

/**
 * Recording start event data
 */
export interface RecordingStartEvent {
  mode: RecordingMode
  enableScreenCapture: boolean
  isToggleMode: boolean
  routeToCommand: boolean    // true = Fn+Command (commands), false = Fn+Ctrl (dictation)
  selectedText: string
  focusedAppName: string
}

/**
 * Recording configuration
 */
export interface RecordingConfig {
  mode: RecordingMode
  enableScreenCapture: boolean
  selectedText?: string
  focusedAppName?: string
}

export default { RecordingMode }
