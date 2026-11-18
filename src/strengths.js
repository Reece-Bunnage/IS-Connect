export const normalizeStrength = value => value.trim().replace(/\s+/g, ' ')

// Reuse an existing topic instead of creating a differently capitalized copy.
export function addStrength(value, skills, skillIds, customStrengths) {
  const name = normalizeStrength(value)
  if (!name) throw new Error('Enter a strength, such as Tableau or public speaking.')
  if (name.length > 40) throw new Error('Keep each strength to 40 characters or fewer.')
  const existing = skills.find(skill => skill.name.toLowerCase() === name.toLowerCase())
  if (existing) return { skillIds: [...new Set([...skillIds, existing.id])], customStrengths }
  if (customStrengths.some(item => item.toLowerCase() === name.toLowerCase())) {
    return { skillIds, customStrengths }
  }
  if (customStrengths.length >= 10) throw new Error('Add up to 10 custom strengths at a time.')
  return { skillIds, customStrengths: [...customStrengths, name] }
}
