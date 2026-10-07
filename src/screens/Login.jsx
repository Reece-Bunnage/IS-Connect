import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

// Email + password login. Supabase keeps the session in the browser, so a
// refresh keeps you logged in.
export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const isSignup = mode === 'signup'

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    const credentials = { email: email.trim(), password }
    const { data, error } = isSignup
      ? await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
        })
      : await supabase.auth.signInWithPassword(credentials)

    if (error) setError(error.message)
    // Only happens if "Confirm email" is still on in Supabase.
    else if (isSignup && !data.session) setNotice('Check your email to confirm your account, then log in.')
    setBusy(false)
  }

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup')
    setError(null)
    setNotice(null)
  }

  return (
    <section className="card">
      <h1>{isSignup ? 'Create your login' : 'Welcome back'}</h1>
      <p className="muted">
        {isSignup ? 'Sign up to save your profile and find study partners.' : 'Log in to see your profile and study partners.'}
      </p>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
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
        {notice && <p className="notice">{notice}</p>}

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
