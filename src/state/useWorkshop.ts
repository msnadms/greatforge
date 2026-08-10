import { useContext } from 'react'
import { WorkshopContext, type WorkshopValue } from './workshopContext'

export function useWorkshop(): WorkshopValue {
  const value = useContext(WorkshopContext)
  if (!value) {
    throw new Error('useWorkshop must be used inside a <WorkshopProvider>')
  }
  return value
}
