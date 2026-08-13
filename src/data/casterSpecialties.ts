import type { CasterSpecialty, SpellForm } from '../types/worldbuilding'

export interface CasterSpecialtyMeta {
  specialty: CasterSpecialty
  label: string
  forms: readonly SpellForm[]
  description: string
}

/**
 * The three specialties each learn four forms. Ward and invocation stay apart:
 * no caster may write both the safest open-circle form and the full-ring form.
 */
export const CASTER_SPECIALTY_META: Record<CasterSpecialty, CasterSpecialtyMeta> = {
  warden: {
    specialty: 'warden',
    label: 'Warden',
    forms: ['prayer', 'ward', 'benediction', 'litany'],
    description: 'Keeps thresholds and works within a deliberately open circle.',
  },
  invoker: {
    specialty: 'invoker',
    label: 'Invoker',
    forms: ['prayer', 'invocation', 'litany', 'benediction'],
    description: 'Closes the circle and calls until something answers.',
  },
  mourner: {
    specialty: 'mourner',
    label: 'Mourner',
    forms: ['prayer', 'elegy', 'dirge', 'benediction'],
    description: 'Works through absence, grief, and what has already gone.',
  },
}

export function formsForSpecialty(specialty: CasterSpecialty): readonly SpellForm[] {
  return CASTER_SPECIALTY_META[specialty].forms
}
