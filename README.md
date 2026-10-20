# Komari Endfield Theme

终末地风格的 Komari 监控主题：黑白工业面板、分层状态环与亮黄交互。

<p align="center">
  <img src="docs/assets/ai-generated.png" width="300" alt="本项目 100% AI 生成，无人工掺杂">
</p>

## 预览

![主题预览](preview.png)

## 安装与更新

1. 从 [Releases](https://github.com/BakaNoble/komari-endfield-theme/releases/latest) 下载 `komari-endfield-*.zip`。
2. 在 Komari 后台上传主题包，应用 **Endfield / 终末地**。
3. 在 **Endfield 外观设置** 中调整主题、强调色、列表密度和动效范围。

请下载主题 ZIP，GitHub 自动生成的 **Source code** 压缩包无法直接安装。后台外观配置需要 Komari 1.0.5+。

主题已配置 GitHub 仓库地址，后续可通过 Komari 后台的“更新”获取最新版本。

## 功能

- 节点状态、CPU / 内存 / 磁盘、网络速率与流量统计。
- 分组、搜索、筛选、排序，以及节点详情和历史曲线。
- 深浅主题、四种强调色、紧凑列表，适配手机和桌面。
- 圆环鼠标跟随偏转，可选择“仅组件”或“整个页面”；支持减少动态效果。

## 本地开发

需要 Node.js 22.18+ 或 24 LTS。

```sh
npm ci
npm run dev
```

演示地址：`http://127.0.0.1:5173/themes/Endfield/dist/?demo=1`。

连接真实实例：将 `.env.example` 复制为 `.env.local`，填写 `KOMARI_API_TARGET`，重启开发服务并移除 `?demo=1`。

## 打包与发布

```sh
npm test
npm run package
```

安装包和 SHA-256 校验文件生成在 `release/`。

同步更新 `komari-theme.json`、`package.json` 和 `package-lock.json` 的版本号并推送到 `main`，GitHub Actions 会自动打包并发布。也可在 **Actions → Release theme → Run workflow** 手动运行；已有版本不会覆盖。

## 许可

代码采用 [MIT](LICENSE)。设计基于 [endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill)，字体及第三方资源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
