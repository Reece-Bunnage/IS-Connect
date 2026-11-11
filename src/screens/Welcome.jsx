import { Icon } from '../ui.jsx'

export default function Welcome({ onStart }) {
  return <div className="welcome">
    <section className="welcome-hero">
      <p className="eyebrow">Your next step starts together</p>
      <h1>You belong in IS.<br />Find your people here.</h1>
      <p className="welcome-intro">Meet classmates, ask questions, and build confidence—one study session at a time. You don’t need to have it all figured out to get started.</p>
      <div className="row welcome-actions">
        <button className="primary" onClick={() => onStart('signup')}>Create an account →</button>
        <button className="secondary" onClick={() => onStart('login')}>Log in</button>
      </div>
      <p className="muted small-text">For Pre-IS students, IS Core students, IS minors, and TAs.</p>
    </section>
    <section aria-labelledby="welcome-how">
      <h2 id="welcome-how">A little connection. A lot of possibility.</h2>
      <div className="welcome-grid">
        {[
          ['user', '01', 'Start with you', 'Share your classes, strengths, and what you’d like help with. Everyone has something to offer.'],
          ['users', '02', 'Find your study people', 'Discover classmates with shared courses and complementary skills. Say hello at your own pace.'],
          ['calendar', '03', 'Make time to grow', 'Add your free times and schedule a meetup. Learn together and reflect on your progress.'],
        ].map(([icon, number, title, text]) => <article className="card" key={number}>
          <div className="welcome-step"><Icon name={icon} /><span>{number}</span></div>
          <h3>{title}</h3><p className="muted">{text}</p>
        </article>)}
      </div>
    </section>
    <section className="welcome-reassurance">
      <h2>New here? We’ll show you around.</h2>
      <p>After you create your profile, a short guided tour explains where to click. Skip it anytime or replay it from Help / Tour.</p>
      <button className="link" onClick={() => onStart('signup')}>Take your first step →</button>
    </section>
  </div>
}
