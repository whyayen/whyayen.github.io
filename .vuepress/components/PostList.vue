<template>
  <div class="blog-list">
    <div v-for="post in postsList" :key="post.path" class="blog-item">
      <span class="post-date" v-if="post.date">{{ post.date.split('T')[0] }}</span>
      <RouterLink :to="post.path" class="post-title">
        {{ post.title }}
      </RouterLink>
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
.post-date {
  display: block;
  font-size: 0.9rem;
  color: var(--c-text-quote);
  margin-bottom: 0.3rem;
}
.post-title {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--c-text-accent);
  text-decoration: none;
}
.post-title:hover {
  text-decoration: underline;
}
.post-desc {
  margin-top: 0.5rem;
  color: var(--c-text-muted);
  font-size: 0.95rem;
}
</style>
