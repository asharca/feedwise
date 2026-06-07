# SSE 实时同步设计

**日期**: 2026-06-07  
**状态**: 待实现

## 问题背景

feedwise 的 UI 存在多处数据陈旧问题：

- feed worker 抓取到新文章后，reader 文章列表不刷新
- 删除 feed 订阅后，其他标签页仍显示该 feed
- worker 抓取失败后，sidebar 错误状态不实时更新
- 多个浏览器标签页之间状态不同步

根本原因：API 路由和 feed worker 运行在不同进程，客户端只在初始加载时获取数据，此后不感知服务端状态变化。

## 架构

### 传输层：Redis Pub/Sub + SSE

```
worker 进程                    Next.js 进程
───────────────                ────────────────────────────────
feed-worker (抓取完成)  ──┐    GET /api/sse ←── EventSource (浏览器 tab A)
DELETE /api/feeds/[id]  ──┤──→ Redis PUBLISH    GET /api/sse ←── EventSource (浏览器 tab B)
                          │    频道: feedwise:events:{userId}
                          └──→ 每个 SSE 连接独立订阅，过滤该用户的事件
```

选择 Redis Pub/Sub 的理由：
- 项目已使用 Redis（BullMQ），无需新增基础设施
- 天然支持跨进程通信（worker ↔ Next.js）
- 每用户独立频道，无需服务端过滤广播

### 事件类型

```ts
type FeedwiseEvent =
  | { type: 'articles.new';  feedId: string; count: number }
  | { type: 'feed.fetched';  feedId: string }
  | { type: 'feed.error';    feedId: string; errorCode: string; message: string }
  | { type: 'feed.deleted';  subscriptionId: string; feedId: string }
```

### 频道命名

`feedwise:events:{userId}` — 每用户一条频道，隔离不同账户的事件流。

## 实现组件

### 新增文件

**`lib/events/types.ts`**  
导出 `FeedwiseEvent` 联合类型。无运行时依赖。

**`lib/events/publisher.ts`**  
导出 `publishEvent(userId: string, event: FeedwiseEvent): Promise<void>`。  
内部维护一个独立的 ioredis 连接（Pub/Sub 连接不能复用 BullMQ 的连接）。  
publish 失败静默记录日志，不影响主流程。

**`app/api/sse/route.ts`**  
- `GET` 请求，需要 auth（未登录返回 401）
- 响应 `Content-Type: text/event-stream`，`Cache-Control: no-cache`
- 每个连接创建独立 ioredis subscriber，订阅 `feedwise:events:{userId}`
- 每 30 秒发送 SSE comment（`: heartbeat`）防止代理超时
- `request.signal` abort 时清理 subscriber 和 heartbeat timer

**`lib/hooks/use-sse.ts`**  
客户端 hook：
```ts
function useSSE(handler: (event: FeedwiseEvent) => void): void
```
- 内部使用 `EventSource('/api/sse')`
- 自动重连（EventSource 原生支持）
- 组件卸载时关闭连接
- `handler` 用 `useRef` 持有，避免重新订阅

### 修改文件

**`lib/jobs/workers/feed-worker.ts`**  
- 成功且有新文章：`publishEvent(userId, { type: 'articles.new', feedId, count })`
- 成功但无新文章：`publishEvent(userId, { type: 'feed.fetched', feedId })`
- 失败（catch 块）：`publishEvent(userId, { type: 'feed.error', feedId, errorCode, message })`

注意：feed-worker 目前从 job data 获取 feedId/url，需要额外查询 userId（通过 feedId → subscriptions 表）。由于一个 feed 可能被多个用户订阅，需要向所有订阅该 feed 的用户发布事件。

**`app/api/feeds/[id]/route.ts`**（DELETE handler）  
删除成功后：`publishEvent(session.user.id, { type: 'feed.deleted', subscriptionId, feedId })`

**`app/(reader)/reader/page.tsx`**  
使用 `useSSE`，监听 `articles.new` 事件：
- 如果当前视图的 feedId 匹配事件的 feedId（或当前是全局视图），触发文章列表重新加载
- 重新加载通过递增 `reloadKey` state 实现（已包含在 fetchArticles 的 useEffect 依赖中）

**`components/layout/app-sidebar.tsx`**  
使用 `useSSE`，监听：
- `feed.deleted`：从 `subs` state 中移除对应条目（已有 `setSubs` 逻辑，补充跨 tab 场景）
- `feed.error`：更新对应 subscription 的 `lastFetchError` 字段，sidebar 中错误状态实时显示

## 数据流示例

### 场景 1：RSS 更新后自动刷新

```
1. 用户点击 "Refresh now"
2. POST /api/feeds/{subId}/refresh → 入 BullMQ 队列
3. feed-worker 处理，parseFeed() 返回 3 篇新文章
4. INSERT articles (onConflictDoNothing)
5. publishEvent(userId, { type: 'articles.new', feedId, count: 3 })
6. Redis PUBLISH → SSE 推送到所有该用户的 tab
7. reader page 接收事件，reloadKey + 1
8. fetchArticles 重新执行，文章列表更新
```

### 场景 2：删除 feed，多 tab 同步

```
1. Tab A 用户删除订阅
2. DELETE /api/feeds/{subId} → DB 删除
3. publishEvent(userId, { type: 'feed.deleted', subscriptionId, feedId })
4. Tab A：API 响应后 setSubs 乐观更新（已有）
5. Tab B：SSE 接收 feed.deleted → setSubs 移除条目
```

## 错误处理

- **Redis 不可用**：publisher 失败静默记录，不影响 API/worker 主逻辑
- **SSE 连接断开**：EventSource 自动重连（浏览器原生行为）
- **subscriber 泄漏**：SSE route 使用 `request.signal` 的 abort 事件确保清理

## 不在此次范围内

- WebSocket（SSE 单向推送已满足需求）
- 文章内容更新（`onConflictDoNothing` 问题，单独议题）
- 推送通知（浏览器 Push API）
