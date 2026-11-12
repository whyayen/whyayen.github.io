<script setup>
import ParentLayout from '@vuepress/theme-default/layouts/Layout.vue'
import { usePageData, usePageFrontmatter } from '@vuepress/client'
import { computed } from 'vue'
import ArticleToc from '../components/ArticleToc.vue'

const frontmatter = usePageFrontmatter()
const page = usePageData()
const isArticle = computed(() => Array.isArray(page.value.articleHeaders))
const headers = computed(() => page.value.articleHeaders ?? [])
</script>

<template>
  <ParentLayout :class="{ 'article-layout': isArticle, 'has-toc': headers.length > 0 }">
    <template #page-top>
      <ArticleToc v-if="headers.length" :headers="headers" :lang="page.lang" />
    </template>
    <template #page-content-top>
      <header v-if="frontmatter.title && !frontmatter.home" class="custom-page-header">
        <h1 class="custom-post-title">{{ frontmatter.title }}</h1>
        <div v-if="frontmatter.date" class="custom-post-date">
          {{ new Date(frontmatter.date).toLocaleDateString('zh-TW') }}
        </div>
        <hr class="custom-divider" />
      </header>
    </template>
  </ParentLayout>
</template>

<style scoped>
.custom-page-header {
  padding-bottom: 1rem;
}

.custom-post-title {
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.custom-post-date {
  color: var(--c-text-quote);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.custom-divider {
  border: 0;
  border-top: 1px solid var(--c-border);
}

@media screen and (min-width: 72rem) {
  .article-layout.has-toc :deep(.vp-page) {
    display: grid;
    grid-template-columns: minmax(0, calc(var(--content-width) + 5rem)) 14rem;
    column-gap: 2rem;
    justify-content: center;
    padding-inline: 2rem;
  }

  .article-layout.has-toc :deep(.vp-page > [vp-content]),
  .article-layout.has-toc :deep(.vp-page > .vp-page-meta),
  .article-layout.has-toc :deep(.vp-page > .vp-page-nav) {
    grid-column: 1;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: none;
  }
}
</style>

<style>
@media (prefers-reduced-motion: reduce) {
  html:has(.article-layout) {
    scroll-behavior: auto;
  }
}
</style>
