'use client'
// The window in the viewer's own time zone. The server cannot know it, so it
// paints UTC; on hydration the browser's snapshot takes over.
import { useSyncExternalStore } from 'react'
import { formatWindow } from '@/lib/bob/audience.ts'

const noChange = () => () => {}

export function LocalWindow({ from, to }: { from: string; to: string }) {
  const text = useSyncExternalStore(
    noChange,
    () => formatWindow(new Date(from), new Date(to)),
    () => formatWindow(new Date(from), new Date(to), 'UTC'),
  )
  return <time dateTime={`${from}/${to}`}>{text}</time>
}
