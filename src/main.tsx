import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app.tsx'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Не найден #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

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
