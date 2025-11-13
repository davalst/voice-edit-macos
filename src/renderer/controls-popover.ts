/**
 * Controls Popover - Entry Point
 *
 * Google Meet-style tray popover for Voice Edit controls
 */

import { createApp } from 'vue'
import ControlsPopoverApp from './ControlsPopoverApp.vue'
import './controls-popover.css'

const app = createApp(ControlsPopoverApp)
app.mount('#app')
