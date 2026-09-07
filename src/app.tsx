import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './ui/Layout.tsx'
import { Today } from './screens/Today.tsx'
import { Feed } from './screens/Feed.tsx'
import { Settings } from './screens/Settings.tsx'

/**
 * Роутинг через хеш (Р-10): на GitHub Pages обычные пути дают 404 при
 * обновлении страницы — сервер ищет файл, которого нет. Всё после #
 * до сервера не доходит.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Today />} />
          <Route path="feed" element={<Feed />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
