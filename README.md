# OpenObserve MCP

[English](./README.en.md)

`OpenObserve MCP` 是一个面向 OpenObserve 排障场景的本地 `stdio` MCP Server。

这个项目将 OpenObserve 中常用的日志检索、字段探索、错误聚合、Trace 分析和日志 Trace 关联能力封装为一组边界清晰的 MCP Tools，便于 AI 客户端以更稳定的方式完成排障。

## 它适合做什么

- 探索当前可用的日志流和 Trace 流
- 查看 Stream 的 schema、设置和查询提示
- 在受控时间范围内检索日志
- 先枚举字段候选值，再收敛过滤条件
- 聚合高频错误模式
- 查询指标当前值和时间趋势
- 查看当前组织里的告警规则
- 发现慢请求并分析 Trace DAG
- 从 Trace 自动回捞相关日志
- 对常见敏感字段做递归脱敏

## MCP Client 接入

### 通过 npm / npx 使用

发布到 npm 后，可以直接通过 `npx` 接入：

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
        "OPENOBSERVE_BASE_URL": "http://127.0.0.1:5080",
        "OPENOBSERVE_ORG_ID": "default",
        "OPENOBSERVE_USERNAME": "your_username",
        "OPENOBSERVE_PASSWORD": "your_password",
        "OPENOBSERVE_DEFAULT_LOG_STREAM": "app_logs",
        "OPENOBSERVE_DEFAULT_TRACE_STREAM": "default"
      }
    }
  }
}
```

### 通过本地仓库接入

也可以直接让 MCP Client 指向本地仓库：

```json
{
  "mcpServers": {
    "openobserve": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\sourceCode\\nodejs\\openobserve-mcp\\src\\index.js"
      ],
      "env": {
        "OPENOBSERVE_BASE_URL": "http://127.0.0.1:5080",
        "OPENOBSERVE_ORG_ID": "default",
        "OPENOBSERVE_USERNAME": "your_username",
        "OPENOBSERVE_PASSWORD": "your_password"
      }
    }
  }
}
```

该配置形式适用于 Cherry Studio 以及其他支持 `stdio` 的 MCP Client。

## 运行要求

- Node.js `18+`
- 一个可访问的 OpenObserve 实例
- 使用 `OPENOBSERVE_USERNAME` + `OPENOBSERVE_PASSWORD`

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板

```bash
cp .env.example .env
```

PowerShell 也可以直接执行：

```powershell
Copy-Item .env.example .env
```

3. 填写 `.env`

```env
OPENOBSERVE_BASE_URL=http://your-openobserve:5080
OPENOBSERVE_ORG_ID=default
OPENOBSERVE_USERNAME=your_username
OPENOBSERVE_PASSWORD=your_password
```

4. 启动 MCP Server

```bash
npm start
```

启动后，进程会通过 `stdio` 等待 MCP Client 连接。

5. 运行测试

```bash
npm test
```

6. 有真实 OpenObserve 实例时执行联调冒烟

```bash
npm run smoke:live
```

## 配置说明

### 基础配置

| 变量名 | 说明 |
| --- | --- |
| `OPENOBSERVE_BASE_URL` | OpenObserve 实例地址，例如 `http://127.0.0.1:5080` |
| `OPENOBSERVE_ORG_ID` | OpenObserve 组织 ID，默认 `default` |
| `OPENOBSERVE_USERNAME` | Basic Auth 用户名 |
| `OPENOBSERVE_PASSWORD` | Basic Auth 密码 |

### 可选项

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENOBSERVE_DEFAULT_LOG_STREAM` | 空 | 日志类工具默认使用的日志流 |
| `OPENOBSERVE_DEFAULT_TRACE_STREAM` | 空 | Trace 类工具默认使用的 Trace 流 |
| `OPENOBSERVE_DEFAULT_LOOKBACK` | `3d` | 查询类工具默认时间窗口，支持 `7d`、`12h`、`30m`、`1d12h` |
| `OPENOBSERVE_DEFAULT_LOG_ROWS` | `200` | 日志类查询工具默认返回条数 |
| `OPENOBSERVE_DEFAULT_STREAM_ROWS` | `100` | Stream 列表类工具默认返回条数 |
| `OPENOBSERVE_MAX_RANGE` | `30d` | 单次允许查询的最大时间范围，支持 `7d`、`12h`、`30m`、`1d12h`，填 `0` 表示不限制 |
| `OPENOBSERVE_MAX_LOG_ROWS` | `1000` | 日志类工具允许返回的最大行数，填 `0` 表示不限制 |
| `OPENOBSERVE_MAX_STREAM_ROWS` | `500` | Stream 列表类工具允许返回的最大行数，填 `0` 表示不限制 |
| `OPENOBSERVE_MASK_FIELDS` | 内置字段列表 | 需要递归脱敏的字段名，逗号分隔 |

如果你准备跑 `npm run smoke:live`，建议额外配置：

- `OPENOBSERVE_DEFAULT_LOG_STREAM`
- `OPENOBSERVE_DEFAULT_TRACE_STREAM`

默认查询行为：

- 所有查询类工具默认使用 `OPENOBSERVE_DEFAULT_LOOKBACK`，默认值是 `3d`
- 日志类工具默认返回条数使用 `OPENOBSERVE_DEFAULT_LOG_ROWS`，默认值是 `200`
- Stream 列表类工具默认返回条数使用 `OPENOBSERVE_DEFAULT_STREAM_ROWS`，默认值是 `100`
- 查询工具统一支持 `lookback`，格式如 `30m`、`6h`、`7d`、`1d12h`
- 所有查询仍然会受 `OPENOBSERVE_MAX_RANGE`、`OPENOBSERVE_MAX_LOG_ROWS`、`OPENOBSERVE_MAX_STREAM_ROWS` 限制

## 已提供的 Tools

### 基础探索

- `list_streams`
- `get_stream_settings`
- `get_stream_schema`
- `search_values`

### 日志排查

- `search_logs`
- `analyze_log_patterns`
- `analyze_log_topk`
- `analyze_log_timeline`
- `search_sql`
- `top_errors`
- `get_log_context`

### Metrics 分析

- `list_metric_names`
- `query_metrics_instant`
- `query_metrics_range`

### Alerts 查看

- `list_alerts`

### Trace 分析

- `find_slow_requests`
- `get_trace_summary`
- `get_trace_detail`
- `correlate_logs_and_traces`

## 推荐排障路径

### 当 Stream、字段名还不明确时

建议顺序：

1. `list_streams`
2. `get_stream_settings`
3. `get_stream_schema`
4. `search_values`

这样可以先确认可用 Stream、字段结构和可过滤值，避免一开始就猜字段名。

### 当你已经有明确线索时

建议顺序：

1. `search_logs`
2. `get_log_context`
3. 通用工具不够时再用 `search_sql`

适合请求 ID、订单号、Trace ID、服务名、已知报错关键字这类定点排查场景。

### 当你需要从一批日志里直接提炼结论时

建议顺序：

1. `search_logs`
2. `analyze_log_patterns`
3. `analyze_log_topk`
4. `analyze_log_timeline`

适合“最近错误主要分成哪几类”“哪个服务最频繁”“异常集中在哪个时间段”这类分析型问题。

### 当问题是慢请求或 Trace 分析时

建议顺序：

1. `find_slow_requests`
2. `get_trace_summary`
3. `get_trace_detail`
4. `correlate_logs_and_traces`

这个路径会先找到异常 Trace，再逐步收敛到具体日志证据。

### 当你需要看指标当前值或趋势时

建议顺序：

1. 指标名不明确时先用 `list_metric_names`
2. 查当前值用 `query_metrics_instant`
3. 看趋势用 `query_metrics_range`

适合 CPU、内存、QPS、延迟、错误率这类指标问题。

### 当你需要确认告警覆盖或规则定义时

建议顺序：

1. `list_alerts`

适合先确认某个 Stream、服务或场景是否已经有对应告警规则。

## Tool 说明

分页约定：

- `search_sql`、`search_logs`、`search_values`、`top_errors`、`list_streams`、`find_slow_requests`、`correlate_logs_and_traces`、`list_metric_names` 支持 `limit` + `offset`
- `get_stream_settings`、`get_stream_schema`、`get_log_context`、`get_trace_summary`、`get_trace_detail`、`query_metrics_instant`、`query_metrics_range`、`list_alerts` 属于详情型工具，不提供分页
- `search_values` 会优先使用接口返回结果做分页适配；如果后端不提供原生分页，则在返回结果上做切片并给出提示

### `list_streams`

适合：

- 先查看当前组织里有哪些日志流、指标流、Trace 流
- 不确定排查入口时，快速确认应该查哪个 Stream
- 想先按关键字筛选出候选 Stream

### `get_stream_settings`

适合：

- 查看单个 Stream 的统计信息和查询相关设置
- 识别哪些字段适合做过滤、全文检索、distinct values
- 在正式检索前先了解这个 Stream 的查询特征

### `get_stream_schema`

适合：

- 查看某个日志流或 Trace 流有哪些字段
- 识别 `trace_id`、`span_id`、`service_name`、日志消息字段等关键字段
- 排查字段名到底是什么，避免 AI 瞎猜

### `search_values`

适合：

- 先枚举 `service_name`、`level`、`status_code` 等字段最近有哪些值
- 不知道具体过滤条件时，先摸清候选值
- 给后续 `search_logs` 或 `search_sql` 提供更稳的筛选依据

### `search_logs`

适合：

- 根据关键字、服务名、请求 ID、订单号、Trace ID 等直接查日志
- 在较小时间窗口里快速拉出原始证据
- 作为大多数定点排查场景的第一入口

### `search_sql`

适合：

- 通用工具不够用时执行只读 SQL
- 做更灵活的聚合、过滤、排序和分页
- 作为通用查询能力的补充入口

### `analyze_log_patterns`

适合：

- 从最近一批日志中提取高频消息模式
- 对包含请求 ID、IP、数字等动态内容的日志做归一化聚类
- 快速回答“最近最常见的是哪几类报错”

### `analyze_log_topk`

适合：

- 统计 `service_name`、`level`、`status_code`、`namespace` 等字段的 TopK
- 快速发现最活跃服务或最集中的错误维度
- 在原始日志较多时先做字段分布收敛

### `analyze_log_timeline`

适合：

- 查看一批日志在时间上的分布情况
- 识别错误突增、高峰时间段和突发窗口
- 为后续缩小时间范围或对齐 Trace 异常提供依据

### `list_metric_names`

适合：

- 不确定指标名时先做发现
- 先按关键字筛选候选 metric name
- 给后续 PromQL 查询提供更稳的起点

### `query_metrics_instant`

适合：

- 查看某个 PromQL 表达式当前值
- 快速确认某个指标当前是否异常
- 做单时刻的容量、QPS、错误率判断

### `query_metrics_range`

适合：

- 查看最近一段时间的指标趋势
- 对比峰值、波动和异常突增
- 配合 logs/traces 对齐故障发生窗口

### `list_alerts`

适合：

- 查看当前组织里已配置的告警规则
- 确认某个 Stream 或场景是否已有告警覆盖
- 在排障时补充规则背景和触发条件线索

说明：

- 只允许 `SELECT`
- 更适合高级查询，不建议作为默认第一步

## 开发与发布

常用命令：

- `npm test`
- `npm run smoke:live`
- `npm run release:check`

推荐发布前顺序：

1. `npm test`
2. 配好真实实例环境变量后执行 `npm run smoke:live`
3. 执行 `npm run release:check`
4. 确认 `README`、`.env.example`、`CHANGELOG.md` 已同步

### `top_errors`

适合：

- 在较大时间窗口里统计最常见错误
- 先做 broad scan，再挑一类错误继续下钻
- 判断当前主要异常模式集中在哪些服务或报错文本

### `get_log_context`

适合：

- 已知某条日志 `_timestamp` 后，向前向后拉上下文
- 判断单条报错前后发生了什么
- 从代表性日志还原一次完整请求的局部过程

### `find_slow_requests`

适合：

- 查最近一段时间最慢的 Trace
- 当用户反馈“请求慢了”“延迟升高”时作为第一入口
- 先识别最可疑的 Trace，再继续做摘要和细查

### `get_trace_summary`

适合：

- 根据 `traceId` 快速理解一条 Trace 的整体结构
- 汇总服务数、Span 数、根操作和主要受影响服务
- 在正式查看完整 DAG 前先做快速判断

### `get_trace_detail`

适合：

- 在 `get_trace_summary` 之后继续下钻
- 需要完整 DAG 节点和边时直接获取详细 Trace 数据
- 让 AI 自己做更细粒度的 Trace 判断

### `correlate_logs_and_traces`

适合：

- 已知 `traceId` 后自动回捞相关日志
- 沿着 `trace_id`、`span_id`、`service_name` 三类线索一起找证据
- 从慢 Trace 或异常 Trace 快速收敛到具体报错日志

## 设计原则

- 默认有边界：所有查询工具都带时间窗口，并受最大时间范围限制
- 默认更安全：限制返回行数，避免一次性拉太多原始日志
- 更适合 AI 使用：把工具分成探索、日志排查、Trace 排查三类
- 关联分析优先：Trace 与日志不是割裂使用，而是可以互相回溯
- 敏感信息保护：对常见密钥类字段递归脱敏

## 仓库内参考文档

仓库中包含一些适合扩展 MCP 能力时使用的参考资料：

- [AI_USAGE.md](./AI_USAGE.md)：给 AI / MCP Client 的简明使用说明
- [AI_SYSTEM_PROMPT.zh-CN.md](./AI_SYSTEM_PROMPT.zh-CN.md)：中文系统提示词模板
- `openapi.json`：本地 OpenObserve OpenAPI 参考文件

## 本地开发

正常启动：

```bash
npm start
```

运行测试：

```bash
npm test
```

执行真实实例冒烟检查：

```bash
npm run smoke:live
```

监听模式：

```bash
npm run dev
```

当前源码结构：

- `src/index.js`：MCP Server 入口
- `src/config.js`：环境变量解析与限制配置
- `src/openobserve-client.js`：OpenObserve API 封装
- `src/tools.js`：MCP Tools 注册与行为定义
- `src/sql.js`：SQL 辅助函数
- `src/time.js`：时间窗口辅助函数
- `src/sanitize.js`：递归脱敏逻辑

## 发布

推荐发布前顺序：

1. `npm test`
2. `npm run smoke:live`
3. `npm run release:check`
4. 确认 `README`、`.env.example`、`CHANGELOG.md` 已同步

当前包采用公开 scoped package 方式发布：

```bash
npm login
npm publish --access public
```

发布包名：

- `@jokezc/openobserve-mcp`

当前版本只支持用户名密码鉴权，不再支持 `OPENOBSERVE_AUTH_TOKEN`。

## 贡献

欢迎提 Issue 和 PR。

如果需要新增 Tool、优化提示词、完善安全边界或补充文档，可以查看 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

MIT，详见 [LICENSE](./LICENSE)。
