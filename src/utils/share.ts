export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded'

export async function shareOrDownload(blob: Blob, filename: string, title = '블러 에디터'): Promise<ShareResult> {
  try {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}

export function canShareFiles(): boolean {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function'
}
