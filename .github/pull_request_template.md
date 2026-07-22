## 修改内容

<!-- 请说明修改了哪些功能或文件。 -->

## 修改原因

<!-- 请说明要解决的问题、使用场景或关联 Issue。 -->

## 验证方式

<!-- 请列出执行过的命令和手动验证步骤。 -->

- [ ] `node scripts/check-repository.cjs`
- [ ] `node --check aihub-smart-group.user.js`
- [ ] `node --test tests/*.test.cjs`
- [ ] `npx --yes eslint@9.39.2 aihub-smart-group.user.js scripts/check-repository.cjs tests/*.test.cjs`

## 检查清单

- [ ] 没有提交 API Key、Cookie、Token、真实使用记录或其他隐私数据
- [ ] 行为变更已增加或更新测试
- [ ] 用户可见的功能或设置变更已更新 README
- [ ] 发布脚本变更时，`@version`、`SCRIPT_VERSION` 和 README 版本保持一致
