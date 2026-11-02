// How well another student fits you. Used by Find Friends and Home.
import { formatSlot, sharedSlots } from './time.js'

// Everything matching needs about each student.
export const STUDENT_SELECT =
  'id, user_id, full_name, avatar_color, program_status, graduation_year, looking_for_help_with, ask_me_about, bio, ' +
  'last_active_at, created_at, student_skills(skill_id, skills(name)), student_courses(course_id, courses(code)), ' +
  'student_needs(skill_id, skills(name)), availability_slots(day_of_week, start_time, duration_minutes)'

// Score + reasons for one other student, given your own row (same shape).
function match(s, myRow) {
  const reasons = []
  let score = 0
  const myCourses = new Set(myRow.student_courses.map((c) => c.course_id))
  const myNeeds = new Set(myRow.student_needs.map((n) => n.skill_id))
  const mySkills = new Set(myRow.student_skills.map((k) => k.skill_id))

  const sharedCourses = s.student_courses.filter((c) => myCourses.has(c.course_id)).map((c) => c.courses.code)
  if (sharedCourses.length) {
    score += 3 * sharedCourses.length
    reasons.push(`In ${sharedCourses.join(', ')} with you`)
  }
  const canHelp = s.student_skills.filter((k) => myNeeds.has(k.skill_id)).map((k) => k.skills.name)
  if (canHelp.length) {
    score += 4 * canHelp.length
    reasons.push(`Strong in ${canHelp.join(', ')}, which you need`)
  }
  const youHelp = s.student_needs.filter((n) => mySkills.has(n.skill_id)).map((n) => n.skills.name)
  if (youHelp.length) {
    score += 2 * youHelp.length
    reasons.push(`Needs help with ${youHelp.join(', ')}, your strength`)
  }
  if (s.shared.length) {
    score += 2
    reasons.push(`Free together ${s.shared.slice(0, 2).map(formatSlot).join(', ')}`)
  }
  if (s.last_active_at && Date.now() - new Date(s.last_active_at) < 7 * 864e5) score += 1
  return { score, reasons }
}

// Every other visible student with `shared` (free times in common), `score` and `reasons`.
export function scoreStudents(students, meId, hidden) {
  const myRow = students.find((s) => s.id === meId)
  if (!myRow) return []
  return students
    .filter((s) => s.id !== meId && !hidden.has(s.id))
    .map((s) => {
      const withShared = { ...s, shared: sharedSlots(myRow.availability_slots, s.availability_slots) }
      return { ...withShared, ...match(withShared, myRow) }
    })
}
