import { useContext } from 'react'
import { DragContext, type DragValue } from './dragContext'

export function useDrag(): DragValue {
  const value = useContext(DragContext)
  if (!value) {
    throw new Error('useDrag must be used inside a <DragProvider>')
  }
  return value
}
