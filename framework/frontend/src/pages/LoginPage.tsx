import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuthStore } from '../lib/stores/authStore'
import { LayoutDashboard } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('consultant@arkhitx.com')
  const [password, setPassword] = useState('consultant123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await authApi.login(email, password)
      setAuth(data.access_token, data.user)
      navigate('/projects')
    } catch {
      setError('Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ax-bg p-4">
      <div className="w-full max-w-sm ax-panel p-6 shadow-ax">
        <div className="text-center mb-6">
          <LayoutDashboard className="w-8 h-8 text-ax-primary mx-auto mb-2" />
          <h1 className="text-lg font-bold">ArkhitX</h1>
          <p className="text-[10px] text-ax-text-muted uppercase tracking-wider mt-1">
            Governance Dashboard
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          {error && <div className="ax-alert-err">{error}</div>}

          <div>
            <label className="ax-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ax-input"
            />
          </div>

          <div>
            <label className="ax-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ax-input"
            />
          </div>

          <button type="submit" disabled={loading} className="ax-btn-primary w-full py-2">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-[10px] text-ax-text-muted text-center mt-4">
          Demo: consultant@arkhitx.com / consultant123
        </p>
      </div>
    </div>
  )
}
