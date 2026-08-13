import { useState } from 'react'
import { CASTER_SPECIALTY_META } from '../data/casterSpecialties'
import { useWorkshop } from '../state/useWorkshop'
import type { CasterSpecialty } from '../types/worldbuilding'

/** The caster's discipline lives in the header, alongside the workshop it governs. */
export function SpecialtyControl() {
  const { chooseSpecialty, profile } = useWorkshop()
  const [saving, setSaving] = useState(false)

  async function select(specialty: CasterSpecialty) {
    setSaving(true)
    await chooseSpecialty(specialty)
    setSaving(false)
  }

  return (
    <select
      className="specialty-control"
      aria-label="Discipline"
      value={profile.specialty ?? ''}
      onChange={(event) => void select(event.target.value as CasterSpecialty)}
      disabled={saving}
    >
      <option value="" disabled>
        Choose discipline
      </option>
      {(Object.keys(CASTER_SPECIALTY_META) as CasterSpecialty[]).map((specialty) => {
        const entry = CASTER_SPECIALTY_META[specialty]
        return (
          <option key={entry.specialty} value={entry.specialty}>
            {entry.label}
          </option>
        )
      })}
    </select>
  )
}
