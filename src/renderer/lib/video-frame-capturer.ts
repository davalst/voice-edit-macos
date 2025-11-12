/**
 * Video frame capturer for extracting JPEG images from video stream
 * Used for sending screen/webcam frames to Gemini Live API
 */

export class VideoFrameCapturer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private video: HTMLVideoElement
  private intervalId: number | null = null

  constructor(
    private onFrame: (base64Jpeg: string) => void,
    private fps: number = 1
  ) {
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')!
    this.video = document.createElement('video')
    this.video.autoplay = true
    this.video.playsInline = true
  }

  async start(stream: MediaStream) {
    this.video.srcObject = stream

    // Wait for video to be ready
    await new Promise<void>(resolve => {
      this.video.onloadedmetadata = () => {
        this.canvas.width = this.video.videoWidth
        this.canvas.height = this.video.videoHeight
        resolve()
      }
    })

    // Only start continuous capture if FPS > 0
    if (this.fps > 0) {
      // Capture frames at specified FPS
      const intervalMs = 1000 / this.fps
      this.intervalId = window.setInterval(() => {
        this.captureFrame()
      }, intervalMs)
    }
  }

  private captureFrame() {
    if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
      return
    }

    // Draw video frame to canvas
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)

    // Convert to JPEG base64
    const base64Data = this.canvas.toDataURL('image/jpeg', 0.8)
    // Remove data:image/jpeg;base64, prefix
    const base64Jpeg = base64Data.split(',')[1]

    this.onFrame(base64Jpeg)
  }

  /**
   * Capture a single frame on demand (for single-shot screen capture)
   */
  captureOnce() {
    this.captureFrame()
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.video.srcObject) {
      this.video.srcObject = null
    }
  }
}
