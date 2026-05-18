import { defineClientConfig } from '@vuepress/client'
import PostList from './components/PostList.vue'
import Layout from './layouts/Layout.vue'

export default defineClientConfig({
  enhance({ app }) {
    app.component('PostList', PostList)
  },
  layouts: {
    Layout,
  },
})
