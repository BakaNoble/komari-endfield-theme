# Komari Endfield Theme

变体：标准（yellow / neutral / standard / contours / standard / calm）  
主视觉：由实际节点生成的状态环、资源读数和编号节点记录。  
页面类型：总览与网络为控制台；节点详情为阅读。

终末地风格的 Komari 监控主题。基于 [endfield-ui-skill](https://github.com/hhikr/endfield-ui-skill) 的设计规范，使用自托管 Saira 宽体字体、灰白底、单一强调色、切角操作控件与机械交互，不包含游戏素材。

## 安装

1. 下载或构建 `release/komari-endfield-1.0.4.zip`。
2. 在 Komari 管理后台的主题管理中上传此 ZIP，应用 **Endfield / 终末地**。
3. 在主题的 **Endfield 外观设置** 中配置概览标题、强调色、默认深浅主题、列表密度、更新间隔和提醒阈值。

ZIP 根目录包含 `komari-theme.json`、`dist/`、预览图和许可证，可直接上传。不要上传 GitHub 的源码压缩包。Komari 的 `/admin` 和 `/terminal` 仍由系统提供。

## 功能

- 总览：节点在线状态、按核心数加权的 CPU、在线节点内存占用、网络速率、硬件总量。
- 节点：真实分组、搜索、状态筛选、按名称 / CPU / 内存 / 下载速率排序。
- 网络：上传和下载速率、累计流量、按节点配置计算的流量额度。
- 详情：CPU / 内存 / 磁盘、1 小时到 3 天历史、网络、持续运行时间、连接数与最后上报时间。
- 外观：浅色、深色、跟随系统；四种强调色；紧凑列表。访客偏好只保存在当前浏览器，可恢复站点默认。
- 断线保留最后数据并显示提示；手动暂停 / 刷新；后台页面暂停轮询；支持键盘焦点和减少动态效果。

## 本地开发

需要 Node.js 22.18+（或 Node.js 24 LTS）。

```sh
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/themes/Endfield/dist/?demo=1` 查看主题预览。**只有显式 `?demo=1` 才会启用示例数据**。正常地址不会在请求失败时显示示例节点。

连接真实服务器：将 `.env.example` 复制为 `.env.local`，配置 `KOMARI_API_TARGET` 并重启开发服务器，然后移除 `?demo=1`。API 与兼容 WebSocket 由 Vite 转发，不需要在前端填写密钥。正式安装后直接访问同源 Komari API。

```sh
npm test
npm run build
npm run package
```

主题标识固定为 `Endfield`，构建资源路径为 `/themes/Endfield/dist/`。如更改标识，同时修改 `komari-theme.json` 与 `vite.config.ts` 中的路径。

## API 与兼容范围

优先使用公开 JSON-RPC：`common:getNodes`、`common:getNodesLatestStatus`、`common:getRecords`；站点配置读取 `/api/public`。方法不可用时兼容 `/api/nodes`、`/api/clients` WebSocket 和 `/api/records/load`。鉴权失败不会切换成演示数据。

动态管理配置需要 Komari 1.0.5+。当前接口按 [官方主题文档](https://komari-document.pages.dev/dev/theme) 与 [API 文档](https://komari-document.pages.dev/dev/api) 实现。未连接到真实实例前，不能声称已验证特定服务器版本的部署兼容性。

主题元数据统一使用字符串（含 `name`、`description` 和 `configuration.name`），兼容将这些字段定义为 Go `string` 的服务端版本。1.0.1 修复了 1.0.0 的多语言对象导致上传时报 `cannot unmarshal object into Go struct field Theme.name of type string` 的问题。打包前及 ZIP 生成后都会检查这些字段的类型。

1.0.2 移除主题界面的说明性文案与配置帮助文本，精简外观设置、首页、空状态和详情提示；保留功能标签、实际监控内容、演示标识与必要的连接状态。

1.0.3 为中间状态环加入鼠标跟随的 3D 偏转。外圈、标题、数字与底部标签按不同深度响应；鼠标移出、窗口失焦或滚动后复位。只在支持鼠标悬停的设备启用，触屏和系统减少动态效果时保持静止。使用逐帧合并更新与 CSS transform，不触发监控数据组件的额外渲染。

1.0.4 增加“动效响应范围”：默认“仅组件”，也可选择“整个页面”。访客在外观设置中切换；管理员可通过主题的 `tilt_scope` 设置默认值。整个页面模式根据完整视口内的鼠标位置计算偏转，仅组件模式沿用圆环自身的响应区域。恢复默认设置会同时清除本机对响应范围的覆盖。

网络趋势图展示本次会话收到的下载速率样本；示例模式使用标注的示例记录。离线节点的当前资源与速率显示为 `—`，累计流量与最后上报时间可以保留。历史曲线取服务器已有记录；缺失值不补零。

## 资源与许可

本主题自有代码使用 MIT。Saira 字体附 SIL OFL 1.1。第三方设计资料与资产归属见 `THIRD_PARTY_NOTICES.md`。中文使用系统黑体，字体、JS、CSS 均无需外部 CDN。
