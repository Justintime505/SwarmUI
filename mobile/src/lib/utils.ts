import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merges class names, letting later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Copies text to the clipboard. Resolves to whether it worked.
 * The modern clipboard API only exists on HTTPS pages, and this app is usually opened over plain HTTP on the home network,
 * so it falls back to the older select-and-copy method.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  }
  catch {
    // Fall through to the older method.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  // An open sheet keeps keyboard focus inside itself, so the helper field has to live inside the sheet to be selectable.
  const host = document.activeElement?.closest('[role="dialog"]') || document.body
  host.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  }
  catch {
    ok = false
  }
  area.remove()
  return ok
}

/** Reads a Blob or File into a `data:` URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Loads an image file and scales it down so its longest side is at most `maxSide`.
 * Phone photos are often 12MP or more, far larger than a starting image needs to be.
 */
export async function fileToScaledDataUrl(file: Blob, maxSide = 2048): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width, height }
}
