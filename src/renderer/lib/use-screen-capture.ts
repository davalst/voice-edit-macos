/**
 * Screen capture hook for Gemini Live API
 * Based on Google's official implementation
 */

export interface ScreenCaptureResult {
  start: (targetAppName?: string) => Promise<MediaStream>
  stop: () => void
  setOnStreamEnded: (callback: () => void) => void
  isStreaming: boolean
  stream: MediaStream | null
}

export function useScreenCapture(): ScreenCaptureResult {
  let stream: MediaStream | null = null
  let isStreaming = false
  let streamEndedCallback: (() => void) | null = null

  const handleStreamEnded = () => {
    isStreaming = false
    stream = null
    if (streamEndedCallback) {
      streamEndedCallback()
    }
  }

  const start = async (targetAppName?: string): Promise<MediaStream> => {
    // Electron-specific: Use desktopCapturer API via IPC
    try {
      // @ts-ignore - electronAPI exposed via preload
      const electronAPI = (window as any).electronAPI

      if (!electronAPI || !electronAPI.getScreenSources) {
        console.warn('[ScreenCapture] Electron screen capture API not available')
        throw new Error('Screen capture not supported in this environment')
      }

      // Get available sources (screens and windows) via IPC
      const sources = await electronAPI.getScreenSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1280, height: 720 },
      })

      if (sources.length === 0) {
        throw new Error('No screen sources available')
      }

      // Select source based on target app name
      let selectedSource: any

      if (targetAppName) {
        // Try to find a window matching the target app name
        selectedSource = sources.find((s: any) =>
          s.name.toLowerCase().includes(targetAppName.toLowerCase()) ||
          (s.name.split(' - ')[1] && s.name.split(' - ')[1].toLowerCase().includes(targetAppName.toLowerCase()))
        )

        if (selectedSource) {
          console.log('[ScreenCapture] Using window for app:', targetAppName, '→', selectedSource.name)
        } else {
          console.warn('[ScreenCapture] No window found for app:', targetAppName, '- falling back to screen')
        }
      }

      // Fallback: Use the primary screen if no window found or no target specified
      if (!selectedSource) {
        selectedSource = sources.find((s: any) => s.id.startsWith('screen')) || sources[0]
        console.log('[ScreenCapture] Using primary screen:', selectedSource.name)
      }

      // Get media stream from the source using Electron-specific constraints
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore - Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            minWidth: 1280,
            maxWidth: 1280,
            minHeight: 720,
            maxHeight: 720,
            minFrameRate: 1,
            maxFrameRate: 1,
          },
        },
      })

      // Add ended event listeners to all tracks
      mediaStream.getTracks().forEach(track => {
        track.addEventListener('ended', handleStreamEnded)
      })

      stream = mediaStream
      isStreaming = true

      console.log('[ScreenCapture] ✅ Screen capture started successfully')
      return mediaStream
    } catch (error: any) {
      console.error('[ScreenCapture] Failed to start screen capture:', error.message)
      throw error
    }
  }

  const stop = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.removeEventListener('ended', handleStreamEnded)
        track.stop()
      })
      stream = null
      isStreaming = false
    }
  }

  const setOnStreamEnded = (callback: () => void) => {
    streamEndedCallback = callback
  }

  return {
    start,
    stop,
    isStreaming,
    stream,
    setOnStreamEnded,
  }
}
