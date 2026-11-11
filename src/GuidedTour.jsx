import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const STEPS = [
  ['myProfile', 'Your profile is your starting point', 'Click My Profile to review your classes, strengths, and topics you need help with. You can update them whenever things change.'],
  ['calendar', 'Make room for a study session', 'Click Availability to choose your free times, then save. Keeping this up to date helps you find a time that works.'],
  ['findFriends', 'Find someone to learn with', 'Click Find Friends to browse classmates. Look for shared classes and skills that match what you want to learn.'],
  ['messages', 'Start with a simple hello', 'Click Messages to chat. Try: “Hi! I’m working on SQL for IS 201. Want to study together?”'],
  ['meetups', 'Turn a connection into a meetup', 'Click My Meetups to schedule a session and review invitations. Choose a topic, time, and place, then wait for your partner to confirm.'],
  ['resources', 'Keep useful guides close', 'Click Study Resources to find and save guides, or share something that helped you. You can replay this tour from Help / Tour anytime.'],
]

export function tourKey(userId) { return `is-connect-tour-v1:${userId}` }
export function tourWasSeen(userId) {
  try { return localStorage.getItem(tourKey(userId)) === 'done' } catch { return false }
}

export default function GuidedTour({ userId, onClose, go }) {
  const [step, setStep] = useState(0)
  const [anchor, setAnchor] = useState(null)
  const dialog = useRef(null)
  const nextButton = useRef(null)
  const [screen, title, description] = STEPS[step]

  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  useLayoutEffect(() => {
    function position() {
      const target = document.querySelector(`[data-tour="${screen}"]`)
      document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'))
      if (target && target.getClientRects().length) {
        target.classList.add('tour-highlight')
        const box = target.getBoundingClientRect()
        setAnchor({ left: Math.min(box.right + 24, window.innerWidth - 390), top: Math.max(16, Math.min(box.top, window.innerHeight - 390)) })
      } else setAnchor(null)
    }
    position(); nextButton.current?.focus()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'))
    }
  }, [screen])

  function finish(destination) {
    try { localStorage.setItem(tourKey(userId), 'done') } catch { /* The tour still works without storage. */ }
    onClose()
    if (destination) go(destination)
  }

  return <dialog ref={dialog} className={`tour-bubble ${anchor ? 'tour-anchored' : ''}`}
    style={anchor ? { left: anchor.left, top: anchor.top } : undefined}
    aria-labelledby="tour-title" aria-describedby="tour-description" onCancel={e => { e.preventDefault(); finish() }}>
    <div className="tour-meta"><span>QUICK TOUR · {step + 1} OF {STEPS.length}</span><button className="link" onClick={() => finish()}>Skip tour</button></div>
    <div aria-live="polite" aria-atomic="true"><h2 id="tour-title">{title}</h2><p id="tour-description">{description}</p></div>
    <button className="secondary" onClick={() => finish(screen)}>Open this page →</button>
    <div className="tour-footer">
      <button className="link" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
      <span className="tour-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i === step ? 'active' : ''} />)}</span>
      <button ref={nextButton} className="primary" onClick={() => step === STEPS.length - 1 ? finish() : setStep(step + 1)}>{step === STEPS.length - 1 ? 'Finish tour' : 'Next →'}</button>
    </div>
    <p className="muted small-text">“Open this page” ends the tour so you can try it. Replay it anytime from Help / Tour.</p>
  </dialog>
}
