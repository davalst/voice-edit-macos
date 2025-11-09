/**
 * Screen capture hook for Gemini Live API
 * Based on Google's official implementation
 */

export interface ScreenCaptureResult {
  start: () => Promise<MediaStream>
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

  const start = async (): Promise<MediaStream> => {
    // Note: preferCurrentTab is Chrome-only, so we wrap it in a try-catch
    let mediaStream: MediaStream

    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 1 }, // 1 FPS to reduce bandwidth
        },
        // @ts-ignore - Chrome-specific options
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
        systemAudio: 'exclude',
      })
    } catch (e) {
      // Fallback for browsers that don't support preferCurrentTab
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 1 },
        },
      })
    }

    // Add ended event listeners to all tracks
    mediaStream.getTracks().forEach(track => {
      track.addEventListener('ended', handleStreamEnded)
    })

    stream = mediaStream
    isStreaming = true

    return mediaStream
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
