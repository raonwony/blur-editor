import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// Tracks a media element's (canvas/video) displayed box *relative to its
// stage container* — not just its own size. A canvas that's centered via
// flexbox with auto width/height can be letterboxed inside a differently
// shaped stage, so overlays must be anchored to the media's own box, not
// the stage's, or they drift out of sync with what's actually drawn.
//
// `version` is for boxes that change without a resize (e.g. a CSS zoom
// transform): pass any value that changes whenever the box does.
export function useOverlayRect(stageRef: RefObject<HTMLElement | null>, mediaRef: RefObject<HTMLElement | null>, version?: unknown): Rect {
  const [rect, setRect] = useState<Rect>({ left: 0, top: 0, width: 0, height: 0 })

  const update = useCallback(() => {
    const stage = stageRef.current
    const media = mediaRef.current
    if (!stage || !media) return
    const stageBox = stage.getBoundingClientRect()
    const mediaBox = media.getBoundingClientRect()
    const next = {
      left: mediaBox.left - stageBox.left,
      top: mediaBox.top - stageBox.top,
      width: mediaBox.width,
      height: mediaBox.height,
    }
    setRect((prev) =>
      prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next,
    )
  }, [stageRef, mediaRef])

  useEffect(() => {
    update()
    const ro = new ResizeObserver(update)
    if (stageRef.current) ro.observe(stageRef.current)
    if (mediaRef.current) ro.observe(mediaRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [update, stageRef, mediaRef])

  // Layout effect so overlays move in the same frame as the media they follow.
  useLayoutEffect(() => {
    update()
  }, [update, version])

  return rect
}
