import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { config } from './app/config.ts'
import { db, sync } from './app/core.ts'
import { CoreProvider } from './shared/ui/core.tsx'
import { Layout, type Tab } from './shared/ui/Layout.tsx'
import { Today } from './screens/Today.tsx'
import { ItemScreen } from './modules/cycles/ItemScreen.tsx'
import { HealthScreen } from './modules/health/HealthScreen.tsx'
import { EpisodeScreen } from './modules/health/EpisodeScreen.tsx'
import { SummaryScreen } from './modules/health/SummaryScreen.tsx'
import { ContentScreen } from './modules/content/ContentScreen.tsx'
import { Feed } from './screens/Feed.tsx'
import { Settings } from './screens/Settings.tsx'
import { Help } from './screens/Help.tsx'

/**
 * Нижняя панель: только то, что открывают каждый день.
 *
 * «Настроек» здесь нет намеренно (Р-43). В них заходят раз в месяц,
 * а место в панели они занимали наравне с ежедневным — и с появлением
 * контента панель перестала помещаться на телефоне. Настройки живут
 * шестерёнкой в шапке экрана «Сейчас», там же индикатор синхронизации.
 */
const TABS: readonly Tab[] = [
  { to: '/', name: 'Сейчас', end: true },
  { to: '/health', name: 'Здоровье', end: false },
  { to: '/content', name: 'Контент', end: false },
  { to: '/feed', name: 'Лента', end: false },
]

/**
 * Роутинг через хеш (Р-10): на GitHub Pages обычные пути дают 404 при
 * обновлении страницы — сервер ищет файл, которого нет. Всё после #
 * до сервера не доходит.
 *
 * Общий интерфейс ядра — нижняя панель, «Настройки синхронизации», «Что
 * нового» — берёт базу и синхронизацию из `CoreProvider` (Я-03 «FamilyCore»).
 */
export function App() {
  // Подписка на всё, после чего синхронизация может понадобиться: правка
  // в базе, возврат сети, возврат вкладки, запуск приложения. Живёт столько
  // же, сколько приложение; отписка нужна только перезагрузке в разработке.
  useEffect(() => sync.startAutoSync(), [])

  return (
    <CoreProvider value={{ config, db, sync }}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout tabs={TABS} />}>
            <Route index element={<Today />} />
            <Route path="cycle/:id" element={<ItemScreen />} />
            <Route path="health" element={<HealthScreen />} />
            <Route path="health/summary" element={<SummaryScreen />} />
            <Route path="episode/:id" element={<EpisodeScreen />} />
            <Route path="content" element={<ContentScreen />} />
            <Route path="feed" element={<Feed />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </CoreProvider>
  )
}
