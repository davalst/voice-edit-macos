/**
 * Shared type definitions for electron-store data structures
 */

export interface DictionaryEntry {
  id: string
  correctWord: string
  incorrectVariants: string[]
}

export interface SnippetEntry {
  id: string
  trigger: string
  expansion: string
}

export interface AppConfig {
  apiKey: string
  hotkey: string
  vadSensitivity: number
  silenceDuration: number
  screenSharingEnabled: boolean
  launchAtLogin: boolean
  showOverlay: boolean
  showInDock: boolean
  dictationSoundEffects: boolean
  separateCommandKey: boolean
  dictionary: DictionaryEntry[]
  snippets: SnippetEntry[]
}
