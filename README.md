# OpenObserve MCP

这是一个面向 OpenObserve 排障场景的本地 `stdio` MCP Server。它不是把 Swagger/OpenAPI 机械暴露给 AI，而是把常用观测能力分成两层：

- 基础查询 tools：让 AI 能先摸清 stream、schema、字段值和原始日志
- 分析排障 tools：让 AI 能直接做错误聚合、trace 汇总和日志 / trace 关联分析

## 当前已实现的 Tools

- `get_stream_settings`
- `get_stream_schema`
- `search_values`
- `search_logs`
- `search_sql`
- `top_errors`
- `list_streams`
- `get_log_context`
- `find_slow_requests`
- `get_trace_summary`
- `get_trace_detail`
- `correlate_logs_and_traces`

这些工具都默认做了几件事：

- 限制最大查询时间范围，避免大范围扫库
- 限制最大返回条数，避免一次拿太多原始日志
- 支持通过环境变量配置默认日志流和 trace 流
- 对常见敏感字段做递归脱敏

## 环境准备

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板并填写

```bash
copy .env.example .env
```

最少需要这些变量：

- `OPENOBSERVE_BASE_URL`
- `OPENOBSERVE_ORG_ID`
- `OPENOBSERVE_AUTH_TOKEN`

如果你不想直接放 token，也可以改用：

- `OPENOBSERVE_USERNAME`
- `OPENOBSERVE_PASSWORD`

说明：

- `OPENOBSERVE_AUTH_TOKEN` 直接填写完整 `Authorization` 头的值，例如 `Basic xxx` 或 `Bearer xxx`
- 目前默认最大查询时间范围是 `24` 小时
- 默认查询时间窗口：
  `search_logs`、`top_errors`、`find_slow_requests` 是最近 `30` 分钟；
  `get_trace_summary`、`search_values`、`correlate_logs_and_traces` 是最近 `60` 分钟

## 本地 API 文档

项目根目录下保留了一份本地 OpenAPI 文档：

- `openapi.json`
- `AI_USAGE.md`
- `AI_SYSTEM_PROMPT.zh-CN.md`

其中：

- `openapi.json` 来自你的 OpenObserve 实例，可以作为后续补 MCP tools 时的本地参考
- `AI_USAGE.md` 是给 AI / MCP Client 用的简明使用指南，说明先用哪些工具、如何快速收敛问题
- `AI_SYSTEM_PROMPT.zh-CN.md` 是可直接复制到客户端系统提示词里的中文版本

## 本地启动

```bash
npm start
```

如果进程正常启动，它会等待 MCP Client 通过 `stdio` 连接。

## 直接给别人用

如果你把这个包发布到 npm，别人可以不 clone 仓库，直接通过 `npx` 使用。

客户端配置可以写成这样：

```json
{
  "mcpServers": {
    "openobserve": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@jokezc/openobserve-mcp"
      ],
      "env": {
        "OPENOBSERVE_BASE_URL": "http://192.168.1.54:5080",
        "OPENOBSERVE_ORG_ID": "default",
        "OPENOBSERVE_AUTH_TOKEN": "Basic xxx",
        "OPENOBSERVE_DEFAULT_LOG_STREAM": "your_log_stream",
        "OPENOBSERVE_DEFAULT_TRACE_STREAM": "your_trace_stream"
      }
    }
  }
}
```

## 本地仓库方式接入

如果还没发 npm，也可以先让别人 clone 仓库后本地接入。

## Cherry Studio / Studio 接入

可执行命令：

```bash
node C:\sourceCode\nodejs\openobserve-mcp\src\index.js
```

工作目录：

```text
C:\sourceCode\nodejs\openobserve-mcp
```

环境变量：

- `OPENOBSERVE_BASE_URL=http://192.168.1.54:5080`
- `OPENOBSERVE_ORG_ID=你的组织ID`
- `OPENOBSERVE_AUTH_TOKEN=你的Authorization头`

如果你在客户端配置 JSON，大致会是这样：

```json
{
  "mcpServers": {
    "openobserve": {
      "command": "node",
      "args": [
        "C:\\sourceCode\\nodejs\\openobserve-mcp\\src\\index.js"
      ],
      "cwd": "C:\\sourceCode\\nodejs\\openobserve-mcp",
      "env": {
        "OPENOBSERVE_BASE_URL": "http://192.168.1.54:5080",
        "OPENOBSERVE_ORG_ID": "default",
        "OPENOBSERVE_AUTH_TOKEN": "Basic xxx"
      }
    }
  }
}
```

## 发布到 npm

发布前至少确认：

1. 已登录 npm：

```bash
npm login
```

2. 当前推荐直接使用 scoped 包名：`@jokezc/openobserve-mcp`

3. 发布：

```bash
npm publish --access public
```

发布完成后，别人就可以直接用 `npx -y @jokezc/openobserve-mcp` 接入。

## Tool 设计说明

### `get_stream_settings`

适合：

- 查看单个 stream 的统计信息、settings、可用于查询的关键字段
- 让 AI 知道哪些字段适合过滤、全文检索、distinct values
- 在正式检索前先了解 stream 的查询特征

### `get_stream_schema`

适合：

- 先看某个日志流 / trace 流有哪些字段
- 让 AI 自动识别 `trace_id`、`span_id`、`service_name`、消息字段
- 排查某个 stream 到底有哪些可用维度

### `search_values`

适合：

- 先枚举 `service_name`、`level`、`status_code` 等字段的候选值
- 不知道精确过滤条件时，先摸清最近一段时间有哪些值
- 给 AI 提供更稳的字段探索能力

### `search_logs`

适合：

- 查最近 30 分钟某服务错误日志
- 按关键字检索日志
- 用结构化字段进一步过滤

### `search_sql`

适合：

- 现有通用 tools 不够用时执行自定义只读 SQL
- 做更灵活的聚合、过滤、排序和分页
- 作为 AI 自主探索时的兜底通用查询能力

### `find_slow_requests`

适合：

- 查慢 trace
- 看最近一段时间最慢请求

### `get_trace_summary`

适合：

- 根据 `traceId` 拿 DAG
- 汇总 span、服务和根操作

### `get_trace_detail`

适合：

- 在 `get_trace_summary` 之后继续下钻
- 需要完整 DAG 节点和边时直接取详细 trace 数据
- 让 AI 自己做更细的 trace 判断

### `correlate_logs_and_traces`

适合：

- 已知 `traceId` 后，自动回捞相关日志
- 让 AI 沿着 `trace_id`、`span_id`、`service_name` 三类线索一起找证据
- 从慢 trace 快速收敛到具体报错日志

### `get_log_context`

适合：

- 已知某条日志 `_timestamp` 后，向前向后拉上下文

### `list_streams`

适合：

- 先摸清组织里有哪些日志流 / trace 流

### `top_errors`

适合：

- 需要在较大时间窗口里做错误聚合时使用
- 适合 broad scan，不是定点排查的第一入口

## 后续升级到 HTTP MCP

这版先走 `stdio`，因为本地联调最快。后续升级为团队共享版时，建议这样改：

1. 保留 `src/openobserve-client.js` 和 `src/tools.js` 不动
2. 新增一个 `streamable HTTP` 入口文件
3. 把鉴权、网关、反向代理、审计日志放到 HTTP 层处理
4. 如果要团队复用，再补白名单 stream、按 tool 的权限控制、结果审计

也就是说，业务能力层已经拆出来了，后面从 `stdio` 平移到 HTTP MCP 基本不会重写核心逻辑。
