# 内容维护：电脑与手机

内容文件：`src/content/site.json`。网页图片放在 `public/media/`；勿上传私人照片、未经授权的视频、原始大文件和凭证。

## 成员

每位成员都有固定 `id`。填写 `name`（真实姓名）、`nameEn`（确认过的英文显示名或拼音）、`role.zh`、`role.en`。`order` 决定展示顺序。核对完成后把 `status` 改为 `published`。未确认记录在设计预览中只显示“成员 01”等编号。

## 档案

在 `archive` 数组中添加对象。`id` 使用不重复的小写英文字母、数字与短横线。必须有 `images`、`text` 或已获许可的 `video` 中至少一项。`title`、`date`、`tags`、`order` 可省略；`detail: true` 才生成独立详情页。`status: draft` 不出现在网页中，但公开仓库中的草稿依然是公开数据。

```json
{
  "id": "a-shared-day",
  "status": "draft",
  "order": 1,
  "detail": false,
  "images": [{
    "src": "/media/your-approved-photo.webp",
    "width": 1600,
    "height": 1067,
    "alt": {"zh": "准确描述实际照片", "en": "An accurate description of the actual photograph"},
    "rightsConfirmed": true
  }]
}
```

只在确认权利后填写 `rightsConfirmed: true`。`width`、`height` 是图片真实像素尺寸。可选的 `caption`、`title`、`text` 使用 `{ "zh": "中文", "en": "已审核英文" }`。图片不强制滤镜；保留原件，另外生成 WebP/AVIF 网页版本。

视频只接入独立 HTTPS 视频地址，例：`video: { "src": "https://…/approved.mp4", "type": "video/mp4", "rightsConfirmed": true }`。不要把大视频放入 Git。原有翻唱排练视频在公开权利未核实前不得接入。

## GitHub 电脑操作

1. 打开以后建立的公开仓库，切换或创建 `content/描述` 工作分支。
2. 上传有公开许可的网页图片到 `public/media/`。
3. 打开 `src/content/site.json`，点击铅笔，修改相应字段。
4. 提交到工作分支，创建 Pull Request，等待 Verify website 检查。
5. 打开托管平台生成的该 PR 预览，检查中文、英文与手机布局。
6. 人工确认后合并到 `main`。正式构建须使用 `pnpm build:release`。

## GitHub 手机操作

使用手机浏览器访问 GitHub 仓库，必要时切换“桌面版网站”。先切换工作分支，再用文件页面的铅笔修改 JSON；上传图片可使用 Add file → Upload files。提交到工作分支，然后从 Pull requests 创建或查看 PR。手机界面操作不便时可用 GitHub 网页编辑器；不要直接改正式分支。手机实机编辑流程尚待账户和仓库建立后验收。

## 文案审核

`approvals` 中的四项分别表示中文、英文、成员、媒体的正式人工确认。只在相应审核完成后改为 `true`。四项全部确认、六位成员资料齐全并且至少有一张正式照片时，`pnpm build:release` 才允许通过。当前英文是设计提案，未视作已经人工审核。

## CMS

首版提供 GitHub 后备编辑流程。Pages CMS 尚未验证、尚未连接，不作为已经交付的功能宣称。接入前需确认它只请求目标仓库必要权限，并验证分支、预览、审核与回退流程。
