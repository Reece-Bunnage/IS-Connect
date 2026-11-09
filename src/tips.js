export const tips = [
  'SQL stands for Structured Query Language. A JOIN combines rows from two tables that share a matching column.',
  'An ERD (Entity Relationship Diagram) maps the things your app stores and how they relate.',
  'A primary key uniquely identifies each row. A foreign key points to a primary key in another table.',
  'Stuck on a bug? Explain it out loud to a study partner. You will often spot the fix mid-sentence.',
  'Recruiters love projects. A small app you built and can explain beats a long list of buzzwords.',
  'In Excel, Ctrl + Arrow jumps to the edge of your data. It saves a lot of scrolling.',
  'OSI stands for Open Systems Interconnection.',
  'TCP stands for Transmission Control Protocol, and IP stands for Internet Protocol.',
]

export function tipOfTheDay() {
  const day = Math.floor(Date.now() / 86_400_000)
  return tips[day % tips.length]
}
