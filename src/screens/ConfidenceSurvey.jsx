import { useState } from 'react'
import { rpc } from '../api.js'

export default function ConfidenceSurvey({ meetup, surveys }) {
  const saved = surveys.data?.find(s => s.meetup_id === meetup.id)
  const [editing, setEditing] = useState(false)
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (surveys.error) return <p className="error" role="alert">Confidence surveys could not load. <button className="link" onClick={surveys.reload}>Try again</button></p>
  if (!surveys.data) return <p className="muted">Loading confidence survey…</p>
  if (saved && !editing) return <section className="confidence-survey" aria-label="Saved confidence survey">
    <strong>Confidence survey saved</strong>
    <p>Your confidence: {saved.confidence_before}/5 before → {saved.confidence_after}/5 after.</p>
    {saved.notes && <p className="survey-notes">{saved.notes}</p>}
    <button className="secondary small" onClick={() => {
      setBefore(String(saved.confidence_before)); setAfter(String(saved.confidence_after)); setNotes(saved.notes || ''); setEditing(true)
    }}>Edit answers</button>
  </section>

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      await rpc('submit_meetup_survey', { p_meetup_id: meetup.id, p_before: Number(before), p_after: Number(after), p_notes: notes })
      await surveys.reload(); setEditing(false)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <form className="confidence-survey" onSubmit={submit}>
    <h4>How confident do you feel?</h4>
    <p className="muted">Think about understanding and applying what you studied{meetup.topic ? `: ${meetup.topic}` : ''}. Your answers are private to your account.</p>
    <p className="small-text">1 = Not at all confident · 5 = Very confident. The “before” rating is your recollection after the meeting.</p>
    <fieldset disabled={busy}>
      {[['Before this meetup', before, setBefore, 'before'], ['After this meetup', after, setAfter, 'after']].map(([label, value, setter, key]) =>
        <fieldset key={key} className="confidence-rating">
          <legend>{label}</legend>
          <div className="row">{[1, 2, 3, 4, 5].map(n => <label key={n}>
            <input type="radio" name={`${key}-${meetup.id}`} value={n} checked={value === String(n)} onChange={e => setter(e.target.value)} required /> {n}
          </label>)}</div>
        </fieldset>)}
      <label className="survey-note-label">What helped, or what do you still need help with? (optional)
        <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={3} />
      </label>
      <p className="muted small-text">{notes.length}/1,000 characters</p>
      <button className="primary small" type="submit" disabled={!before || !after}>{busy ? 'Saving…' : 'Save confidence survey'}</button>
      {saved && <button className="link small" type="button" onClick={() => setEditing(false)}>Cancel</button>}
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
  </form>
}

export function ConfidenceSummary({ surveys }) {
  if (!surveys.data?.length) return null
  const mean = key => surveys.data.reduce((sum, s) => sum + s[key], 0) / surveys.data.length
  const before = mean('confidence_before'), after = mean('confidence_after')
  return <section className="card" aria-label="Your confidence progress" aria-live="polite">
    <h2>Your confidence progress</h2>
    <p>{surveys.data.length} meetup survey{surveys.data.length === 1 ? '' : 's'} · Average confidence: <strong>{before.toFixed(1)}/5 before → {after.toFixed(1)}/5 after</strong></p>
    <p className="muted">Average change: {after - before > 0 ? '+' : ''}{(after - before).toFixed(1)} points. Based on your own before-and-after ratings.</p>
  </section>
}

