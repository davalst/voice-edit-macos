/**
 * Utility for creating AudioWorklet from source code strings
 * Based on Google's official implementation
 */

export function createWorketFromSrc(name: string, src: string): string {
  const blob = new Blob([src], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  return url
}
