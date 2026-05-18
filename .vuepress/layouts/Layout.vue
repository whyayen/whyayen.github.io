<script setup>
import ParentLayout from '@vuepress/theme-default/layouts/Layout.vue'
import { usePageFrontmatter } from '@vuepress/client'

const frontmatter = usePageFrontmatter()
</script>

<template>
  <ParentLayout>
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
</style>
