import { useEffect, useState } from 'react'

/** С какого расстояния до края страницы кнопка имеет смысл. */
const MARGIN = 240

/**
 * Кнопки «в начало» и «в конец» (Р-55).
 *
 * Экраны длинные — циклы по категориям, лента за год, — а то, что нужно
 * редко, стоит внизу. Кнопка появляется, только когда до края страницы
 * есть куда ехать: на коротком экране их нет вовсе.
 *
 * Высота страницы меняется без прокрутки — развернули блок, приехали
 * записи с другого устройства, — поэтому следим и за размером страницы,
 * а не только за прокруткой.
 */
export function ScrollButtons() {
  const [room, setRoom] = useState({ up: false, down: false })

  useEffect(() => {
    function update() {
      const below = document.documentElement.scrollHeight - window.innerHeight - window.scrollY
      setRoom({ up: window.scrollY > MARGIN, down: below > MARGIN })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(document.body)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [])

  if (!room.up && !room.down) return null

  return (
    <div className="scroll-btns no-print">
      {room.up && (
        <button
          type="button"
          className="scroll-btn"
          aria-label="В начало"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}
      {room.down && (
        <button
          type="button"
          className="scroll-btn"
          aria-label="В конец"
          onClick={() =>
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
          }
        >
          ↓
        </button>
      )}
    </div>
  )
}
