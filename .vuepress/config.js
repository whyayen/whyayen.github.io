import { viteBundler } from '@vuepress/bundler-vite'
import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress'
import { googleAnalyticsPlugin } from '@vuepress/plugin-google-analytics'

export default defineUserConfig({
  bundler: viteBundler(),
  locales: {
    '/': {
      lang: 'zh-TW',
      title: 'Gin\'s Blog',
      description: 'Gin 的部落格',
    },
    '/en/': {
      lang: 'en-US',
      title: 'Gin\'s Blog',
      description: 'Gin\'s Blog',
    },
  },
  dest: 'public',
  head: [
    [
      "meta",
      {
        "name": "viewport",
        "content": "width=device-width,initial-scale=1,user-scalable=no"
      }
    ],
    [
      "meta",
      {
        "name": "google-site-verification",
        "content": "kWqBrWikTRDwDaEFKmjuwuEqG9EUmtlb-9UMUWvuWGo"
      }
      ]
    ],
    theme: defaultTheme({
      repo: 'whyayen/whyayen.github.io',
      repoLabel: 'GitHub',
      locales: {
        '/': {
          selectLanguageName: '中文',
          selectLanguageText: '語言',
          navbar: [
            { text: '首頁', link: '/' },
          ],
        },
        '/en/': {
          selectLanguageName: 'English',
          selectLanguageText: 'Languages',
          navbar: [
            { text: 'Home', link: '/en/' },
          ],
        },
      },
      sidebar: 'auto',
    }),
  plugins: [
    googleAnalyticsPlugin({
      id: 'GTM-NXX4FQ7',
    }),
    {
      name: 'aggregate-posts',
      onPrepared: async (app) => {
        const posts = app.pages
          .filter(page => page.path.includes('/posts/') && page.path.endsWith('.html'))
          .map(page => ({
            title: page.title,
            path: page.path,
            date: page.frontmatter.date || '',
            description: page.frontmatter.description || '',
            lang: page.lang
          }))
          .sort((a, b) => {
            const dateA = new Date(a.date || 0)
            const dateB = new Date(b.date || 0)
            return dateB - dateA
          })

        await app.writeTemp('postsData.js', `export const posts = ${JSON.stringify(posts)}`)
      }
    }
  ]
})