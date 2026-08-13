import { AccountBadge } from './components/AccountBadge'
import { ComponentTray } from './components/ComponentTray'
import { ReactionPanel } from './components/ReactionPanel'
import { SignInScreen } from './components/SignInScreen'
import { SpellCircle } from './components/SpellCircle'
import { SpellList } from './components/SpellList'
import { Spellbook } from './components/Spellbook'
import { StorageAlert } from './components/StorageAlert'
import { SpecialtyControl } from './components/SpecialtyControl'
import { AuthProvider } from './state/AuthProvider'
import { DragProvider } from './state/DragProvider'
import { useAuth } from './state/useAuth'
import { useWorkshop } from './state/useWorkshop'
import { WorkshopProvider } from './state/WorkshopProvider'
import './App.css'

function Workshop() {
  const { loading } = useWorkshop()

  if (loading) return <div className="gate" />

  return (
    <DragProvider>
      <div className="workshop">
        <header className="workshop__header">
          <h1>Greatforge</h1>
          <p>Spell workshop</p>
          <SpecialtyControl />
          <StorageAlert />
          <AccountBadge />
        </header>

        <aside className="workshop__rail workshop__rail--left">
          <SpellList />
        </aside>

        <main className="workshop__stage">
          <SpellCircle>
            <Spellbook />
          </SpellCircle>
        </main>

        <aside className="workshop__rail workshop__rail--right">
          <ReactionPanel />
          <ComponentTray />
        </aside>
      </div>
    </DragProvider>
  )
}

function Gate() {
  const { user, ready } = useAuth()

  // Firebase restores a stored session asynchronously; showing the gate before it
  // settles would flash a sign-in screen at someone who is already signed in.
  if (!ready) return <div className="gate" />
  if (!user) return <SignInScreen />

  // Keyed by uid so signing in as someone else builds a fresh workshop rather than
  // showing the previous account's components until the reload finishes.
  return (
    <WorkshopProvider key={user.uid}>
      <Workshop />
    </WorkshopProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

export default App
