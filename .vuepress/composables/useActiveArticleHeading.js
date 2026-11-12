import { onContentUpdated } from '@vuepress/client'
import { onBeforeUnmount, onMounted, ref, toValue } from 'vue'

export function useActiveArticleHeading(headers) {
  const activeSlug = ref(null)
  let headings = []
  let frame = 0
  let resizeObserver

  function update() {
    frame = 0
    if (!headings.length) return

    const navbarBottom = document.querySelector('.vp-navbar')?.getBoundingClientRect().bottom ?? 0
    const readingLine = navbarBottom + 24
    const atBottom = window.scrollY > 0 &&
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    let current = headings[0]

    if (atBottom) {
      current = headings[headings.length - 1]
    } else {
      for (const heading of headings) {
        // The theme pads headings to keep their text below the fixed navbar.
        const textTop = heading.getBoundingClientRect().top +
          Number.parseFloat(getComputedStyle(heading).paddingTop)
        if (textTop > readingLine) break
        current = heading
      }
    }

    activeSlug.value = current.id
  }

  function scheduleUpdate() {
    if (!frame) frame = window.requestAnimationFrame(update)
  }

  function clear() {
    window.cancelAnimationFrame(frame)
    frame = 0
    headings = []
    activeSlug.value = null
    resizeObserver?.disconnect()
  }

  function refresh() {
    const flatten = (items) => items.flatMap(item => [item, ...flatten(item.children)])
    headings = flatten(toValue(headers))
      .map(header => document.getElementById(header.slug))
      .filter(Boolean)

    resizeObserver?.disconnect()
    const content = document.getElementById('content')
    if (content) resizeObserver?.observe(content)
    resizeObserver?.observe(document.documentElement)
    scheduleUpdate()
  }

  onContentUpdated(reason => {
    if (reason === 'beforeUnmount') clear()
    else refresh()
  })

  onMounted(() => {
    resizeObserver = new ResizeObserver(scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    refresh()
  })

  onBeforeUnmount(() => {
    clear()
    window.removeEventListener('scroll', scheduleUpdate)
    window.removeEventListener('resize', scheduleUpdate)
  })

  return activeSlug
}
