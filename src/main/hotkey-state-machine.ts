/**
 * Hotkey State Machine
 *
 * Manages recording states based on Fn/Ctrl key combinations:
 * - Fn held = STT only (no screen capture)
 * - Fn+Ctrl held = STT + screen capture
 * - Double-tap Fn = Toggle STT only
 * - Double-tap Fn+Ctrl = Toggle STT + screen
 * - Control+Space = Legacy toggle (preserved for backward compatibility)
 */

import { EventEmitter } from 'events'
import { RecordingMode } from '../shared/types'

export { RecordingMode }

interface StateChangeEvent {
  from: RecordingMode
  to: RecordingMode
  timestamp: number
  trigger: 'fn_press' | 'fn_release' | 'ctrl_press' | 'ctrl_release' | 'fn_double_tap' | 'fn_ctrl_double_tap' | 'manual_stop'
}

/**
 * State machine for managing recording modes
 */
export class HotkeyStateMachine extends EventEmitter {
  private currentState: RecordingMode = RecordingMode.IDLE
  private fnPressed: boolean = false
  private ctrlPressed: boolean = false

  // Track key press timing for hold detection
  private fnPressStartTime: number = 0
  private ctrlPressStartTime: number = 0
  private readonly MIN_HOLD_DURATION = 150 // ms - minimum hold to trigger recording

  constructor() {
    super()
  }

  /**
   * Handle Fn key press
   */
  onFnPress(timestamp: number) {
    this.fnPressed = true
    this.fnPressStartTime = timestamp

    // If Ctrl also pressed, this is Fn+Ctrl combination
    if (this.ctrlPressed) {
      this.transitionTo(RecordingMode.STT_SCREEN_HOLD, 'fn_press', timestamp)
    } else {
      // Just Fn - STT only mode
      this.transitionTo(RecordingMode.STT_ONLY_HOLD, 'fn_press', timestamp)
    }
  }

  /**
   * Handle Fn key release
   */
  onFnRelease(timestamp: number) {
    const holdDuration = timestamp - this.fnPressStartTime
    this.fnPressed = false

    console.log(`[StateMachine] Fn released after ${holdDuration.toFixed(0)}ms, current state: ${this.currentState}`)

    // Only stop if we're in a hold mode (not toggle mode)
    if (this.currentState === RecordingMode.STT_ONLY_HOLD) {
      // Always stop when key is released in hold mode
      this.transitionTo(RecordingMode.IDLE, 'fn_release', timestamp)
    } else if (this.currentState === RecordingMode.STT_SCREEN_HOLD) {
      // If Ctrl still pressed, downgrade to STT only
      if (this.ctrlPressed) {
        this.transitionTo(RecordingMode.STT_ONLY_HOLD, 'fn_release', timestamp)
      } else {
        // Both keys released, stop recording
        this.transitionTo(RecordingMode.IDLE, 'fn_release', timestamp)
      }
    }
  }

  /**
   * Handle Ctrl key press
   */
  onCtrlPress(timestamp: number) {
    this.ctrlPressed = true
    this.ctrlPressStartTime = timestamp

    // If Fn already pressed, upgrade to STT+Screen mode
    if (this.fnPressed) {
      this.transitionTo(RecordingMode.STT_SCREEN_HOLD, 'ctrl_press', timestamp)
    }
  }

  /**
   * Handle Ctrl key release
   */
  onCtrlRelease(timestamp: number) {
    const holdDuration = timestamp - this.ctrlPressStartTime
    this.ctrlPressed = false

    console.log(`[StateMachine] Ctrl released after ${holdDuration.toFixed(0)}ms, current state: ${this.currentState}`)

    // If in STT+Screen hold mode and Fn still pressed, downgrade to STT only
    if (this.currentState === RecordingMode.STT_SCREEN_HOLD && this.fnPressed) {
      this.transitionTo(RecordingMode.STT_ONLY_HOLD, 'ctrl_release', timestamp)
    } else if (this.currentState === RecordingMode.STT_SCREEN_HOLD && !this.fnPressed) {
      // Both keys released, always stop
      this.transitionTo(RecordingMode.IDLE, 'ctrl_release', timestamp)
    }
  }

  /**
   * Handle Fn double-tap gesture
   */
  onFnDoubleTap(timestamp: number) {
    if (this.currentState === RecordingMode.IDLE) {
      // Start toggle STT only mode
      this.transitionTo(RecordingMode.STT_ONLY_TOGGLE, 'fn_double_tap', timestamp)
    } else if (this.currentState === RecordingMode.STT_ONLY_TOGGLE) {
      // Stop toggle mode
      this.transitionTo(RecordingMode.IDLE, 'fn_double_tap', timestamp)
    }
  }

  /**
   * Handle Fn+Ctrl double-tap gesture
   */
  onFnCtrlDoubleTap(timestamp: number) {
    if (this.currentState === RecordingMode.IDLE) {
      // Start toggle STT + screen mode
      this.transitionTo(RecordingMode.STT_SCREEN_TOGGLE, 'fn_ctrl_double_tap', timestamp)
    } else if (this.currentState === RecordingMode.STT_SCREEN_TOGGLE) {
      // Stop toggle mode
      this.transitionTo(RecordingMode.IDLE, 'fn_ctrl_double_tap', timestamp)
    }
  }

  /**
   * Manually stop recording (for Control+Space or other triggers)
   */
  stop() {
    if (this.currentState !== RecordingMode.IDLE) {
      this.transitionTo(RecordingMode.IDLE, 'manual_stop', Date.now())
    }
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: RecordingMode, trigger: StateChangeEvent['trigger'], timestamp: number) {
    if (newState === this.currentState) {
      return // No change
    }

    const event: StateChangeEvent = {
      from: this.currentState,
      to: newState,
      timestamp,
      trigger
    }

    this.currentState = newState

    console.log(`[StateMachine] ${event.from} → ${event.to} (${trigger})`)

    // Emit state change event
    this.emit('stateChange', event)

    // Emit specific events for convenience
    if (newState !== RecordingMode.IDLE) {
      this.emit('recordingStarted', {
        mode: newState,
        enableScreenCapture: newState === RecordingMode.STT_SCREEN_HOLD || newState === RecordingMode.STT_SCREEN_TOGGLE,
        isToggleMode: newState === RecordingMode.STT_ONLY_TOGGLE || newState === RecordingMode.STT_SCREEN_TOGGLE
      })
    } else {
      this.emit('recordingStopped', event)
    }
  }

  /**
   * Get current state
   */
  get state(): RecordingMode {
    return this.currentState
  }

  /**
   * Check if currently recording
   */
  get isRecording(): boolean {
    return this.currentState !== RecordingMode.IDLE
  }

  /**
   * Check if screen capture should be enabled
   */
  get shouldCaptureScreen(): boolean {
    return this.currentState === RecordingMode.STT_SCREEN_HOLD ||
           this.currentState === RecordingMode.STT_SCREEN_TOGGLE
  }

  /**
   * Check if in toggle mode (stays on until double-tap again)
   */
  get isToggleMode(): boolean {
    return this.currentState === RecordingMode.STT_ONLY_TOGGLE ||
           this.currentState === RecordingMode.STT_SCREEN_TOGGLE
  }

  /**
   * Reset state machine to IDLE
   */
  reset() {
    this.fnPressed = false
    this.ctrlPressed = false
    this.fnPressStartTime = 0
    this.ctrlPressStartTime = 0

    if (this.currentState !== RecordingMode.IDLE) {
      this.transitionTo(RecordingMode.IDLE, 'manual_stop', Date.now())
    }
  }
}

export default HotkeyStateMachine
