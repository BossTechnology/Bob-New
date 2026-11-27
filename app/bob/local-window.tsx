'use client'
// The screen's window in the viewer's own time zone. The server renders it in
// UTC (it cannot know the browser's zone); the browser repaints it local.
import { useSyncExternalStore } from 'react'
import { formatWindow } from '@/lib/bob/screen-copy.ts'

const subscribe = () => () => {}

// Epoch milliseconds, not ISO strings: the viewer's payload carries no ISO
// instant (review of PR #66).
export function LocalWindow({ from, to }: { from: number; to: number }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatWindow(new Date(from), new Date(to)),
    () => `${formatWindow(new Date(from), new Date(to), 'UTC')} (UTC)`,
  )
  return <span>Periodo: {text}</span>
}
