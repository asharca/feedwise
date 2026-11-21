export interface PreviewFeedItem {
  id: string;
  title: string;
  unread: number;
  kind?: "rss" | "html" | "rsshub";
}

export interface PreviewFolder {
  id: string;
  name: string;
  feeds: PreviewFeedItem[];
}

export interface PreviewArticle {
  id: string;
  feedTitle: string;
  author: string;
  timeAgo: string;
  readingMinutes: number;
  title: string;
  excerpt: string;
  unread: boolean;
  starred: boolean;
  ruleBadge?: string;
  aiSummary: string;
  tags: string[];
  paragraphs: string[];
}

export const PREVIEW_FOLDERS: PreviewFolder[] = [
  {
    id: "tech",
    name: "技术博客",
    feeds: [
      { id: "meituan", title: "美团技术团队", unread: 4, kind: "rss" },
      { id: "cf", title: "Cloudflare Blog", unread: 6, kind: "rss" },
      { id: "ruanyf", title: "阮一峰的网络日志", unread: 2, kind: "rss" },
    ],
  },
  {
    id: "web",
    name: "网页与社区",
    feeds: [
      { id: "pg", title: "PostgreSQL Release", unread: 1, kind: "html" },
      { id: "hn", title: "Hacker News 精选", unread: 5, kind: "rsshub" },
    ],
  },
];

export const PREVIEW_ARTICLES: PreviewArticle[] = [
  {
    id: "pg-cjk-fts",
    feedTitle: "美团技术团队",
    author: "存储引擎组",
    timeAgo: "12 分钟前",
    readingMinutes: 6,
    title: "PostgreSQL 原生双字索引：不部署 ES 也能做好中文全文检索",
    excerpt: "通过生成列与 CJK bigram 切分函数，把百万级文章的中文搜索查询延迟控制在 15ms 以内。",
    unread: true,
    starred: true,
    ruleBadge: "规则命中 · 已推送 Telegram",
    aiSummary:
      "文章拆解了在 PostgreSQL 中利用生成列与 GIN 索引实现中文双字切分检索的方案：无需额外维护 Elasticsearch 集群，支持短语顺序匹配与排除词语法，适合中小型自托管信息库。",
    tags: ["PostgreSQL", "中文搜索", "架构"],
    paragraphs: [
      "传统自托管阅读器往往面临两难：PostgreSQL 默认 simple 分词器无法切分连续中文字符，而额外部署 Elasticsearch 又会带来数 GB 的常驻内存开销。",
      "通过在数据库内定义 CJK 双字切分函数，并与英文前缀匹配、减号排除词组合为统一的 tsquery，既保留单库部署的轻量优势，也能在百万行规模下保持稳定的毫秒级响应。",
    ],
  },
  {
    id: "html-source",
    feedTitle: "PostgreSQL Release",
    author: "HTML 选择器源",
    timeAgo: "38 分钟前",
    readingMinutes: 4,
    title: "PostgreSQL 17.4 安全与性能修复更新说明",
    excerpt: "由 CSS 选择器自动提取列表并抓取正文，通过 ETag 条件请求避免重复下载。",
    unread: true,
    starred: false,
    ruleBadge: "HTML 抓取 · 已提取全文",
    aiSummary:
      "本次维护版本修复了查询规划器在分区表连接下的边界问题，并改进了逻辑复制槽同步性能；建议生产环境按常规窗口滚动升级。",
    tags: ["Release", "HTML 源", "数据库"],
    paragraphs: [
      "对于未提供 RSS 订阅的官方发布页，只需配置条目、标题与链接三个 CSS 选择器，即可与普通订阅源一样进入统一的抓取调度与去重流水线。",
      "每次抓取均携带 If-None-Match 与 If-Modified-Since 请求头，内容未变化时直接返回 304，并自动按更新频率动态拉长或缩短下次巡检间隔。",
    ],
  },
  {
    id: "hot-cluster",
    feedTitle: "跨平台热榜事件",
    author: "4 个平台同时在榜",
    timeAgo: "1 小时前",
    readingMinutes: 3,
    title: "开源端侧推理框架发布量化新版本，消费级显卡吞吐提升 42%",
    excerpt: "GitHub Trending、Hacker News、V2EX、知乎热榜 2 小时内交叉升温，已自动归并去重。",
    unread: true,
    starred: true,
    ruleBadge: "热榜规则 · SimHash 去重 3 条",
    aiSummary:
      "新版推理引擎针对 4-bit KV Cache 引入融合算子，显著降低长上下文显存占用；社区实测在单卡 16GB 环境下即可流畅运行长文档摘要任务。",
    tags: ["热榜聚类", "端侧推理", "开源"],
    paragraphs: [
      "面对同一事件在多个热榜和科技媒体反复刷屏，Feedwise 先通过 URL 规范化与 SimHash 指纹收敛重复条目，再聚合各平台排名走势。",
      "命中你设定的热榜关键词规则后，系统可立刻经由飞书、Bark 或 Web Push 发送提醒，不必手动刷新多个榜单。",
    ],
  },
  {
    id: "mcp-reader",
    feedTitle: "Cloudflare Blog",
    author: "Engineering",
    timeAgo: "3 小时前",
    readingMinutes: 5,
    title: "用 MCP 协议把个人订阅库接入日常编码与研究工作流",
    excerpt:
      "通过 OAuth 2.1 Streamable HTTP 授权 Claude 与 Cursor 直接按时间、标签检索最近收藏的文章。",
    unread: false,
    starred: false,
    aiSummary:
      "介绍了通过标准 MCP 工具将个人知识与订阅流暴露给 AI 助手的实践方式，支持按未读、标签与全文搜索精准召回上下文。",
    tags: ["MCP", "AI 工作流"],
    paragraphs: [
      "信息收集的终点不只是已读归档。借助内置的 OAuth 2.1 Streamable HTTP 端点与本地 stdio 模式，AI 助手可以直接查询你近一周收藏的技术文章与热榜事件。",
      "所有访问权限均由你自己的服务器签发与撤销，敏感内容无需上传到第三方托管同步服务。",
    ],
  },
];
