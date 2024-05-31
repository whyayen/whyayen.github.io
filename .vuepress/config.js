module.exports = {
  "title": "Gin's Blog",
  "description": "紀錄一些關於工作或開發上遇到的問題",
  "dest": "public",
  "head": [
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
  "theme": "reco",
  "themeConfig": {
    "noFoundPageByTencent": false,
    "nav": [
      {
        "text": "Home",
        "link": "/",
        "icon": "reco-home"
      },
      {
        "text": "TimeLine",
        "link": "/timeline/",
        "icon": "reco-date"
      },
      {
        "text": "RSS",
        "link": "https://whyayen.github.io/rss.xml",
        "icon": "reco-rss"
      },
      {
        "text": "Contact",
        "icon": "reco-message",
        "items": [
          {
            "text": "GitHub",
            "link": "https://github.com/whyayen",
            "icon": "reco-github"
          },
          {
            "text": "Medium",
            "link": "https://medium.com/@wannabearapper",
            "icon": "reco-blog"
          }
        ]
      }
    ],
    "type": "blog",
    "blogConfig": {
      "category": {
        "location": 2,
        "text": "Category"
      },
      "tag": {
        "location": 3,
        "text": "Tag"
      }
    },
    "search": true,
    "searchMaxSuggestions": 10,
    "lastUpdated": "Last Updated",
    "author": "Gin",
    "startYear": "2020"
  },
  "markdown": {
    "lineNumbers": true
  },
  "plugins": [
    [
      "@vuepress-reco/vuepress-plugin-rss",
      {
        "site_url": "https://whyayen.github.io" 
      }
    ],
    [
      "sitemap",
      {
        "hostname": "https://whyayen.github.io"
      }
    ],
    [
      "vuepress-plugin-google-tag-manager",
      {
        "gtm": "GTM-NXX4FQ7"
      }
    ]
  ]
}
