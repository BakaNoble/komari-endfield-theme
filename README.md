# Komari Endfield Theme

终末地风格的 [Komari](https://github.com/komari-monitor/komari) 监控主题，提供动态仪表、交互地球与多测试点延迟图表，支持明暗主题和手机访问。

![主题预览](preview.png)

## 安装与更新

1. 从 [Releases](https://github.com/BakaNoble/komari-endfield-theme/releases/latest) 下载 `komari-endfield-*.zip`。
2. 在 Komari 后台的主题管理中上传，应用 **Endfield / 终末地**。
3. 在后台配置站点默认外观，或通过页面右上角的设置按钮调整显示。

请下载主题 ZIP；GitHub 自动生成的 **Source code** 压缩包无法直接安装。主题已配置 GitHub 仓库地址，可通过 Komari 后台检查更新。

后台外观配置需要 Komari 1.0.5+。24 小时流量与排名依赖后端 `public:queryMetrics`；若提示不支持，请更新 Komari。

## 页面与功能

| 页面 | 主要内容 |
| --- | --- |
| 总览 | 在线率动态仪表、CPU／内存使用率、实时带宽与主机资源状态 |
| 节点 | 处理器、核心数、系统、内存／磁盘容量、运行时间及到期提醒 |
| 网络 | 交互地球、24 小时上传／下载图表、流量消耗 Top 3、各主机的多测试点延迟曲线 |

- 三页可分别选择列表或卡片，并提供分组、搜索、状态筛选和排序。
- 主机详情提供历史资源曲线、流量信息；网络详情逐测试点展示延迟、丢包和趋势。
- 24 小时流量可切换累计／速率，按上传＋下载消耗排名，包含当前离线但有历史记录的可见主机。
- 点击地区可定位地球并筛选主机，支持拖动、缩放和键盘操作；国旗来自节点的地区字段，地球位置为国家／地区示意。

延迟图表使用 Komari 后台配置的 Ping 任务与记录；无任务或无记录时显示空状态。

## 外观与动效

- 明暗主题、四种强调色、标准／紧凑布局。
- 等宽导航、切角按钮和悬停填充；仪表内部支持鼠标偏转，可选择组件或全页面响应。
- **交互地球** 独立设置页：流量特效开关、发送间隔及单路／多台并发。
- 地球流量动画随机连接在线节点，仅作示意；多台并发时每台主机独立计时。
- 支持系统的“减少动态效果”偏好。

## 本地开发与打包

需要 Node.js 22.18+ 或 24 LTS。

```sh
npm ci
npm run dev
```

演示地址：<http://127.0.0.1:5173/themes/Endfield/dist/?demo=1>。

连接真实实例：将 `.env.example` 复制为 `.env.local`，填写 `KOMARI_API_TARGET`，重启服务并移除 `?demo=1`。

```sh
npm test
npm run package
```

主题 ZIP 和 SHA-256 校验文件生成在 `release/`。

发布时同步更新 `komari-theme.json`、`package.json` 和 `package-lock.json` 的版本号，再推送至 `main`。GitHub Actions 会自动创建 Release；也可在 **Actions → Release theme → Run workflow** 手动运行，已有版本不会覆盖。

## 许可与说明

代码采用 [MIT](LICENSE)。设计基于 [endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill)，字体及第三方资源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

<p align="center">
  <img src="docs/assets/ai-generated.png" width="260" alt="本项目 100% AI 生成，无人工掺杂">
</p>
