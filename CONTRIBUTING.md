# 贡献指南

[English](./CONTRIBUTING.en.md)

感谢你帮助完善 `openobserve-mcp`。

## 适合优先贡献的方向

- 新增有边界的排障 Tool
- 完善 README 或 AI 使用文档
- 加强参数校验、查询限制和脱敏逻辑
- 优化 MCP Client 看到的错误信息
- 补充更完整的客户端接入示例

## 开发环境准备

1. 安装依赖

```bash
npm install
```

2. 创建本地配置文件

```bash
cp .env.example .env
```

3. 启动开发模式

```bash
npm run dev
```

## 项目结构

- `src/index.js`：MCP Server 启动入口
- `src/config.js`：环境变量加载与运行限制
- `src/openobserve-client.js`：OpenObserve HTTP 封装
- `src/tools.js`：MCP Tools 注册
- `src/sql.js`：SQL 构造辅助函数
- `src/time.js`：时间范围辅助函数
- `src/sanitize.js`：敏感字段脱敏逻辑

## 贡献约定

- 除非项目方向明确调整，否则默认保持只读工具
- 保留现有“有边界查询”的设计思路
- 优先选择安全默认值，而不是无限制灵活性
- 新增 Tool 时，要考虑 AI Client 是否容易正确使用
- 只要用户可见行为发生变化，就同步更新 README 和 AI 文档

## 新增 Tool 时建议遵循

1. 定义清晰的输入 Schema，并设置合理上限
2. 需要时间范围的工具必须限制查询窗口
3. 对返回结果先做脱敏，再暴露给 MCP Client
4. 返回结构应便于 AI 总结，而不只是原始数据转发
5. 同步更新 `README.md`，必要时更新 `AI_USAGE.md`

## Pull Request 建议

尽量保持 PR 小而聚焦，便于评审。

一个更容易合并的 PR 通常会包含：

- 要解决的问题是什么
- 行为改动是什么
- 是否引入了新的环境变量或限制项
- 如果用户可见行为变化，是否同步更新了文档

## 提 Issue 时建议附带

- 你使用的 MCP Client
- Node.js 版本
- 出问题的 Tool 名称
- 已脱敏的错误信息
- 当前使用的用户名

## 发布说明

如果某次改动影响安装、配置或 Tool 行为，请在同一个 PR 里把相关文档一起更新。
