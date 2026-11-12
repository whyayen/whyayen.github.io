<script setup>
import { RouteLink } from '@vuepress/client'
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useActiveArticleHeading } from '../composables/useActiveArticleHeading.js'

const props = defineProps({
  headers: { type: Array, required: true },
  lang: { type: String, default: 'zh-TW' },
})
const title = computed(() => props.lang.startsWith('en') ? 'On this page' : '本頁目錄')
const expanded = ref(false)
const toggleButton = ref(null)
const navigation = ref(null)
const navigationId = `article-toc-${useId()}`
const activeSlug = useActiveArticleHeading(() => props.headers)
let desktopMedia

function resetOnResize() {
  expanded.value = false
  if (!desktopMedia.matches && navigation.value?.contains(document.activeElement)) {
    toggleButton.value?.focus({ preventScroll: true })
  }
}

function onNavigate(event) {
  // RouteLink prevents the default only for an ordinary in-page navigation.
  if (expanded.value && event.defaultPrevented) {
    expanded.value = false
    toggleButton.value?.focus({ preventScroll: true })
  }
}

onMounted(() => {
  desktopMedia = window.matchMedia('(min-width: 72rem)')
  desktopMedia.addEventListener('change', resetOnResize)
})

onBeforeUnmount(() => {
  desktopMedia?.removeEventListener('change', resetOnResize)
})
</script>

<template>
  <aside class="article-toc" :class="{ 'is-expanded': expanded }">
    <button
      ref="toggleButton"
      class="article-toc-toggle"
      type="button"
      :aria-expanded="expanded"
      :aria-controls="navigationId"
      @click="expanded = !expanded"
    >
      {{ title }}
      <span class="article-toc-chevron" aria-hidden="true" />
    </button>
    <nav
      :id="navigationId"
      ref="navigation"
      class="article-toc-nav"
      :aria-label="title"
      @click="onNavigate"
    >
      <p class="article-toc-title">{{ title }}</p>
      <ul class="article-toc-list">
        <li
          v-for="header in headers"
          :key="header.slug"
          :class="{ 'article-toc-subheading': header.level === 3 }"
        >
          <RouteLink
            :to="`#${encodeURIComponent(header.slug)}`"
            :aria-current="activeSlug === header.slug ? 'location' : undefined"
          >{{ header.title }}</RouteLink>
          <ul v-if="header.children.length">
            <li v-for="child in header.children" :key="child.slug">
              <RouteLink
                :to="`#${encodeURIComponent(child.slug)}`"
                :aria-current="activeSlug === child.slug ? 'location' : undefined"
              >{{ child.title }}</RouteLink>
            </li>
          </ul>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.article-toc {
  box-sizing: border-box;
  max-width: calc(var(--content-width) + 5rem);
  margin-inline: auto;
  padding: 1.5rem 2.5rem;
  font-size: 0.875rem;
  line-height: 1.6;
}

.article-toc-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.5rem;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.article-toc-chevron {
  width: 0.4rem;
  height: 0.4rem;
  flex-shrink: 0;
  border-inline-end: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-0.15rem) rotate(45deg);
}

.is-expanded .article-toc-chevron {
  transform: translateY(0.15rem) rotate(225deg);
}

.article-toc-nav {
  display: none;
  box-sizing: border-box;
  max-height: min(50vh, 24rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-top: 0.75rem;
  padding-inline: 1rem 0.5rem;
  border-inline-start: 1px solid var(--vp-c-divider);
  scrollbar-width: thin;
}

.is-expanded .article-toc-nav {
  display: block;
}

.article-toc-title {
  display: none;
  margin: 0 0 0.75rem;
  color: var(--vp-c-text);
  font-weight: 600;
}

.article-toc-list,
.article-toc-list ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.article-toc-list ul,
.article-toc-subheading {
  padding-inline-start: 1rem;
}

.article-toc-list a {
  display: block;
  padding-block: 0.3rem;
  color: var(--vp-c-text-mute);
  overflow-wrap: anywhere;
}

.article-toc-list a:hover {
  color: var(--vp-c-accent);
}

.article-toc-list a[aria-current='location'] {
  color: var(--vp-c-accent);
  font-weight: 600;
  border-radius: 0.25rem;
}

.article-toc-list a:focus-visible,
.article-toc-toggle:focus-visible {
  outline: 2px solid var(--vp-c-accent);
  outline-offset: -2px;
  border-radius: 2px;
}

@media (max-width: 959px) {
  .article-toc {
    padding-inline: 2rem;
  }
}

@media (max-width: 419px) {
  .article-toc {
    padding-inline: 1.5rem;
  }
}

@media screen and (min-width: 72rem) {
  .article-toc {
    display: block;
    grid-column: 2;
    grid-row: 1 / span 3;
    min-width: 0;
    margin: 0;
    padding: 2rem 0 0;
  }

  .article-toc-toggle {
    display: none;
  }

  .article-toc-nav {
    display: block;
    position: sticky;
    top: calc(var(--navbar-height) + 2rem);
    max-height: calc(100vh - var(--navbar-height) - 4rem);
    margin-top: 0;
  }

  .article-toc-title {
    display: block;
  }
}

@media print {
  .article-toc {
    display: none;
  }
}
</style>
