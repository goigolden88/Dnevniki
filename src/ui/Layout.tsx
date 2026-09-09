import { NavLink, Outlet } from 'react-router-dom'
import { useSyncStatus } from './useSync.ts'

const TABS = [
  { to: '/', label: 'Сейчас', end: true },
  { to: '/feed', label: 'Лента', end: false },
  { to: '/settings', label: 'Настройки', end: false },
]

export function Layout() {
  const status = useSyncStatus()

  // Синхронизация живёт в фоне, и единственное место, где о ней можно узнать,
  // — «Настройки». Точка на вкладке говорит, что туда стоит заглянуть:
  // красная — что-то сломалось, тусклая — очередь не ушла.
  const mark =
    status.state === 'error' ? 'dot dot--error' : status.pending > 0 ? 'dot' : ''

  return (
    <div className="layout">
      <main className="content">
        <Outlet />
      </main>

      <nav className="tabs">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => (isActive ? 'tab tab--active' : 'tab')}
          >
            {tab.label}
            {tab.to === '/settings' && mark && <span className={mark} aria-hidden="true" />}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
