import { useEffect, useState, type RefObject } from 'react'

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
export function useOverlayRect(stageRef: RefObject<HTMLElement | null>, mediaRef: RefObject<HTMLElement | null>): Rect {
  const [rect, setRect] = useState<Rect>({ left: 0, top: 0, width: 0, height: 0 })

  useEffect(() => {
    function update() {
      const stage = stageRef.current
      const media = mediaRef.current
      if (!stage || !media) return
      const stageBox = stage.getBoundingClientRect()
      const mediaBox = media.getBoundingClientRect()
      setRect({
        left: mediaBox.left - stageBox.left,
        top: mediaBox.top - stageBox.top,
        width: mediaBox.width,
        height: mediaBox.height,
      })
    }
    update()
    const ro = new ResizeObserver(update)
    if (stageRef.current) ro.observe(stageRef.current)
    if (mediaRef.current) ro.observe(mediaRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return rect
}
