import { defineClientConfig } from '@vuepress/client'
import PostList from './components/PostList.vue'
import Layout from './layouts/Layout.vue'
import './styles/index.css'

export default defineClientConfig({
  enhance({ app }) {
    app.component('PostList', PostList)
  },
  layouts: {
    Layout,
  },
})
