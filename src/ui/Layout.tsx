import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Сейчас', end: true },
  { to: '/feed', label: 'Лента', end: false },
  { to: '/settings', label: 'Настройки', end: false },
]

export function Layout() {
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
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
