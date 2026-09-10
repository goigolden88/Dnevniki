import { NavLink, Outlet } from 'react-router-dom'
import { ScrollButtons } from './ScrollButtons.tsx'

/**
 * Нижняя панель: только то, что открывают каждый день.
 *
 * «Настроек» здесь нет намеренно (Р-43). В них заходят раз в месяц,
 * а место в панели они занимали наравне с ежедневным — и с появлением
 * контента панель перестала помещаться на телефоне. Настройки живут
 * шестерёнкой в шапке экрана «Сейчас», там же индикатор синхронизации.
 */
const TABS = [
  { to: '/', label: 'Сейчас', end: true },
  { to: '/health', label: 'Здоровье', end: false },
  { to: '/content', label: 'Контент', end: false },
  { to: '/feed', label: 'Лента', end: false },
]

export function Layout() {
  return (
    <div className="layout">
      <main className="content">
        <Outlet />
      </main>

      <ScrollButtons />

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
