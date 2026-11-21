import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The simulator is the entry in and out of the box. In the box it stops
// inventing and paints bob's projections (public/bob-live.mjs, P-4).
export default function Home() {
  redirect('/dashboard.html')
}
