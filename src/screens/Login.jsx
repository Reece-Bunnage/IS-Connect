import { useState } from 'react'
import { logIn, signUp } from '../auth.js'

// Username + password login. The login is saved in the database, and this
// browser remembers it, so a refresh keeps you logged in.
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isSignup = mode === 'signup'

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLogin(await (isSignup ? signUp : logIn)(username, password))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup')
    setError(null)
  }

  return (
    <section className="card">
      <h1>{isSignup ? 'Create your login' : 'Welcome back'}</h1>
      <p className="muted">
        {isSignup ? 'Pick a username and password to save your profile.' : 'Log in to see your profile and study partners.'}
      </p>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="e.g. jamie.rivera"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>
          <button type="button" className="secondary" onClick={switchMode}>
            {isSignup ? 'I already have an account' : 'New here? Sign up'}
          </button>
        </div>
      </form>
    </section>
  )
}
