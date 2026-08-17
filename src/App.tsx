import { AccountBadge } from './components/AccountBadge'
import { ComponentTray } from './components/ComponentTray'
import { GroupsButton } from './components/GroupsButton'
import { ReactionPanel } from './components/ReactionPanel'
import { SignInScreen } from './components/SignInScreen'
import { SpellCircle } from './components/SpellCircle'
import { SpellList } from './components/SpellList'
import { Spellbook } from './components/Spellbook'
import { StorageAlert } from './components/StorageAlert'
import { BenchToggle, CasterBar } from './components/CasterBar'
import { CastButton } from './components/CastButton'
import { AuthProvider } from './state/AuthProvider'
import { DragProvider } from './state/DragProvider'
import { GroupsProvider } from './state/GroupsProvider'
import { useAuth } from './state/useAuth'
import { useGroups } from './state/useGroups'
import { useWorkshop } from './state/useWorkshop'
import { WorkshopProvider } from './state/WorkshopProvider'
import './App.css'

function SpellActions() {
  const { mode, playMode, editDraft, saveDraft } = useWorkshop()

  return (
    <div className="stage__actions">
      {mode === 'view' ? (
        <>
          {/* Speaking the rite is the point of the player bench, so Edit gives up
              the emphasis there and keeps it in the sandbox, where it is the
              only thing to do with a written page. */}
          <button
            type="button"
            className={`btn btn--small${playMode === 'player' ? '' : ' btn--primary'}`}
            onClick={editDraft}
          >
            Edit
          </button>
          <CastButton />
        </>
      ) : (
        <button type="button" className="btn btn--small btn--primary" onClick={() => void saveDraft()}>
          Inscribe
        </button>
      )}
    </div>
  )
}

function Workshop() {
  const { loading } = useWorkshop()

  if (loading) return <div className="gate" />

  return (
    <DragProvider>
      <div className="workshop">
        <header className="workshop__header">
          <h1>Greatforge</h1>
          <p>Spell workshop</p>
          <CasterBar />
          {/* The bench switch rides with the account: both are switches on the
              whole workshop rather than on the working in front of it. */}
          <div className="workshop__account">
            <BenchToggle />
            {/* A group belongs to the account, the same as signing out does. */}
            <GroupsButton />
            <AccountBadge />
          </div>
        </header>

        <aside className="workshop__rail workshop__rail--left">
          <SpellList />
        </aside>

        <main className="workshop__stage">
          <SpellActions />
          <SpellCircle>
            <Spellbook />
          </SpellCircle>
          {/* Anchored to the stage's bottom-left corner rather than the header,
              where `.caster` is centred absolutely and a long message ran under
              it. */}
          <StorageAlert />
        </main>

        <aside className="workshop__rail workshop__rail--right">
          <ReactionPanel />
          <ComponentTray />
        </aside>
      </div>
    </DragProvider>
  )
}

/**
 * The one thing the two providers share, and it crosses here rather than through
 * a context read: singular reagents are a game master's to hand out, so the
 * workshop is told whether this account runs a table and knows nothing else about
 * groups. `WorkshopProvider` still mounts on its own, which the preview entry
 * points rely on.
 */
function Bench() {
  const { mastersATable } = useGroups()

  return (
    <WorkshopProvider singularsVisible={mastersATable}>
      <Workshop />
    </WorkshopProvider>
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
  // Groups sit beside the workshop rather than inside it: they share no state,
  // and nothing in the resolver has heard of them.
  //
  // Both carry the key themselves rather than inheriting one from a parent. The
  // guarantee is each provider's own, so reordering them, or dropping one, cannot
  // quietly leave the other leaking the previous account's records.
  return (
    <GroupsProvider key={user.uid}>
      <Bench key={user.uid} />
    </GroupsProvider>
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
