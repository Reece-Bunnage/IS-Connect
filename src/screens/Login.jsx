import { useState } from 'react'
import { logIn, resetPassword, signUp } from '../auth.js'

// Username + password login. The login is saved in the database, and this
// browser remembers it, so a refresh keeps you logged in.
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [newSession, setNewSession] = useState(null) // holds the session until the code is saved
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') onLogin(await logIn(username, password))
      else if (mode === 'signup') setNewSession(await signUp(username, password))
      else setNewSession(await resetPassword(username, code, password))
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  function switchTo(next) {
    setMode(next)
    setError(null)
    setPassword('')
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(newSession.recovery_code)
      setCopied(true)
    } catch {
      // Clipboard blocked; they can still write it down.
    }
  }

  // After sign-up or a password reset: show the recovery code once.
  if (newSession) {
    return (
      <section className="card">
        <h1>Save your recovery code</h1>
        <p>
          If you ever forget your password, this code is the <strong>only</strong> way back into your account. It
          works once; you'll get a new one each time you use it.
        </p>
        <p className="recovery-code" aria-label="Recovery code">
          {newSession.recovery_code}
        </p>
        <div className="row">
          <button type="button" className="secondary" onClick={copyCode}>
            {copied ? 'Copied ✓' : 'Copy code'}
          </button>
        </div>
        <label className="check spaced">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I saved my recovery code somewhere safe
        </label>
        <button className="primary" disabled={!saved} onClick={() => onLogin(newSession)}>
          Continue →
        </button>
      </section>
    )
  }

  const titles = {
    login: ['Welcome back', 'Log in to see your profile and study partners.'],
    signup: ['Create your login', 'Pick a username and password. You\'ll set up your profile next.'],
    forgot: ['Reset your password', 'Enter your username and the recovery code you saved when you signed up.'],
  }

  return (
    <section className="card">
      <h1>{titles[mode][0]}</h1>
      <p className="muted">{titles[mode][1]}</p>

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
        {mode === 'forgot' && (
          <label>
            Recovery code
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" required />
          </label>
        )}
        <label>
          {mode === 'forgot' ? 'New password' : 'Password'}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : { login: 'Log in', signup: 'Sign up', forgot: 'Reset password' }[mode]}
          </button>
          {mode === 'login' ? (
            <button type="button" className="secondary" onClick={() => switchTo('signup')}>
              New here? Sign up
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => switchTo('login')}>
              Back to log in
            </button>
          )}
        </div>
        {mode === 'login' && (
          <button type="button" className="link align-start" onClick={() => switchTo('forgot')}>
            Forgot password?
          </button>
        )}
      </form>
    </section>
  )
}
