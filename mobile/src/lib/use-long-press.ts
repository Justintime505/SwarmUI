import { useRef } from 'react'

/** How long a mouse button must stay down, in milliseconds, to count as a long press. */
const LONG_PRESS_MS = 450
/**
 * The same for a finger. Deliberately longer than Android's own long-press delay (about 500ms): Android reports its long press as a
 * contextmenu event, which is handled below. Opening the menu before that would put new text under the finger just as the phone's
 * gesture fires, and the phone would select it. This timer is the fallback for browsers that send no contextmenu event (iOS Safari).
 */
const TOUCH_LONG_PRESS_MS = 650
/** How far the finger may drift, in pixels, before the press is treated as a scroll or swipe instead. */
const MOVE_TOLERANCE = 12

/**
 * Props that add a long-press gesture to a button. A normal tap still fires the button's own onClick;
 * the click that follows a long press is swallowed so it does not also trigger the tap action.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fired = useRef(false)
  const origin = useRef({ x: 0, y: 0 })

  /** Stops waiting for a long press. */
  const clear = () => clearTimeout(timer.current)

  /** Runs the long-press action once per press. */
  const fire = () => {
    if (!fired.current) {
      fired.current = true
      navigator.vibrate?.(15)
      onLongPress()
    }
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      origin.current = { x: e.clientX, y: e.clientY }
      clear()
      timer.current = setTimeout(fire, e.pointerType == 'mouse' ? LONG_PRESS_MS : TOUCH_LONG_PRESS_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > MOVE_TOLERANCE) {
        clear()
      }
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Android fires contextmenu on a long press, and desktop on right-click: treat both as the long press.
    // Cancelling it also stops the phone's own menu from opening.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      clear()
      fire()
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  }
}
