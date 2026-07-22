# AIHub 智能分组

一个用于 AIHub 的 Tampermonkey 油猴脚本。它会读取供应商监控数据，按价格、首 Token 速度和可用率推荐分组，并可把已有 API 密钥切换到推荐分组。

脚本不会显示或保存完整 API Key。

## 支持页面

| 页面 | 功能 |
| --- | --- |
| `https://aihub.top/providers` | 读取供应商监控并推荐分组 |
| `https://aihub.top/keys` | 选择密钥、手动切换或开启自动切换 |

脚本只匹配这两个 AIHub 页面，不会在其他网站运行。

## 安装

### Greasy Fork 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 Greasy Fork 上的脚本页面并点击安装。
3. 登录 AIHub，打开 `/providers` 或 `/keys`。

### GitHub 手动安装

1. 安装 Tampermonkey。
2. 打开 [aihub-smart-group.user.js](./aihub-smart-group.user.js)。
3. 复制全部内容，在 Tampermonkey 中新建脚本，粘贴并保存。
4. 登录 AIHub 后刷新页面。

## 第一次使用

1. 打开 `https://aihub.top/keys`。
2. 选择价格、平衡或速度模式。
3. 在“目标密钥”中选择要管理的密钥。
4. 点击“检测”。
5. 等推荐连续通过检测后，点击“切换到推荐分组”并确认。

自动切换默认关闭。打开前会弹出确认；打开后，只有推荐稳定、目标密钥不在推荐分组且冷却时间结束时才会切换。

## 三种模式

| 模式 | 选择规则 | 适合场景 |
| --- | --- | --- |
| 价格 | 选择价格倍率最低的可用分组 | 预算优先 |
| 平衡 | 在最低价上浮指定百分比的范围内，选择首 Token 最快的分组 | 兼顾价格和速度 |
| 速度 | 选择首 Token 最快的可靠分组 | 响应速度优先 |

平衡模式的价格范围默认是 `20%`，可以在设置中修改。所选模式会同时影响推荐卡片、手动切换和自动切换目标。

## 设置与保存

面板可以调整：

- 6h 和 24h 最低可用率
- 连续通过次数
- 检测间隔
- 自动切换冷却时间
- 平衡模式价格范围
- 是否排除监控警告
- 是否开启自动切换

点击“保存设置”后，配置会写入当前浏览器的 Tampermonkey 存储。模式、目标密钥和最近一次切换记录也会保存。

## 默认推荐规则

- 当前监测状态必须可用。
- 6h 可用率至少 `95%`。
- 24h 可用率至少 `90%`。
- 默认排除带监控警告的分组。
- 推荐连续通过默认 `2` 次检测后才视为稳定。
- 自动切换默认关闭，默认冷却时间为 `10` 分钟。

价格模式按倍率升序排列；倍率相同时依次比较 6h 可用率、24h 可用率和首 Token 延迟。

## 使用日志

面板中的“使用日志”会记录：

- 首次检测、手动检测及推荐结果变化
- 密钥读取或监控检测失败，以及恢复状态
- 模式或设置变化
- 自动切换开关变化
- 手动或自动切换结果
- 自动切换跳过原因（状态变化时记录一次）
- 请求失败和切换失败

最多保存最近 100 条，可以随时清空。日志只保存时间、动作、分组名和错误摘要，不保存完整 API Key、登录令牌或请求正文。

## 切换与安全

- 手动切换前会弹出确认框。
- 自动切换只修改已选密钥的分组，不创建新密钥。
- 登录令牌只从当前 AIHub 页面临时读取，用于当前请求。
- 完整 API Key 和登录令牌不会写入日志或脚本存储。

## 常见问题

### 面板没有出现

确认当前网址是 `aihub.top/providers` 或 `aihub.top/keys`，并在 Tampermonkey 中启用了脚本。更新脚本后刷新页面；如果旧面板仍在，检查是否重复安装了旧脚本。

### 显示“未找到页面登录令牌”

请在保存登录状态的同一个 Chrome 配置中重新登录 AIHub，然后刷新 `/keys` 页面。

### 显示“密钥接口返回 401”

当前登录已经失效。重新登录后点击“检测”。

### 没有推荐分组

检查 6h/24h 最低可用率和“排除监控警告”设置。也可以展开使用日志查看检测结果或错误摘要。

### 切换按钮是灰色

常见原因包括：尚未选择目标密钥、推荐没有连续通过规定次数、当前密钥已经在推荐分组，或者检测仍在进行。把鼠标移到按钮上可以查看具体原因。

## Greasy Fork 同步

GitHub 仓库：[jwwsjlm/AIHub-Smart-Group](https://github.com/jwwsjlm/AIHub-Smart-Group)

Greasy Fork 同步源：

`https://raw.githubusercontent.com/jwwsjlm/AIHub-Smart-Group/main/aihub-smart-group.user.js`

仓库已配置 Greasy Fork webhook。向 `main` 分支推送新版本后，Greasy Fork 会自动检查并同步脚本。

## 本地验证

```powershell
node --check aihub-smart-group.user.js
node --test tests/aihub-smart-group.test.cjs
npx --yes eslint@9.39.2 aihub-smart-group.user.js
```

当前版本：`0.3.2`
