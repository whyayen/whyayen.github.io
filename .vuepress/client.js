import { defineClientConfig } from '@vuepress/client'
import PostList from './components/PostList.vue'

export default defineClientConfig({
  enhance({ app }) {
    app.component('PostList', PostList)
  },
})
