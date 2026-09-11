import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app.tsx'
import { db } from './core/db.ts'
import { listenInstall } from './ui/install.ts'
import './styles.css'

// До первого экрана: Chrome присылает событие установки рано и один раз (Р-69).
listenInstall()

const root = document.getElementById('root')
if (!root) throw new Error('Не найден #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Постоянное хранилище (Р-61): без него браузер вправе стереть базу при
// нехватке места. Отказ — не ошибка, работать можно и так.
void db.persist()

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    // Установленное приложение на телефоне может неделями не запускаться
    // с нуля. Без периодической проверки оно не узнает о новой сборке:
    // запрос на обновление уходит только при холодном старте.
    if (!registration) return
    setInterval(
      () => {
        void registration.update()
      },
      60 * 60 * 1000,
    )
  },
})
