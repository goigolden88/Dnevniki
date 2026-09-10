import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { startAutoSync } from './core/sync.ts'
import { Layout } from './ui/Layout.tsx'
import { Today } from './screens/Today.tsx'
import { ItemScreen } from './modules/cycles/ItemScreen.tsx'
import { HealthScreen } from './modules/health/HealthScreen.tsx'
import { EpisodeScreen } from './modules/health/EpisodeScreen.tsx'
import { SummaryScreen } from './modules/health/SummaryScreen.tsx'
import { ContentScreen } from './modules/content/ContentScreen.tsx'
import { Feed } from './screens/Feed.tsx'
import { Settings } from './screens/Settings.tsx'

/**
 * Роутинг через хеш (Р-10): на GitHub Pages обычные пути дают 404 при
 * обновлении страницы — сервер ищет файл, которого нет. Всё после #
 * до сервера не доходит.
 */
export function App() {
  // Подписка на всё, после чего синхронизация может понадобиться: правка
  // в базе, возврат сети, возврат вкладки, запуск приложения. Живёт столько
  // же, сколько приложение; отписка нужна только перезагрузке в разработке.
  useEffect(() => startAutoSync(), [])

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="cycle/:id" element={<ItemScreen />} />
          <Route path="health" element={<HealthScreen />} />
          <Route path="health/summary" element={<SummaryScreen />} />
          <Route path="episode/:id" element={<EpisodeScreen />} />
          <Route path="content" element={<ContentScreen />} />
          <Route path="feed" element={<Feed />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
