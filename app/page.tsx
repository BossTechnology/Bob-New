import { redirect } from 'next/navigation'
import { isBox } from '@/lib/bob/runtime.ts'

export const dynamic = 'force-dynamic'

// In the box the simulator is off (it paints invented figures); the screens
// that read bob are the entry.
export default function Home() {
  redirect(isBox() ? '/bob/performance' : '/dashboard.html')
}
