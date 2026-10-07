export default function ComingSoon({ title, text }) {
  return (
    <section className="card">
      <h1>{title}</h1>
      <p>{text}</p>
      <p className="notice">Coming soon. The database table for this screen already exists.</p>
    </section>
  )
}
