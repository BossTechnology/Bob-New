import { isBox } from '@/lib/bob/runtime.ts'
import LoginForm from './login-form'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return <LoginForm box={isBox()} />
}
