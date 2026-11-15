import { useState } from 'react'
import { changePassword } from '../auth.js'

// Choose a new password. On My Profile it asks for the current one. With
// `forced` it's a whole screen, shown right after logging in with an admin's
// temporary password and before anything else (no current password needed).
export default function ChangePassword({ forced = false, onChanged }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setDone(false)
    if (next !== again) {
      setError("The new passwords don't match.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const session = await changePassword(current, next)
      setCurrent('')
      setNext('')
      setAgain('')
      setDone(true)
      onChanged?.(session)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const form = (
    <form className="form" onSubmit={submit}>
      {!forced && (
        <label>
          Current password
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
      )}
      <label>
        New password
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
      </label>
      <label>
        New password again
        <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={6} required />
      </label>
      {error && <p className="error">{error}</p>}
      {done && !forced && (
        <p className="notice" role="status">
          Password changed. Any other browsers you were logged in on have been logged out.
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : forced ? 'Save and continue' : 'Change password'}
        </button>
      </div>
    </form>
  )

  if (!forced) return form
  return (
    <section className="card">
      <h1>Choose a new password</h1>
      <p className="muted">You logged in with a temporary password from an admin. Pick your own to keep using IS-Connect.</p>
      {form}
    </section>
  )
}
