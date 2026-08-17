import { useContext } from 'react'
import { GroupsContext, type GroupsValue } from './groupsContext'

export function useGroups(): GroupsValue {
  const value = useContext(GroupsContext)
  if (!value) {
    throw new Error('useGroups must be used inside a <GroupsProvider>')
  }
  return value
}
