# Voice Edit for macOS

Intelligent voice-controlled text editing with multimodal screen awareness, powered by Google Gemini 2.0 Flash.

![Voice Edit Demo](docs/demo.gif)

## Features

- **🎤 Voice-Controlled Editing**: Speak natural language commands to edit text
- **📺 Multimodal Screen Awareness**: AI sees your screen for context-aware editing
- **⌨️ Universal Text Editing**: Works in ANY macOS app (Notes, TextEdit, VS Code, Slack, etc.)
- **🧠 Intelligent Commands**: EDIT, QUERY, INSERT_STYLED, SEARCH operations
- **🔒 Privacy-Focused**: All processing via Gemini API, no data stored

## Supported Commands

### EDIT - Text Transformations
- "make this shorter"
- "rewrite this more professionally"
- "translate this to Spanish"
- "fix grammar"
- "reorder alphabetically"
- "convert to bullet points"

### QUERY - Information Requests
- "what does this mean?"
- "define this word"
- "explain this concept"
- "is this grammatically correct?"

### INSERT_STYLED - Smart Text Generation
- "insert a paragraph about innovation"
- "add a conclusion here"
- "write a transition sentence"

### SEARCH - Find & Highlight
- "find all mentions of AI"
- "search for project deadline"
- "highlight the word methodology"

## How It Works (Like Wispr Flow, But Better)

1. **Press hotkey** (⌘+Shift+Space by default)
2. **Speak your command**: "make this shorter"
3. **Pause 1.5 seconds** (automatic silence detection)
4. **AI processes**:
   - Hears what you said (audio)
   - Sees what's on your screen (video at 1 FPS)
   - Understands selected text context
5. **Result pasted** at cursor position in ANY macOS app

### Why It's Better Than Wispr Flow

| Feature | Wispr Flow | Voice Edit |
|---------|-----------|------------|
| Input | Audio only | **Audio + Visual screen context** |
| AI Model | GPT-based | **Gemini 2.0 multimodal** |
| Understanding | Voice transcript | **Voice + what's on screen** |
| Editing | Basic dictation | **Smart context-aware editing** |
| Style Matching | No | **Yes (INSERT_STYLED)** |
| Price | $100/year | **Free (pay-per-use Gemini API)** |

## Requirements

- **macOS 10.15+** (Catalina or later)
- **Gemini API Key** ([Get free key](https://ai.google.dev/))
- **Microphone access** (for voice recording)
- **Screen recording permission** (for multimodal awareness)
- **Accessibility permission** (for paste simulation)

## Installation

### Option 1: Download Pre-built Binary (Recommended)

1. Download latest `.dmg` from [Releases](https://github.com/your-org/voice-edit-macos/releases)
2. Open `VoiceEdit-1.0.0.dmg`
3. Drag **Voice Edit** to Applications folder
4. Open **Voice Edit** from Applications
5. Grant permissions when prompted:
   - Microphone
   - Screen Recording
   - Accessibility
6. Enter your Gemini API key in Settings

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/your-org/voice-edit-macos.git
cd voice-edit-macos

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build:mac

# Output: release/Voice Edit-1.0.0.dmg
```

## Setup

### 1. Get Gemini API Key

1. Go to [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key"
3. Create new project or use existing
4. Copy API key

### 2. Configure Voice Edit

1. Open Voice Edit
2. Go to Settings
3. Paste Gemini API key
4. Choose hotkey (default: ⌘+Shift+Space)
5. Enable/disable screen sharing
6. (Optional) Enable "Launch at login"

### 3. Grant macOS Permissions

Voice Edit needs these permissions:

#### Microphone
- **Purpose**: Record voice commands
- **How**: System will prompt on first use
- **Or**: System Preferences > Security & Privacy > Privacy > Microphone > Voice Edit ✓

#### Screen Recording
- **Purpose**: Multimodal screen awareness (optional but recommended)
- **How**: System will prompt when screen sharing starts
- **Or**: System Preferences > Security & Privacy > Privacy > Screen Recording > Voice Edit ✓

#### Accessibility
- **Purpose**: Simulate Cmd+V to paste edited text
- **How**: Voice Edit will show prompt with button to open System Preferences
- **Or**: System Preferences > Security & Privacy > Privacy > Accessibility > Voice Edit ✓

## Usage

### Basic Workflow

1. **Select text** in any app (or position cursor)
2. **Press hotkey** (⌘+Shift+Space)
3. **Speak command**: "make this shorter"
4. **Wait 1.5 seconds** (or press hotkey again to stop)
5. **Edited text** pasted at cursor automatically

### Pro Tips

- **For best results**: Select text before speaking (helps AI understand context)
- **Screen sharing**: Leave enabled for smarter edits (AI sees your screen)
- **Silence detection**: Pause 1.5 seconds after speaking to trigger processing
- **Multiple edits**: Chain commands by selecting → speaking → selecting → speaking
- **Query mode**: Ask questions without pasting (TTS speaks answer)

### Example Workflows

**Email Writing**:
```
1. Type rough draft
2. Select paragraph
3. Speak: "make this more professional"
4. Result pasted → polished text
```

**Translation**:
```
1. Select English text
2. Speak: "translate to Spanish"
3. Result pasted → Spanish translation
```

**Research**:
```
1. Select technical term
2. Speak: "what does this mean?"
3. TTS speaks definition (no paste)
```

## Development

### Project Structure

```
voice-edit-macos/
├── src/
│   ├── main/                     # Electron main process
│   │   ├── index.ts             # App lifecycle
│   │   ├── hotkey-manager.ts    # Global hotkeys
│   │   ├── clipboard-manager.ts # Clipboard + paste
│   │   └── permissions.ts       # macOS permissions
│   │
│   ├── renderer/                # Electron renderer (Vue)
│   │   ├── main.ts             # Vue entry point
│   │   ├── App.vue             # Main UI
│   │   ├── lib/                # Audio/video capture
│   │   ├── services/           # Gemini API
│   │   └── composables/        # Voice edit logic
│   │
│   └── preload/                # Preload scripts
│       └── index.ts            # IPC bridge
│
├── resources/                   # App icons
├── build/                       # Build config
├── package.json
└── README.md
```

### Tech Stack

- **Electron**: macOS app framework
- **Vue 3**: UI framework (Composition API)
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Google GenAI SDK**: Gemini Live API
- **AppleScript**: Keyboard simulation (paste)

### Development Commands

```bash
# Run in development mode (hot reload)
npm run dev

# Type checking
npm run typecheck

# Format code
npm run format

# Build for production
npm run build:mac

# Build without packaging (testing)
npm run build:dir

# Clean build
rm -rf dist dist-electron release && npm run build:mac
```

### API Usage

Voice Edit uses Gemini API with these settings:

- **Model**: `gemini-2.0-flash-exp`
- **Input**: Audio (16kHz PCM) + Video (1 FPS JPEG)
- **Output**: Structured JSON (EDIT/QUERY/INSERT_STYLED/SEARCH)
- **Cost**: ~$0.10 per 1000 commands (estimate)

## Troubleshooting

### "Microphone not working"
- Check System Preferences > Security & Privacy > Privacy > Microphone
- Ensure Voice Edit is checked
- Restart Voice Edit

### "Can't paste edited text"
- Check System Preferences > Security & Privacy > Privacy > Accessibility
- Ensure Voice Edit is checked
- Click "+" and add Voice Edit if not listed

### "Screen sharing not starting"
- Check System Preferences > Security & Privacy > Privacy > Screen Recording
- Ensure Voice Edit is checked
- You may need to restart Voice Edit after granting permission

### "Hotkey not working"
- Check if another app uses the same hotkey
- Try different hotkey in Settings
- Restart Voice Edit after changing hotkey

### "API key invalid"
- Verify key is correct (no extra spaces)
- Check [API dashboard](https://ai.google.dev/) for quota/limits
- Ensure billing is enabled if required

### "Commands not processing"
- Speak clearly and pause 1.5 seconds
- Check microphone volume in System Preferences
- Try selecting text before speaking (helps with context)
- Enable screen sharing for better accuracy

## Privacy & Security

- **No data stored**: All voice/screen data sent only to Gemini API
- **API key encrypted**: Stored securely in macOS Keychain via electron-store
- **Open source**: Review all code before building
- **No telemetry**: We don't collect usage data
- **Self-hosted option**: Run your own Gemini API instance

## Pricing

- **Voice Edit**: Free and open source
- **Gemini API**: Pay-per-use pricing
  - Gemini 2.0 Flash: $0.00001875/second audio input
  - Gemini 2.0 Flash: $0.0005/image input
  - Estimate: ~$0.10 per 1000 commands

## Roadmap

### v1.1 (Next Release)
- [ ] Command history panel
- [ ] Custom voice commands (user-defined macros)
- [ ] Offline transcription (Whisper local)
- [ ] Multi-language support

### v2.0 (Future)
- [ ] Support for Claude API (alternative to Gemini)
- [ ] Support for OpenAI GPT-4o
- [ ] Cloud sync for settings
- [ ] Team collaboration features

### v3.0 (Native Swift)
- [ ] Rewrite in Swift/SwiftUI
- [ ] Smaller bundle size (<10MB)
- [ ] Better performance
- [ ] App Store distribution

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes and test
4. Commit: `git commit -m "Add my feature"`
5. Push: `git push origin feature/my-feature`
6. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Google Gemini**: For powerful multimodal AI
- **Electron**: For cross-platform desktop framework
- **Vue.js**: For reactive UI framework
- **Ebben POC**: Original multimodal editing concept

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/voice-edit-macos/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/voice-edit-macos/discussions)
- **Email**: support@voiceedit.app

## Comparison with Similar Apps

| Feature | Voice Edit | Wispr Flow | Talon Voice | macOS Dictation |
|---------|-----------|-----------|-------------|----------------|
| Multimodal | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Smart Editing | ✅ Yes | ⚠️ Limited | ⚠️ Limited | ❌ No |
| Works in All Apps | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Cost | $0.10/1000 cmds | $100/year | $15/month | Free |
| Offline | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| Open Source | ✅ Yes | ❌ No | ❌ No | ❌ No |

---

**Made with ❤️ by the Voice Edit team**

[Star us on GitHub](https://github.com/your-org/voice-edit-macos) ⭐
