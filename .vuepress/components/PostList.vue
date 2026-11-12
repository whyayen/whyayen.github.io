<template>
  <div class="blog-list">
    <div v-for="post in postsList" :key="post.path" class="blog-item">
      <RouterLink :to="post.path" class="post-title">
        <template v-if="post.pinned">
          <svg class="post-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <rect x="7" y="3" width="10" height="3" rx="1.5" fill="currentColor" fill-opacity="0.12" />
            <path d="M9 6v5c0 2-3 2-3 5h12c0-3-3-3-3-5V6" fill="currentColor" fill-opacity="0.12" />
            <path d="M12 16v5" />
          </svg>
          <span class="visually-hidden">{{ lang === 'en-US' ? 'Pinned post: ' : '置頂文章：' }}</span>
        </template>
        {{ post.title }}
      </RouterLink>
      <div v-if="post.date || post.category" class="post-meta">
        <time v-if="post.date">{{ post.date.split('T')[0] }}</time>
        <span v-if="post.category" class="post-category">
          <svg class="post-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M3 4h8l10 10-7 7L3 10V4Z" />
            <circle cx="7.5" cy="8" r="1" />
          </svg>
          {{ post.category }}
        </span>
      </div>
      <p class="post-desc" v-if="post.description">{{ post.description }}</p>
    </div>
  </div>
</template>

<script setup>
import { posts } from '@temp/postsData'
import { computed } from 'vue'
import { usePageLang } from '@vuepress/client'

const lang = usePageLang()

// 依據目前頁面的語言過濾文章，並只取前 10 篇
const postsList = computed(() => {
  return posts.filter(post => post.lang === lang.value).slice(0, 10)
})
</script>

<style scoped>
.blog-list {
  margin-top: 2rem;
}
.blog-item {
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--c-border);
}
.post-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  font-size: 0.9rem;
  color: var(--c-text-quote);
  margin-top: 0.3rem;
}
.post-category-icon {
  width: 1em;
  height: 1em;
  margin-inline-end: 0.2em;
  vertical-align: -0.12em;
}
.blog-list .post-title {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--c-text-accent);
  text-decoration: none;
}
.blog-list .post-title:hover {
  text-decoration: none;
}
.post-pin {
  width: 1em;
  height: 1em;
  margin-inline-end: 0.25em;
  vertical-align: -0.1em;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.post-desc {
  margin-top: 0.5rem;
  color: var(--c-text-muted);
  font-size: 0.95rem;
}
</style>
