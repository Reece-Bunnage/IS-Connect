import { useState } from 'react'
import { logIn, requestPasswordReset, signUp } from '../auth.js'

// Username + password login. The login is saved in the database, and this
// browser remembers it, so a refresh keeps you logged in.
// "Forgot password?" asks an admin for help (see request_password_reset).
export default function Login({ onLogin, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode) // 'login' | 'signup' | 'forgot'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [requestSent, setRequestSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') onLogin(await logIn(username, password))
      else if (mode === 'signup') onLogin(await signUp(username, password))
      else {
        await requestPasswordReset(username, contact, note)
        setRequestSent(true)
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  function switchTo(next) {
    setMode(next)
    setError(null)
    setPassword('')
    setRequestSent(false)
  }

  if (requestSent) {
    return (
      <section className="card">
        <h1>Request sent</h1>
        <p>
          An admin will contact you at <strong>{contact.trim()}</strong> to check it's you, then give you a temporary password.
        </p>
        <p className="muted">It works for 48 hours. When you log in with it, you'll choose a new password.</p>
        <button className="primary" onClick={() => switchTo('login')}>
          Back to log in
        </button>
      </section>
    )
  }

  const titles = {
    login: ['Welcome back', 'Log in to see your profile and study partners.'],
    signup: ['Create your login', "Pick a username and password. You'll set up your profile next."],
    forgot: ['Forgot your password?', "Send a request to an admin. They'll contact you, check it's you, and give you a temporary password."],
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
        {mode === 'forgot' ? (
          <>
            <label>
              How can an admin reach you?
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                autoComplete="email"
                placeholder="School email or phone number"
                minLength={3}
                maxLength={200}
                required
              />
            </label>
            <label>
              Anything else they should know? (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. I'm in IS 201, section 3" />
            </label>
          </>
        ) : (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : { login: 'Log in', signup: 'Sign up', forgot: 'Send request' }[mode]}
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
