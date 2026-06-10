一些語法：

:::info
Test
:::


KaTex：
$$xxx$$

Tab Block：
::: tabs

@tab 标题 1

<!-- tab 1 内容 -->

@tab 标题 2

<!-- tab 2 内容 -->

<!-- 👇 tab 3 将会被默认激活 -->

@tab:active 标题 3

<!-- tab 3 内容 -->

:::

檔案目錄結構：
::: file-tree

- docs
  - .vuepress
    - ++ config.ts
  - -- page1.md
  - README.md
- theme # 一个 **主题** 目录
  - client
    - components
      - **Navbar.vue**
    - composables
      - useNavbar.ts
    - styles
      - navbar.css
    - config.ts
  - node/
- package.json
- pnpm-lock.yaml
- .gitignore
- README.md
- …
  :::

程式碼一些 highlight 的方式：
```ts
console.log('未高亮')
console.log('高亮') // [!code highlight]
console.log('未高亮')
```

```ts
console.log('未聚焦')
console.log('聚焦') // [!code focus]
console.log('未聚焦')
```

```ts
console.log('拟好') // [!code --]
console.log('你好') // [!code ++]
console.log('再见')
```

```ts
console.log('无警告或错误')
console.warn('警告') // [!code warning]
console.error('错误') // [!code error]
```

程式碼顯示收摺：
```go :collapsed-lines=5
1
2
3
4
5
這行不會顯示
```

```go :no-collapsed-lines
不折疊，有多少顯示多少
```