/**
 * Gesture Detector
 *
 * Detects double-tap gestures on Fn and Fn+Ctrl combinations.
 * A double-tap is two quick presses within a time window.
 */

import { EventEmitter } from 'events'

interface TapEvent {
  fnPressed: boolean
  ctrlPressed: boolean
  timestamp: number
}

/**
 * Gesture detector for double-tap recognition
 */
export class GestureDetector extends EventEmitter {
  private lastTap: TapEvent | null = null
  private readonly DOUBLE_TAP_WINDOW = 400 // ms - max time between taps for double-tap
  private readonly MIN_TAP_DURATION = 50   // ms - minimum key press to count as tap
  private readonly MAX_TAP_DURATION = 200  // ms - maximum key press to count as tap (not hold)

  // Track ongoing key presses
  private fnPressStart: number = 0
  private ctrlPressStart: number = 0

  constructor() {
    super()
  }

  /**
   * Handle key press
   */
  onKeyPress(fnPressed: boolean, ctrlPressed: boolean, timestamp: number) {
    if (fnPressed && this.fnPressStart === 0) {
      this.fnPressStart = timestamp
    }

    if (ctrlPressed && this.ctrlPressStart === 0) {
      this.ctrlPressStart = timestamp
    }
  }

  /**
   * Handle key release - this is where we detect taps
   */
  onKeyRelease(fnPressed: boolean, ctrlPressed: boolean, timestamp: number) {
    // Check if Fn key was just released
    if (!fnPressed && this.fnPressStart > 0) {
      const fnDuration = timestamp - this.fnPressStart

      // Check if it was a tap (not too short, not too long)
      if (fnDuration >= this.MIN_TAP_DURATION && fnDuration <= this.MAX_TAP_DURATION) {
        this.processTap(fnPressed, ctrlPressed, timestamp)
      }

      this.fnPressStart = 0
    }

    // Check if Ctrl key was just released
    if (!ctrlPressed && this.ctrlPressStart > 0) {
      this.ctrlPressStart = 0
    }
  }

  /**
   * Process a detected tap
   */
  private processTap(fnPressed: boolean, ctrlPressed: boolean, timestamp: number) {
    const currentTap: TapEvent = {
      fnPressed,
      ctrlPressed,
      timestamp
    }

    // Check for double-tap
    if (this.lastTap) {
      const timeSinceLastTap = timestamp - this.lastTap.timestamp

      if (timeSinceLastTap <= this.DOUBLE_TAP_WINDOW) {
        // Double-tap detected!
        // Check if it's Fn double-tap or Fn+Ctrl double-tap
        const isFnCtrl = this.lastTap.ctrlPressed || currentTap.ctrlPressed

        if (isFnCtrl) {
          console.log('[GestureDetector] Fn+Ctrl double-tap detected')
          this.emit('fnCtrlDoubleTap', timestamp)
        } else {
          console.log('[GestureDetector] Fn double-tap detected')
          this.emit('fnDoubleTap', timestamp)
        }

        // Reset after double-tap
        this.lastTap = null
        return
      }
    }

    // First tap or too long since last tap
    this.lastTap = currentTap
  }

  /**
   * Reset gesture detector state
   */
  reset() {
    this.lastTap = null
    this.fnPressStart = 0
    this.ctrlPressStart = 0
  }
}

export default GestureDetector
