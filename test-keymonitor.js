/**
 * Test script for KeyMonitor native module
 *
 * Run: node test-keymonitor.js
 * Then press Fn, Ctrl, and Fn+Ctrl keys to test detection
 */

const path = require('path')

console.log('[Test] Loading native key monitor module...')

let keymonitor
try {
  const modulePath = path.join(__dirname, 'build/Release/keymonitor.node')
  keymonitor = require(modulePath)
  console.log('[Test] ✅ Native module loaded successfully')
} catch (error) {
  console.error('[Test] ❌ Failed to load native module:', error.message)
  console.error('[Test] Run: npx node-gyp rebuild')
  process.exit(1)
}

console.log('[Test] Available methods:', Object.keys(keymonitor))
console.log('[Test] Starting key monitoring...')
console.log('[Test] Press Fn, Ctrl, or Fn+Ctrl keys (Ctrl+C to exit)')
console.log('')

let lastEvent = { fnPressed: false, ctrlPressed: false }

const success = keymonitor.startMonitoring((event) => {
  // Only log when state changes
  if (event.fnPressed !== lastEvent.fnPressed || event.ctrlPressed !== lastEvent.ctrlPressed) {
    const status = []
    if (event.fnPressed) status.push('Fn')
    if (event.ctrlPressed) status.push('Ctrl')

    const statusStr = status.length > 0 ? status.join('+') : 'Released'
    const timestamp = new Date(event.timestamp * 1000).toISOString().split('T')[1].split('.')[0]

    console.log(`[${timestamp}] ${statusStr.padEnd(15)} | Fn: ${event.fnPressed ? '✓' : '✗'}  Ctrl: ${event.ctrlPressed ? '✓' : '✗'}`)

    lastEvent = event
  }
})

if (!success) {
  console.error('[Test] ❌ Failed to start monitoring')
  console.error('[Test] Please grant Accessibility permissions:')
  console.error('[Test] System Preferences → Security & Privacy → Privacy → Accessibility')
  process.exit(1)
}

console.log('[Test] ✅ Monitoring active')
console.log('')

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[Test] Stopping monitor...')
  keymonitor.stopMonitoring()
  console.log('[Test] Done')
  process.exit(0)
})

// Keep process running
setInterval(() => {}, 1000)
