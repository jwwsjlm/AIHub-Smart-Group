# AIHub Smart Group

这是一个 Tampermonkey 油猴脚本，用于在 AIHub 的供应商监控页和 API 密钥页
推荐倍率最低且可靠性达标的分组，并把已有 API 密钥切换到该分组；同时在帅API
性能页按模型查看最低倍率和可靠推荐分组。

## 安装

1. 安装 Tampermonkey。
2. 新建脚本，把 [aihub-smart-group.user.js](./aihub-smart-group.user.js) 的
   全部内容粘贴进去并保存。
3. 登录 `https://aihub.top`，打开 `/providers` 或 `/keys`；或登录
   `https://api.shuaiapi.com` 后打开 `/performance`。

脚本只匹配 AIHub 和帅API指定页面，不会向其他站点发送请求。

## 帅API功能

性能页右下角会出现“帅”悬浮按钮。打开后可以选择 24h/7d、具体模型或模型类型，
分别查看“最低倍率”和“可靠推荐”。可靠推荐默认要求成功率至少 99%，并排除页面
标记为不稳定的分组；没有请求数据的分组不会参与推荐。卡片下方可以选择已有密钥和
目标分组，确认后调用帅API原生更新接口切换分组；不会显示或保存完整密钥。
默认还会检查最新时间桶是否有请求，只有历史流量但近期暂无数据的分组不会被推荐。

## Greasy Fork 发布与同步

Greasy Fork 同步源：

`https://raw.githubusercontent.com/jwwsjlm/AIHub-Smart-Group/main/aihub-smart-group.user.js`

GitHub 仓库已配置 Greasy Fork webhook。向 `main` 分支推送新版本后，Greasy Fork 会自动检查并同步脚本。

## 默认规则

- 当前监测状态必须为可用。
- 6 小时可用率至少 `95%`。
- 24 小时可用率至少 `90%`。
- 默认排除带监控警告的分组。
- 按倍率升序排列；同倍率时依次比较 6 小时可用率、24 小时可用率、首 Token 延迟。
- 同一分组连续两次检测胜出后才视为稳定推荐。
- 自动切换默认关闭。
- 自动切换冷却时间默认 10 分钟。

右下角面板中的“设置”可以修改这些参数。候选列表最多显示前五个分组。

## 切换行为

“切换到推荐分组”会调用 AIHub 的现有密钥更新接口，修改选中密钥的分组；
它不会创建新密钥。手动切换前会弹出确认框。开启自动切换时也会先确认，
并且只有在推荐稳定、目标密钥不同且冷却时间结束后才会执行。

## 数据安全

- 完整 API Key 不会显示、保存或写入日志。
- 登录令牌只从当前页面的 `localStorage` 临时读取，用于当前请求，不写入脚本存储。
- 持久化内容只有设置、选中的密钥 ID、最近一次切换的时间和目标分组 ID。

## 故障排查

油猴脚本必须运行在保存 AIHub 登录态的同一个 Chrome 配置中。重新登录后，
请在 Tampermonkey 编辑器中用最新的 `aihub-smart-group.user.js` 覆盖旧脚本，
保存并刷新 `https://aihub.top/keys`。

新版面板会区分三种情况：

- `未找到页面登录令牌`：当前 Chrome 配置没有 `auth_token`，需要在该配置重新登录。
- `密钥接口返回 401`：登录令牌已过期，需要重新登录。
- `密钥读取失败`：接口或网络错误，会附带 HTTP 错误信息。

脚本只临时读取页面令牌用于请求，不会保存、展示完整令牌或 API Key。

## 本地验证

```powershell
node --test tests/aihub-smart-group.test.cjs
node --check aihub-smart-group.user.js
```

验证时默认不会修改密钥分组；需要实际切换时使用面板按钮并确认提示。
