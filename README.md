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
        "OPENOBSERVE_USERNAME": "your_username",
        "OPENOBSERVE_PASSWORD": "your_password"
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
| `OPENOBSERVE_DEFAULT_TRACE_STREAM` | `default` | Trace 类工具默认使用的 Trace 流 |
| `OPENOBSERVE_DEFAULT_LOG_COLUMNS` | `_timestamp,message` | `search_logs` 与日志关联类工具默认查询的列，逗号分隔 |
| `OPENOBSERVE_DEFAULT_LOOKBACK` | `3d` | 查询类工具默认时间窗口，支持 `7d`、`12h`、`30m`、`1d12h` |
| `OPENOBSERVE_DEFAULT_LOG_ROWS` | `50` | 日志类查询工具默认返回条数 |
| `OPENOBSERVE_DEFAULT_STREAM_ROWS` | `100` | Stream 列表类工具默认返回条数 |
| `OPENOBSERVE_LOG_MESSAGE_CHAR_LIMIT` | `2000` | 日志 `message` 字段的默认截断长度，填 `0` 表示不截断 |
| `OPENOBSERVE_LOG_NO_TRUNCATE_KEYWORDS` | `ERROR,WARN` | `message` 中包含这些关键字时不截断日志，逗号分隔，大小写不敏感；关键字前后空格会保留 |
| `OPENOBSERVE_MAX_RANGE` | `31d` | 单次允许查询的最大时间跨度，支持 `7d`、`12h`、`30m`、`1d12h`，填 `0` 表示不限制。它限制的是 start/end 之间的跨度，不限制你查多久以前的数据 |
| `OPENOBSERVE_MAX_LOG_ROWS` | `1000` | 日志类工具允许返回的最大行数，填 `0` 表示不限制 |
| `OPENOBSERVE_MAX_STREAM_ROWS` | `500` | Stream 列表类工具允许返回的最大行数，填 `0` 表示不限制 |
| `OPENOBSERVE_MASK_FIELDS` | 内置字段列表 | 需要递归脱敏的字段名，逗号分隔 |

如果你准备跑 `npm run smoke:live`，建议额外配置：

- `OPENOBSERVE_DEFAULT_LOG_STREAM`
- `OPENOBSERVE_DEFAULT_TRACE_STREAM`

默认查询行为：

- 所有查询类工具默认使用 `OPENOBSERVE_DEFAULT_LOOKBACK`，默认值是 `3d`
- 日志类工具默认返回条数使用 `OPENOBSERVE_DEFAULT_LOG_ROWS`，默认值是 `50`
- Stream 列表类工具默认返回条数使用 `OPENOBSERVE_DEFAULT_STREAM_ROWS`，默认值是 `100`
- `OPENOBSERVE_DEFAULT_LOG_STREAM` 默认为空，不会自动猜测日志 stream；未配置时需要在调用时显式传入
- `OPENOBSERVE_DEFAULT_TRACE_STREAM` 默认值是 `default`
- `search_logs` 默认查询列来自 `OPENOBSERVE_DEFAULT_LOG_COLUMNS`，默认值是 `_timestamp,message`
- 日志正文默认按 `message` 字段处理，截断长度来自 `OPENOBSERVE_LOG_MESSAGE_CHAR_LIMIT`，默认 `2000`，填 `0` 表示不截断；当日志级别为 `ERROR`，或 `message` 包含 `OPENOBSERVE_LOG_NO_TRUNCATE_KEYWORDS` 中的关键字时不会截断。这个关键字列表会保留每项前后空格，比如可配置成 ` ERROR , WARN ` 来贴近日志级别边界
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
- `correlate_logs_and_traces`

## 推荐排障路径

### 当 Stream、字段名还不明确时

建议顺序：

1. `list_streams`
2. 从返回结果里优先选择最可能的 `1` 到 `3` 个候选 Stream
3. `search_logs`
4. 如果字段信息仍然不清楚，再用 `get_stream_settings`、`get_stream_schema`
5. 如果字段名已知但可选值不清楚，再用 `search_values`

优先根据环境、项目、节点、请求路径和命名相似度来选候选 Stream。先查最可能的小范围候选，再决定是否扩展，避免一开始就猜 Stream 名或扫很多不相关的 Stream。

### 当你已经有明确线索时

建议顺序：

1. 如果 Stream 已知，直接 `search_logs`
2. 如果 Stream 未知，先 `list_streams`，再选最可能的 `1` 到 `3` 个候选 Stream 做 `search_logs`
3. `get_log_context`
4. 通用工具不够时再用 `search_sql`

适合请求 ID、订单号、Trace ID、服务名、节点名、已知报错关键字这类定点排查场景。短唯一 ID、请求路径、精确时间这类高特异性线索要优先于通用异常名。

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
3. `correlate_logs_and_traces`

这个路径会先找到异常 Trace，再逐步收敛到具体日志证据。需要完整 DAG 时，在 `get_trace_summary` 里传 `includeTraceDag=true`。

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
- `get_stream_settings`、`get_stream_schema`、`get_log_context`、`get_trace_summary`、`query_metrics_instant`、`query_metrics_range`、`list_alerts` 属于详情型工具，不提供分页
- `search_values` 会优先使用接口返回结果做分页适配；如果后端不提供原生分页，则在返回结果上做切片并给出提示

### 基础探索类

#### `list_streams`

- 作用：列出当前组织里的 logs / metrics / traces streams，解决“先查哪个 stream”
- 适合：找候选日志流、按关键字筛 stream、排查前确认数据入口
- 边界：不解决字段结构，也不返回具体日志内容

#### `get_stream_settings`

- 作用：查看单个 stream 的统计信息、索引信息、全文检索设置和查询相关配置
- 适合：判断哪些字段更适合过滤、全文检索或 distinct values
- 边界：它偏 stream 级配置；`get_stream_schema` 才偏字段结构

#### `get_stream_schema`

- 作用：查看某个 stream 的字段列表、类型和字段摘要
- 适合：不确定字段名时确认 schema，识别 `trace_id`、`span_id`、`service_name`、消息字段等关键字段
- 边界：它解决“字段叫什么”；字段值探索用 `search_values`

#### `search_values`

- 作用：查看已知字段在最近时间范围里出现过哪些值
- 适合：字段名已知但值不清楚，先枚举 `service_name`、`level`、`namespace`、`status_code` 等候选值
- 边界：它解决“字段值有哪些”；高特异性线索仍应直接用 `search_logs`

### 日志排查类

#### `search_logs`

- 作用：在有明确线索时直接检索原始日志，是大多数定点排查场景的第一入口
- 适合：按关键字、服务名、请求 ID、订单号、traceId、节点名等直接查证据
- 时间建议：优先小窗口；已知精确时间时优先用 `start` / `end`
- 边界：它是“原始证据检索”，不负责模式归类、TopK 统计或时间聚合

#### `get_log_context`

- 作用：围绕某条已知日志的 `_timestamp` 拉前后上下文
- 适合：已找到代表性日志，想看它前后发生了什么，或还原局部请求过程
- 边界：它依赖已知时间点，一般在 `search_logs` 之后使用

#### `top_errors`

- 作用：聚合最近时间窗口里最常见的错误消息
- 适合：快速回答“最近主要错误有哪些”，先做 broad scan 再决定下一步下钻
- 边界：它是固定视角的快捷错误聚合；更灵活的字段分析用 `analyze_log_topk`，message 模式归类用 `analyze_log_patterns`

#### `analyze_log_patterns`

- 作用：对一批日志消息做归一化和聚类，输出高频模式
- 适合：看“最近最常见的是哪几类报错”，尤其适合 message 中带动态值的日志
- 边界：它偏 message 模式归类，不是字段 TopK，也不是原始日志检索

#### `analyze_log_topk`

- 作用：按指定字段统计最常见的值
- 适合：看哪个服务最多、哪个状态码最多、哪个 namespace 最多，快速做字段分布收敛
- 边界：它偏字段频次统计，不是 message 模式聚类，也不是时间分布分析

#### `analyze_log_timeline`

- 作用：把一批日志按时间分桶，查看分布和高峰
- 适合：看异常是否集中爆发，判断高峰时间段和突发窗口
- 边界：它偏时间分布，不是 message 模式归类，也不是字段 TopK

#### `search_sql`

- 作用：在通用工具不够用时执行只读 SQL
- 适合：更灵活的聚合、过滤、排序、分页，或通用工具表达不了的查询
- 约束：只允许 `SELECT`；更适合高级查询，不建议作为默认第一步

### Metrics 分析类

#### `list_metric_names`

- 作用：发现当前时间范围里可见的 metric names
- 适合：不确定指标名时先做发现，再给后续 PromQL 提供稳定起点

#### `query_metrics_instant`

- 作用：查询某个 PromQL 表达式在某个时间点的值
- 适合：看当前值，快速判断当前是否异常

#### `query_metrics_range`

- 作用：查询某个 PromQL 表达式在一段时间内的趋势
- 适合：看趋势、波动、峰值、突增，并和 logs / traces 对齐故障时间窗口
- 边界：`query_metrics_instant` 看单点；`query_metrics_range` 看时间序列

### Alerts 查看类

#### `list_alerts`

- 作用：查看当前组织里已经配置的告警规则
- 适合：确认某个 stream、服务或场景是否已有告警覆盖，并补充规则背景和触发条件

### Trace 分析类

#### `find_slow_requests`

- 作用：查最近一段时间最慢的 traces
- 适合：用户反馈“请求慢了”“延迟升高”时，先找最可疑的 trace
- 边界：它解决“先找异常 trace”，不是直接看某个已知 traceId 的详情

#### `get_trace_summary`

- 作用：根据 `traceId` 查看一条 trace 的摘要
- 适合：快速理解 trace 涉及哪些服务、多少 spans、根操作是什么；需要完整 DAG 时传 `includeTraceDag=true`
- 边界：默认是摘要入口，不需要单独的 `get_trace_detail`

#### `correlate_logs_and_traces`

- 作用：已知 `traceId` 后，自动回捞相关日志并结合 trace 信息一起看
- 适合：从 trace 收敛到具体日志证据，沿着 `trace_id`、`span_id`、`service_name` 三类线索一起找证据
- 边界：`get_trace_summary` 主要看 trace 自身；这个 tool 主要做 trace 和日志的桥接

## 开发与发布

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
