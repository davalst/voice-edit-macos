/**
 * Overlay Window Entry Point
 *
 * Mounts the Overlay Vue component for the floating recording indicator.
 */

import { createApp } from 'vue'
import Overlay from './Overlay.vue'

const app = createApp(Overlay)
app.mount('#app')

console.log('[Overlay] Mounted')
