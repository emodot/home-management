import { useEffect, useEffectEvent, useState } from 'react'

/**
 * A search box's text, reported through `onChange` 300ms after typing stops. `value` is the search
 * in effect (usually from the URL).
 */
export function useDebouncedSearch(value: string | undefined, onChange: (q: string) => void) {
  const [text, setText] = useState(value ?? '')
  const emit = useEffectEvent(onChange)

  // Follow outside changes to the URL (back/forward, "Clear all"), but don't fight the user's
  // typing: "diesel " and "diesel" are the same search.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    if ((value ?? '') !== text.trim()) setText(value ?? '')
  }

  useEffect(() => {
    if (text.trim() === (value ?? '')) return
    const timer = setTimeout(() => emit(text), 300)
    return () => clearTimeout(timer)
  }, [text, value])

  return [text, setText] as const
}
