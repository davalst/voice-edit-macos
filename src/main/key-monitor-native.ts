/**
 * TypeScript wrapper for native key monitor module
 */

import { EventEmitter } from 'events'
import path from 'path'

interface KeyStates {
  fnPressed: boolean
  ctrlPressed: boolean
}

interface KeyEvent extends KeyStates {
  timestamp: number
}

let nativeModule: any = null

try {
  // Load the native module
  const modulePath = path.join(__dirname, '../../build/Release/keymonitor.node')
  nativeModule = require(modulePath)
  console.log('[KeyMonitor] ✅ Native module loaded successfully')
} catch (error: any) {
  console.error('[KeyMonitor] ❌ Failed to load native module:', error.message)
  console.error('[KeyMonitor] Please run: npx node-gyp rebuild')
}

/**
 * KeyMonitor class - wraps native module with EventEmitter
 */
export class KeyMonitor extends EventEmitter {
  private isMonitoring: boolean = false

  /**
   * Start monitoring Fn and Ctrl keys
   */
  start(): boolean {
    if (!nativeModule) {
      console.error('[KeyMonitor] Native module not loaded')
      return false
    }

    if (this.isMonitoring) {
      console.warn('[KeyMonitor] Already monitoring')
      return true
    }

    try {
      const success = nativeModule.startMonitoring((event: KeyEvent) => {
        // Emit key state change events
        this.emit('keyStateChange', event)

        // Emit specific events for convenience
        if (event.fnPressed && event.ctrlPressed) {
          this.emit('fnCtrlPressed', event)
        } else if (event.fnPressed) {
          this.emit('fnPressed', event)
        } else if (event.ctrlPressed) {
          this.emit('ctrlPressed', event)
        } else {
          this.emit('allKeysReleased', event)
        }
      })

      if (success) {
        this.isMonitoring = true
        console.log('[KeyMonitor] ✅ Started monitoring Fn/Ctrl keys')
      } else {
        console.error('[KeyMonitor] Failed to start monitoring')
      }

      return success
    } catch (error: any) {
      console.error('[KeyMonitor] Error starting monitor:', error.message)
      return false
    }
  }

  /**
   * Stop monitoring keys
   */
  stop(): boolean {
    if (!nativeModule) {
      return false
    }

    if (!this.isMonitoring) {
      return true
    }

    try {
      nativeModule.stopMonitoring()
      this.isMonitoring = false
      console.log('[KeyMonitor] Stopped monitoring')
      return true
    } catch (error: any) {
      console.error('[KeyMonitor] Error stopping monitor:', error.message)
      return false
    }
  }

  /**
   * Get current key states
   */
  getKeyStates(): KeyStates | null {
    if (!nativeModule) {
      return null
    }

    try {
      return nativeModule.getKeyStates()
    } catch (error: any) {
      console.error('[KeyMonitor] Error getting key states:', error.message)
      return null
    }
  }

  /**
   * Check if currently monitoring
   */
  get monitoring(): boolean {
    return this.isMonitoring
  }
}

export default KeyMonitor
