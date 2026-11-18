import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { countryFlag } from '../../domain/athlete/countries'
import { getLevel } from '../../domain/athlete/levels'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import { getCampService, SEARCH_MIN, type CampService, type FoundRunner, type FriendEntry, type FriendError } from '../../repositories/supabase/campClient'
import styles from './BaseCamp.module.css'
import { friendOf, useFriends, visitPath } from './visits'

const errorKey = (error: FriendError) => `basecamp.friends.error.${error}` as MessageKey

/**
 * The friends list (owner design, 17 November 2026), in Base Camp: requests to answer, friends
 * (each with their level and a way to visit their refuge or remove them) and the requests the
 * player sent. Friends are added from a runner's refuge.
 */
export function FriendsSheet({ onClose, service = getCampService() }: { onClose(): void; service?: CampService | null }) {
  const { t } = useI18n()
  const { list, reload } = useFriends(service)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function run(name: string, action: () => Promise<unknown>) {
    if (busy) return
    setBusy(name)
    setMessage('')
    const answer = await action()
    setBusy(null)
    if (answer === 'offline' || answer === 'too-many-friends' || answer === 'too-many-pending') setMessage(t(errorKey(answer)))
    reload()
  }

  const group = (relation: FriendEntry['relation']) => (Array.isArray(list) ? list.filter((entry) => entry.relation === relation) : [])
  const incoming = group('incoming')
  const friends = group('friend')
  const outgoing = group('outgoing')

  return (
    <div className={styles.shopBack} role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.shop} role="dialog" aria-modal="true" aria-labelledby="camp-friends-title">
        <header className={styles.shopHead}>
          <h2 id="camp-friends-title">{t('basecamp.friends.title')}</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            {t('basecamp.shop.close')}
          </button>
        </header>
        <div className={styles.shopBody}>
          {service && <RunnerSearch service={service} friends={list} />}
          {message && (
            <p role="alert" className={styles.shopError}>
              {message}
            </p>
          )}
          {list === null ? (
            <p className={styles.muted}>{t('basecamp.friends.loading')}</p>
          ) : list === 'offline' ? (
            <p className={styles.muted}>{t('basecamp.friends.offline')}</p>
          ) : list.length === 0 ? (
            <p className={styles.muted}>{t('basecamp.friends.empty')}</p>
          ) : (
            <>
              {incoming.length > 0 && (
                <FriendGroup title={t('basecamp.friends.incoming')} entries={incoming}>
                  {(entry) => (
                    <>
                      <button type="button" className={styles.action} aria-disabled={busy !== null || undefined} onClick={() => void run(entry.name, () => service!.answerFriend(entry.name, true))}>
                        {t('basecamp.friends.accept')}
                        <span className={styles.srOnly}> {entry.name}</span>
                      </button>
                      <button type="button" className={styles.slotRemove} aria-disabled={busy !== null || undefined} onClick={() => void run(entry.name, () => service!.answerFriend(entry.name, false))}>
                        {t('basecamp.friends.decline')}
                        <span className={styles.srOnly}> {entry.name}</span>
                      </button>
                    </>
                  )}
                </FriendGroup>
              )}
              <FriendGroup title={t('basecamp.friends.list', { count: friends.length })} entries={friends} empty={t('basecamp.friends.none')}>
                {(entry) => (
                  <>
                    <Link to={visitPath(entry.name)} className={styles.action}>
                      {t('basecamp.mailbox.visitBack')}
                      <span className={styles.srOnly}> {entry.name}</span>
                    </Link>
                    <button
                      type="button"
                      className={styles.slotRemove}
                      aria-disabled={busy !== null || undefined}
                      onClick={() => window.confirm(t('basecamp.friends.removeConfirm', { name: entry.name })) && void run(entry.name, () => service!.removeFriend(entry.name))}
                    >
                      {t('basecamp.friends.remove')}
                      <span className={styles.srOnly}> {entry.name}</span>
                    </button>
                  </>
                )}
              </FriendGroup>
              {outgoing.length > 0 && (
                <FriendGroup title={t('basecamp.friends.outgoing')} entries={outgoing}>
                  {(entry) => (
                    <button type="button" className={styles.slotRemove} aria-disabled={busy !== null || undefined} onClick={() => void run(entry.name, () => service!.removeFriend(entry.name))}>
                      {t('basecamp.friends.withdraw')}
                      <span className={styles.srOnly}> {entry.name}</span>
                    </button>
                  )}
                </FriendGroup>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Finding a runner by name (owner request, 18 November 2026): their refuge opens from the result,
 * to visit them or ask to be friends. Searches as the player types, after a short pause.
 */
function RunnerSearch({ service, friends }: { service: CampService; friends: FriendEntry[] | 'offline' | null }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; runners: FoundRunner[] | 'offline' } | null>(null)
  const clean = query.trim()
  useEffect(() => {
    if (clean.length < SEARCH_MIN) return
    let live = true
    const timer = window.setTimeout(() => {
      void service.searchRunners(clean).then((runners) => live && setFound({ query: clean, runners }))
    }, 300)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [clean, service])
  const results = clean.length >= SEARCH_MIN && found?.query === clean ? found.runners : null

  return (
    <section className={styles.friendGroup} aria-label={t('basecamp.friends.search')}>
      <input
        type="search"
        className={styles.searchInput}
        value={query}
        maxLength={40}
        placeholder={t('basecamp.friends.searchPlaceholder')}
        aria-label={t('basecamp.friends.search')}
        onChange={(e) => setQuery(e.target.value)}
      />
      {clean.length >= SEARCH_MIN &&
        (results === null ? (
          <p className={styles.muted}>{t('basecamp.friends.searching')}</p>
        ) : results === 'offline' ? (
          <p className={styles.muted}>{t('basecamp.friends.offline')}</p>
        ) : results.length === 0 ? (
          <p className={styles.muted}>{t('basecamp.friends.notFound')}</p>
        ) : (
          <ul className={styles.letters} aria-label={t('basecamp.friends.results')}>
            {results.map((runner) => {
              const relation = friendOf(friends, runner.name)?.relation
              return (
                <li key={runner.name}>
                  <span aria-hidden="true">{runner.country ? countryFlag(runner.country) : '🏃'}</span>
                  <span>
                    {runner.name}
                    <small>
                      {t('ranking.level', { level: getLevel(runner.xp) })}
                      {relation === 'friend' && ` · ${t('basecamp.friends.areFriends')}`}
                    </small>
                  </span>
                  <Link to={visitPath(runner.name)} className={styles.action}>
                    {t('basecamp.friends.seeRefuge')}
                    <span className={styles.srOnly}> {runner.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ))}
    </section>
  )
}

function FriendGroup({ title, entries, empty, children }: { title: string; entries: FriendEntry[]; empty?: string; children(entry: FriendEntry): ReactNode }) {
  const { t } = useI18n()
  return (
    <section className={styles.friendGroup} aria-label={title}>
      <h3>{title}</h3>
      {entries.length === 0 ? (
        empty && <p className={styles.muted}>{empty}</p>
      ) : (
        <ul className={styles.letters}>
          {entries.map((entry) => (
            <li key={entry.name}>
              <span aria-hidden="true">{entry.country ? countryFlag(entry.country) : '🏃'}</span>
              <span>
                {entry.name}
                <small>{t('ranking.level', { level: getLevel(entry.xp) })}</small>
              </span>
              <span className={styles.friendActions}>{children(entry)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * On another runner's refuge: asks to be friends, accepts their request, or says what is
 * waiting. A friendship is ended from the friends list.
 */
export function FriendButton({ name, service = getCampService() }: { name: string; service?: CampService | null }) {
  const { t } = useI18n()
  const { list, reload } = useFriends(service)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!service || list === null || list === 'offline') return null
  const relation = friendOf(list, name)?.relation ?? (sent ? 'outgoing' : null)

  async function act(action: () => Promise<string>) {
    if (busy) return
    setBusy(true)
    setError('')
    const answer = await action()
    setBusy(false)
    if (answer === 'offline' || answer === 'too-many-friends' || answer === 'too-many-pending') return setError(t(errorKey(answer)))
    if (answer === 'pending') setSent(true)
    reload()
  }

  return (
    <>
      {relation === 'friend' ? (
        <span className={styles.customize} role="status">
          {t('basecamp.friends.areFriends')}
        </span>
      ) : relation === 'outgoing' ? (
        <span className={styles.customize} role="status">
          {t('basecamp.friends.sent')}
        </span>
      ) : relation === 'incoming' ? (
        <button type="button" className={styles.customize} aria-disabled={busy || undefined} onClick={() => void act(() => service.answerFriend(name, true))}>
          {t('basecamp.friends.acceptTheirs')}
        </button>
      ) : (
        <button type="button" className={styles.customize} aria-disabled={busy || undefined} onClick={() => void act(() => service.requestFriend(name))}>
          {t('basecamp.friends.add')}
        </button>
      )}
      {error && (
        <p role="alert" className={styles.visitError}>
          {error}
        </p>
      )}
    </>
  )
}
