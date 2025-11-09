# File Manifest

## Extracted Files from Ebben POC

### Core Libraries (src/renderer/lib/)
```
lib/
├── audio-recorder.ts              (105 lines) - Audio capture + VAD
├── use-screen-capture.ts          ( 87 lines) - Screen sharing
├── video-frame-capturer.ts        ( 68 lines) - Video → JPEG
├── voice-activity-detection.ts    (XXX lines) - Silence detection
├── audioworklet-registry.ts       (XXX lines) - Worklet management
└── worklets/
    └── audio-processing.ts        (XXX lines) - Audio processing
```

### Services (src/renderer/services/)
```
services/
├── geminiLiveSDKAdapter.ts        (286 lines) - Gemini Live API
└── ttsChunking.ts                 (XXX lines) - TTS chunking [OPTIONAL]
```

### Composables (src/renderer/composables/)
```
composables/
└── useMultimodalEdit.ts           ( 65 lines) - State management
```

### Components (src/renderer/components/)
```
components/
└── MultimodalEditMode.vue.template (1481 lines) - NEEDS CLEANUP
```

## New Files to Create

### Main Process (src/main/)
```
main/
├── index.ts                       - Electron main entry
├── hotkey-manager.ts              - Global Fn key registration
├── clipboard-manager.ts           - Clipboard + paste simulation
└── permissions.ts                 - macOS permissions
```

### Renderer Process (src/renderer/)
```
renderer/
├── main.ts                        - Vue app entry
├── App.vue                        - Root component
└── components/
    ├── RecordingIndicator.vue     - Visual recording status
    ├── SettingsPanel.vue          - Settings UI
    └── StatusDisplay.vue          - Status window
```

### Configuration
```
├── package.json                   - Dependencies
├── electron.vite.config.ts        - Vite config
├── tsconfig.json                  - TypeScript config
└── electron-builder.yml           - Build config
```
