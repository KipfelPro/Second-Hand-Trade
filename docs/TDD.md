# 天津大学校园二手交易平台
## 技术设计文档（TDD）V1.0

**项目代号：** TJU Campus Market

**文档版本：** V1.0

**文档状态：** 初版架构设计，待详细设计评审

**关联文档：** 产品需求文档 PRD V0.1

**目标平台：** Linux / 阿里云 ECS

**开发语言：** C++20、TypeScript

---

# 1. 项目概述

## 1.1 技术目标

本项目拟实现一个面向天津大学学生的校园二手交易平台，采用前后端分离架构，提供用户注册、校园身份认证、商品发布、评论交流、即时通信、线下交易、信誉管理、后台管理及 AI 商品咨询功能。

项目在工程实现上兼顾以下目标：

1. 实现完整、可运行的 Web 业务系统。
2. 使用 C++ 开发核心业务后端及即时通信服务。
3. 学习 Linux 高性能网络编程及 Reactor 模型。
4. 掌握 MySQL 数据建模、索引、事务和并发控制。
5. 掌握 Redis 缓存、消息投递及状态管理。
6. 建立基础的测试、日志、监控及自动化部署体系。
7. 完成阿里云 ECS 公网部署。
8. 对关键网络模块进行可复现的性能测试。

## 1.2 架构设计原则

**高内聚、低耦合：** 按业务职责划分模块，避免跨模块直接访问内部实现。

**异步优先：** 网络 I/O 和数据库操作优先采用框架提供的异步接口，不在事件循环线程中执行长时间阻塞任务。

**数据一致性优先：** 商品交易状态、用户认证及信誉变更以数据库事务和明确的状态规则保证正确性。

**渐进式开发：** 首先完成业务单体，随后接入 IM 服务、缓存、AI 服务和性能优化模块。

**可观测性：** 关键接口、后台任务及 IM 连接记录必要指标、日志和错误信息。

**安全默认：** 对外接口统一执行认证、授权、输入校验与资源访问控制。

---

# 2. 技术栈

## 2.1 前端技术

| 技术 | 作用 |
|---|---|
| Vue 3 | 前端应用框架 |
| TypeScript | 类型检查与工程维护 |
| Vite | 项目构建与开发服务器 |
| Vue Router | 页面路由 |
| Pinia | 客户端状态管理 |
| Element Plus | UI 组件 |
| Axios | HTTP 请求客户端 |
| WebSocket API | 即时通信 |
| ECharts | 管理后台与价格走势可视化 |
| 富文本编辑器 | 商品详情编辑 |

富文本编辑器具体产品待原型设计阶段选型。

## 2.2 后端技术

| 技术 | 作用 |
|---|---|
| C++20 | 主要开发语言 |
| Drogon | HTTP API 与业务框架 |
| Muduo | IM 网络通信基础库 |
| MySQL 8.4 LTS | 关系数据库 |
| Redis | 缓存、临时状态及跨实例消息辅助 |
| CMake | C++ 工程构建 |
| GoogleTest | 单元测试 |
| spdlog 或框架日志 | 结构化应用日志 |
| Nginx | 静态资源与反向代理 |

Drogon 的异步数据库客户端优先用于业务访问。不再额外重写一套与框架重复的生产数据库连接池。

## 2.3 部署与运维

- Ubuntu Server LTS
- 阿里云 ECS
- Docker / Docker Compose
- Nginx
- Git / GitHub
- GitHub Actions（后续接入）
- Prometheus / Grafana（可选扩展）

外部大模型使用独立 API 接口，初期不在 ECS 本机部署大型推理模型。

---

# 3. 总体架构设计

## 3.1 分层结构

系统划分为五个主要层次：

**表示层：** Vue 前端应用。

**接入层：** Nginx，负责 HTTPS、静态文件及请求转发。

**业务层：** Drogon Web API，负责核心业务。

**实时通信层：** Muduo IM Server，负责长连接及消息传输。

**数据与外部服务层：** MySQL、Redis、图片存储及大模型服务。

## 3.2 请求流向

普通业务请求：

浏览器 → Nginx → Drogon → MySQL / Redis → Drogon → 浏览器

实时聊天请求：

浏览器 → Nginx → Muduo IM → MySQL / Redis → 目标用户连接

AI 咨询请求：

浏览器 → Drogon AI 模块 → 商品查询 / 价格分析 / 外部 LLM → 浏览器

## 3.3 进程与服务划分

首期采用两个 C++ 服务进程。

### Web API Server

基于 Drogon，负责：

- 用户与身份认证
- 商品及分类管理
- 公开评论
- 收藏
- 预订和交易状态
- 信誉体系
- 举报与管理员后台
- AI 工具调用和业务编排
- 聊天历史查询及业务权限校验接口

### IM Server

基于 Muduo，负责：

- WebSocket 连接建立及维护
- 登录令牌验证
- 心跳和连接超时
- 在线用户连接表
- 聊天消息接收与投递
- 消息确认和重发辅助
- 离线消息处理
- IM 相关性能指标

两者是独立进程，不将两个框架的事件循环强行合并。

---

# 4. 后端模块设计

## 4.1 Drogon 业务模块

### AuthModule

注册、登录、密码管理、登录状态及权限校验。

### UserModule

个人资料、头像、账号状态及公开用户信息。

### VerificationModule

处理校园认证状态及认证记录。

校园认证仅通过获得授权的学校身份接口完成。开发阶段使用 Mock Provider 模拟认证流程。

### ProductModule

商品创建、更新、下架、详情、分类与搜索。

### CommentModule

公开评论、回复、删除及评论举报。

### TradeModule

交易意向、预订、取消、成交确认及交易历史。

### ReputationModule

信誉分规则、分数记录和信誉等级。

### AdminModule

商品管理、用户管理、举报处理、处罚及统计。

### AIModule

大模型 API 调用、商品检索工具、价格分析工具与回答生成。

## 4.2 模块内部结构

每个模块按照三层组织：

**Controller → Service → Repository**

Controller 负责 HTTP 协议适配、参数提取和请求校验。

Service 负责业务规则、事务边界、状态转换和跨模块协调。

Repository 负责数据库访问与查询封装。

DTO 用于传输数据，不直接向外暴露完整数据库实体。

Controller 不直接拼接复杂 SQL，也不承载核心交易业务逻辑。

## 4.3 IM 模块

IM 服务内部初步分为：

- Network：网络连接与事件循环
- Protocol：WebSocket 帧解析及消息协议
- Auth：连接身份校验
- Session：用户连接和在线状态
- Chat：消息业务与发送控制
- Persistence：消息持久化
- Delivery：消息投递、确认和重试
- Metrics：连接与消息指标

IM 对聊天会话、聊天消息及投递状态负责。

Web API 对用户、商品、交易权限和认证状态负责。

IM 不自行修改用户信誉分、商品状态或交易状态。

---

# 5. 数据库设计

## 5.1 数据库选型

使用 MySQL 8.4 LTS，主要表采用 InnoDB。

字符集统一使用 utf8mb4。

数据库结构变更使用版本化迁移文件管理。

所有时间字段统一存储 UTC 时间，前端根据展示需要转换时区。

## 5.2 核心实体

### 用户相关

**users**

- id：BIGINT，主键
- username：VARCHAR，唯一
- password_hash：VARCHAR
- nickname：VARCHAR
- avatar_url：VARCHAR
- campus：VARCHAR
- account_status：ENUM 或受约束状态值
- created_at：DATETIME
- updated_at：DATETIME

**user_verifications**

- id：主键
- user_id：用户外键，唯一有效认证记录约束
- provider：认证提供方
- status：待认证 / 已认证 / 已失效
- verified_at：认证时间
- expires_at：有效期

**reputation_accounts**

- user_id：主键及用户外键
- score：信誉分
- updated_at：更新时间

**reputation_events**

- id：主键
- user_id：用户外键
- delta：分数变化
- reason：变化原因
- related_type / related_id：关联业务对象
- operator_id：操作人或系统标识
- created_at：创建时间

信誉分变化保留事件记录，避免只能看到当前分数而无法解释变化原因。

### 商品相关

**categories**

- id
- parent_id
- name
- sort_order

**products**

- id
- seller_id
- category_id
- title
- description_html
- price
- condition_level
- campus
- status
- view_count
- created_at
- updated_at

其中 `price` 使用 DECIMAL(10,2)，不使用浮点类型存储金额。

**product_images**

- id
- product_id
- object_key
- sort_order

**favorites**

- user_id
- product_id
- created_at

建立 `(user_id, product_id)` 复合唯一约束。

**comments**

- id
- product_id
- user_id
- parent_id
- content
- status
- created_at

使用 parent_id 实现评论回复，首期限制嵌套展示深度。

### 交易相关

**trade_reservations**

- id
- product_id
- buyer_id
- seller_id
- status
- reserved_at
- expires_at
- completed_at
- created_at

支持购买意向、有效预订、取消、超时及成交确认。

成交确认需要检查交易双方身份和业务状态。

### 即时通信相关

**chat_conversations**

- id
- product_id
- buyer_id
- seller_id
- created_at
- updated_at

**chat_messages**

- id
- conversation_id
- sender_id
- client_message_id
- content_type
- content
- created_at

**conversation_members**

- conversation_id
- user_id
- last_read_message_id
- last_read_at

用户同一会话中的 `client_message_id` 需要建立唯一约束，用于防止客户端重试造成重复消息。

### 管理相关

**reports**

- id
- reporter_id
- target_type
- target_id
- reason
- status
- created_at

**admin_actions**

- id
- admin_id
- target_type
- target_id
- action
- reason
- created_at

**user_roles**

- user_id
- role

通过独立角色映射表维护授权，而不是依赖客户端传入角色名称。

## 5.3 实体关系

核心关系如下：

- User 1:N Product
- Category 1:N Product
- Product 1:N ProductImage
- Product 1:N Comment
- User 1:N Comment
- User N:M Product，通过 Favorites 实现
- Product 1:N TradeReservation
- User 1:N TradeReservation
- Product 1:N ChatConversation
- ChatConversation 1:N ChatMessage
- User N:M ChatConversation，通过 ConversationMember 实现

聊天消息持久化属于 IM 服务的数据职责。

首期两个进程可以共用一个 MySQL 实例，但应使用各自独立的数据库账户和表访问权限。

## 5.4 关键索引

建议初期设置：

- users(username)：UNIQUE
- products(seller_id, created_at)
- products(category_id, status, created_at)
- products(status, created_at, id)
- favorites(user_id, product_id)：UNIQUE
- comments(product_id, created_at, id)
- chat_messages(conversation_id, id)
- chat_messages(sender_id, client_message_id)：UNIQUE
- trade_reservations(product_id, status)

商品列表使用稳定排序并支持基于游标的分页扩展。

关键词搜索在 MVP 阶段先使用可支持的数据库查询方式，后续根据数据量评估全文索引或独立搜索引擎。

## 5.5 交易一致性

一件商品在同一时间只能存在一个有效预订。

采用数据库事务与条件更新保证状态正确。

基本过程：

1. 验证买家身份及商品存在。
2. 检查商品处于在售状态。
3. 在事务中条件更新商品状态为已预订。
4. 确认更新影响行数为 1。
5. 创建有效预订记录。
6. 提交事务。

如更新影响行数为 0，则返回商品不可预订。

取消和成交确认同样使用明确状态转换及事务控制。

同一个幂等请求不能重复创建预订或重复完成交易。

---

# 6. API 与通信协议设计

## 6.1 HTTP API

采用 REST 风格，使用 JSON 交换数据。

统一路径前缀：

`/api/v1`

初步接口规划：

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | /auth/register | 用户注册 |
| POST | /auth/login | 用户登录 |
| GET | /users/me | 当前用户 |
| POST | /verifications | 申请认证 |
| GET | /products | 查询商品列表 |
| POST | /products | 发布商品 |
| GET | /products/{id} | 商品详情 |
| PATCH | /products/{id} | 编辑商品 |
| POST | /products/{id}/comments | 发表评论 |
| POST | /products/{id}/favorites | 收藏商品 |
| POST | /trade-reservations | 创建预订 |
| POST | /trade-reservations/{id}/cancel | 取消预订 |
| POST | /trade-reservations/{id}/complete | 确认成交 |
| GET | /conversations | 获取会话列表 |
| GET | /conversations/{id}/messages | 查询聊天历史 |
| POST | /ai/chat | AI 咨询 |
| GET | /admin/statistics | 管理后台统计 |

以上为代表性接口，正式 API 规范另行定义请求参数、响应字段、状态码和错误码。

## 6.2 HTTP 响应规范

成功响应可以使用如下结构：

```json
{
  "code": "OK",
  "message": "success",
  "data": {
    "id": "10001",
    "title": "二手显示器"
  },
  "requestId": "req-example"
}
```

业务 ID 在 JSON 层统一使用字符串表示，避免 JavaScript 对超大整数的精度问题。

错误响应具有稳定错误码，正确使用 HTTP 状态码。

例如：

- 400：参数无效
- 401：未认证
- 403：无权限
- 404：资源不存在
- 409：业务状态冲突
- 429：请求过于频繁
- 500：服务器内部错误

## 6.3 WebSocket 协议

对外路径：

`/ws/chat`

由 Nginx 代理到独立 Muduo IM 服务。

浏览器通过标准 WebSocket API 建立连接。

Muduo 底层提供 TCP 和 Reactor 能力，项目自行实现或引入明确选定的 WebSocket 协议适配层。

需要处理 WebSocket 握手、帧解析、掩码、控制帧、消息分片、连接关闭及消息大小限制。

## 6.4 WebSocket 消息格式

业务消息统一使用 JSON 信封：

```json
{
  "type": "chat.send",
  "requestId": "req-001",
  "payload": {
    "conversationId": "20001",
    "clientMessageId": "client-uuid",
    "contentType": "text",
    "content": "你好，这件商品还在吗？"
  }
}
```

服务端回复示例：

```json
{
  "type": "chat.ack",
  "requestId": "req-001",
  "payload": {
    "messageId": "30001",
    "clientMessageId": "client-uuid",
    "status": "persisted"
  }
}
```

消息类型初步包括：

- auth
- auth.success
- chat.send
- chat.ack
- chat.receive
- chat.read
- presence.update
- error

`persisted` 表示消息已经持久化，不代表接收方已经阅读。

WebSocket Ping/Pong 用于连接存活检测，必要时增加应用层心跳。

## 6.5 即时通信可靠性

首期目标为应用层至少一次发送尝试，并通过消息幂等去重使数据库中只保留一条逻辑消息。

消息处理流程：

1. 校验连接用户。
2. 校验会话参与者权限。
3. 校验消息大小及内容格式。
4. 持久化消息。
5. 返回持久化确认。
6. 向在线接收方推送消息。
7. 接收方重连后按消息 ID 补拉遗漏消息。

在线推送失败时，消息仍保存在 MySQL 中。

不保证所有场景下 WebSocket 消息严格实时到达；历史补拉是最终恢复机制。

---

# 7. Linux 网络模型与并发设计

## 7.1 Muduo Reactor 模型

IM 服务使用非阻塞网络 I/O 与 Reactor 模式。

基础组件包括：

- EventLoop
- Poller / epoll
- Channel
- TcpServer
- TcpConnection
- Acceptor
- EventLoopThreadPool

采用主 Reactor 接收连接、工作 EventLoop 处理连接 I/O 的模型。

每个 TCP 连接由所属 EventLoop 负责其 I/O 事件处理。

跨线程操作通过线程安全的任务投递机制交给连接所属 EventLoop 执行。

## 7.2 线程划分

IM 服务规划以下工作类型：

**I/O 线程：** 处理网络事件和轻量级消息分发。

**业务任务线程：** 执行不适宜阻塞 I/O 线程的业务计算。

**数据库 I/O 执行单元：** 负责聊天消息的持久化。

初期不预先固定大量线程。

线程数量由服务器 CPU、数据库延迟及压测结果决定。

## 7.3 共享状态

在线连接表需要记录：

用户 ID → 当前有效连接集合

允许根据产品策略支持单设备或多设备在线。

对于跨 EventLoop 访问，需要采用明确的并发控制方式：

- 分片连接表及互斥锁
- 或指定状态管理线程
- 或将操作投递到连接所属 EventLoop

禁止多个线程不受约束地并发操作同一连接对象。

## 7.4 异步任务与背压

对于消息发送，监控每个连接的待发送缓冲区大小。

超过阈值时采取限流、丢弃非关键推送或主动断开异常连接等策略。

不允许慢客户端无限消耗服务器内存。

对于数据库写入，使用有界任务队列控制积压。

数据库不可用时及时返回服务异常，不无限接受无法持久化的新消息。

## 7.5 可扩展基础组件

后期根据压测结果研究：

- 自研线程池
- 对象池
- 消息缓冲区内存池
- 异步日志
- 定时器管理
- 更细粒度的锁优化

这些组件可先独立实现单元测试与基准测试，再决定是否接入生产业务。

---

# 8. 缓存与数据一致性

## 8.1 Redis 使用范围

计划使用 Redis 管理：

- 热门商品缓存
- 商品详情缓存
- API 限流计数
- 临时会话及在线状态
- IM 服务多实例扩展时的消息通知

不将 Redis 作为商品、交易及聊天历史的唯一持久化存储。

## 8.2 商品缓存策略

采用 Cache Aside 策略：

读取时先查询缓存，未命中则读取 MySQL 并填充缓存。

修改商品时先提交数据库事务，再失效对应缓存。

设置适当的 TTL，允许短时间的非关键展示延迟。

商品交易状态等关键操作必须以数据库实时状态判断，不直接依赖缓存判断是否可预订。

## 8.3 Redis 故障降级

Redis 暂时不可用时：

- 商品查询可回退到 MySQL。
- 限流采用保守降级策略。
- IM 在线状态可能短暂不准确。
- 交易一致性不得受到影响。

首期单机部署时无需引入 Redis Cluster。

---

# 9. 身份认证与安全架构

## 9.1 用户认证

登录后发放短有效期访问令牌。

后端统一验证令牌签名、有效期、用户身份和账户状态。

Web API 使用中间件或过滤器统一完成身份验证。

密码使用 Argon2id 等专用密码哈希算法存储。

## 9.2 WebSocket 身份验证

浏览器建立 WebSocket 连接时，通过明确的认证流程绑定用户身份。

初期建议使用短时效、一次性的 WebSocket 连接票据。

流程：

1. 用户通过现有登录会话向 Drogon 申请 IM 连接票据。
2. Drogon 验证用户身份与账户状态。
3. 生成短时效票据。
4. 浏览器建立 WebSocket 连接。
5. IM 服务验证票据并绑定用户。
6. 票据成功使用后失效。

避免将长期访问令牌放在 URL 查询参数中。

## 9.3 服务间认证

Web API 与 IM Server 之间的内部调用必须有独立认证机制。

初期可使用内部监听地址、服务密钥及签名请求。

服务间认证不能仅依赖请求来自本机这一条件。

## 9.4 校园认证

校园实名认证采用身份提供方适配层设计。

`VerificationProvider` 抽象认证流程。

开发阶段使用 MockVerificationProvider。

获得学校授权后，再开发具体的学校身份认证适配实现。

不存储学校统一身份认证密码。

## 9.5 安全控制

统一实施：

- HTTPS / WSS
- 认证与资源所有权校验
- 管理员 RBAC 权限控制
- 富文本 HTML 清理
- SQL 参数化查询
- 文件类型与大小校验
- 图片安全处理
- 请求限流
- CSRF 防护（使用 Cookie 凭据时）
- XSS 防护
- WebSocket Origin 校验
- 聊天消息大小限制
- 管理员审计日志

---

# 10. AI 助手与价格分析

## 10.1 AI 模块组成

AI 功能划分为：

- AssistantController
- LLMClient
- ToolDispatcher
- ProductSearchTool
- PriceStatisticsTool
- ConversationContextManager

前端负责显示吉祥物、对话窗口和可视化结果。

后端负责模型调用、工具授权与数据查询。

## 10.2 AI 请求流程

1. 用户在吉祥物对话窗口输入问题。
2. Drogon 验证用户并检查配额。
3. AI 模块识别咨询需求。
4. 必要时调用商品搜索和价格统计工具。
5. 将授权查询得到的结果传入大模型。
6. 返回文字及结构化商品卡片数据。

大模型不得直接执行任意 SQL。

所有工具都由后端实现白名单接口，且执行权限和参数检查。

## 10.3 价格数据

站内价格来源主要包括：

- 商品挂牌记录
- 历史挂牌价格快照
- 已确认成交的价格
- 合法授权的外部数据

不同来源的价格必须保留来源类型及采集时间。

外部价格采集应遵守数据来源的授权条件和访问规则。

## 10.4 VTuber 吉祥物

首期使用静态立绘或轻量动画。

后期扩展：

- Live2D 动画
- 语音合成
- 语音输入
- 表情与动作状态
- AI 流式输出

吉祥物渲染逻辑与 LLM 服务保持解耦。

---

# 11. Linux 与云端部署

## 11.1 部署环境

目标环境为阿里云 ECS，运行 Ubuntu Server LTS。

采用 Docker Compose 组织应用。

开发环境优先使用 WSL2 / Ubuntu，以接近真实 Linux 服务器行为。

## 11.2 容器划分

计划包含：

- nginx
- frontend-build（构建阶段）
- web-api
- im-server
- mysql
- redis

前端构建产物由 Nginx 提供访问。

数据库数据和上传文件使用持久化卷或独立存储服务。

## 11.3 网络端口

公网仅开放：

- 80：HTTP 重定向到 HTTPS
- 443：HTTPS / WSS
- 管理用 SSH 端口：限制可信来源

后端内部端口示例：

- Drogon：8080
- Muduo：9000
- MySQL：3306
- Redis：6379

内部端口仅在容器网络或受控内部网络中访问，不直接暴露公网。

## 11.4 Nginx 路由

建议：

- `/` → Vue 静态资源
- `/api/` → Drogon
- `/ws/` → Muduo IM

对于 WebSocket 代理，启用 HTTP Upgrade 及 Connection 头转发，并设置合适的空闲超时。

## 11.5 文件存储

商品图片可采用对象存储。

建议使用阿里云 OSS 并通过后端签发上传凭据或受控上传流程。

数据库只记录对象标识，不直接存储大量图片二进制内容。

上传文件通过服务端校验和处理后提供访问。

## 11.6 部署流程

1. 合并代码并运行自动测试。
2. 编译 C++ Release 版本。
3. 构建前端静态资源。
4. 构建容器镜像。
5. 执行数据库迁移。
6. 更新服务容器。
7. 运行健康检查。
8. 检查关键业务接口。
9. 验证 IM 连接。
10. 保留必要的回滚版本。

## 11.7 数据备份

MySQL 定期备份。

备份文件不只保存在同一服务器的同一磁盘。

定期执行恢复测试，确保备份实际可用。

---

# 12. 测试与性能评估

## 12.1 单元测试

重点测试：

- 用户权限判断
- 商品状态机
- 交易预订规则
- 信誉分计算
- 消息协议解析
- 业务参数校验

## 12.2 集成测试

重点测试：

- API 与数据库事务
- Web API 与 IM 身份认证
- Redis 缓存失效
- WebSocket 消息持久化
- 离线消息补拉
- 商品与评论举报处理

## 12.3 并发测试

重点测试：

- 多用户同时预订同一商品
- 重复请求幂等性
- 大量 WebSocket 长连接
- 聊天消息持续发送
- 慢客户端
- 网络断开及重连
- MySQL 和 Redis 暂时不可用

## 12.4 性能指标

记录：

- HTTP 请求吞吐量（RPS）
- P50 / P95 / P99 响应延迟
- IM 在线连接数
- 每秒消息处理量
- 消息持久化延迟
- 消息投递延迟
- CPU 和内存占用
- 数据库连接使用情况
- 错误率

具体性能目标根据云服务器规格和压测基线制定，不预先声称可支持某个并发数量。

## 12.5 性能优化原则

先定位瓶颈，再实施优化。

每项优化需要包含：

- 问题背景
- 原因分析
- 优化方案
- 测试条件
- 优化前数据
- 优化后数据
- 资源成本和副作用

---

# 13. 工程目录结构

```text
campus-market/
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── backend/
│   ├── web-api/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── models/
│   │   ├── dto/
│   │   ├── filters/
│   │   ├── config/
│   │   └── main.cpp
│   │
│   ├── im-server/
│   │   ├── network/
│   │   ├── protocol/
│   │   ├── auth/
│   │   ├── session/
│   │   ├── chat/
│   │   ├── persistence/
│   │   ├── delivery/
│   │   └── main.cpp
│   │
│   ├── common/
│   └── CMakeLists.txt
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── benchmark/
│
├── deploy/
│   ├── nginx/
│   ├── docker/
│   └── compose.yaml
│
├── docs/
│   ├── PRD.md
│   ├── TDD.md
│   ├── DATABASE.md
│   ├── API.md
│   └── DEPLOYMENT.md
│
└── README.md
```

---

# 14. 开发阶段与里程碑

## M1：基础工程

- 初始化 Git 仓库。
- 搭建 Vue 3 和 Drogon 工程。
- 配置 CMake、MySQL 和开发环境。
- 实现基础 HTTP API。
- 建立数据库迁移机制。

验收：前后端能够通信，数据库可以正常读写。

## M2：核心交易业务

- 注册登录。
- 商品发布及浏览。
- 商品搜索。
- 评论与收藏。
- 预订和交易状态管理。

验收：能够完成商品从发布到线下成交确认的完整流程。

## M3：即时通信服务

- 搭建 Muduo TCP Server。
- 完成 WebSocket 协议适配。
- 实现 IM 鉴权。
- 实现会话与消息管理。
- 实现消息持久化和离线补拉。

验收：两个用户可以稳定私聊，重连后可以恢复历史消息。

## M4：平台治理

- 校园认证业务流程。
- 信誉体系。
- 举报处理。
- 管理员后台。
- 审计日志。

验收：管理员能够完成违规处理及平台数据查询。

## M5：AI 功能

- 接入外部大模型。
- 开发商品搜索工具。
- 开发价格统计工具。
- 实现 AI 吉祥物交互界面。

验收：AI 能回答商品问题，并推荐平台中真实存在的商品。

## M6：部署与优化

- Docker Compose 部署。
- 配置 Nginx / HTTPS。
- 实现健康检查与基础监控。
- 完成压力测试。
- 根据瓶颈实施优化。

验收：公网可以正常访问平台，核心业务通过端到端测试并具备基本备份和恢复能力。

---

# 15. 已知风险及待决策事项

| 风险或问题 | 初步解决方向 |
|---|---|
| 学校认证接口尚未授权 | 使用模拟接口开发，正式接入待批准 |
| Muduo 不直接提供完整 WebSocket 业务框架 | 设计独立协议适配层 |
| 双服务存在通信与身份同步成本 | 使用短时效票据及明确服务边界 |
| 同一商品被重复预订 | 数据库条件更新与事务 |
| 聊天消息重复投递 | 唯一消息 ID 与幂等处理 |
| Redis 与 MySQL 数据不一致 | 数据库为权威源，缓存失效与补偿 |
| 图片存储与传输成本 | 压缩、尺寸限制、对象存储 |
| AI 调用成本和内容风险 | 限额、工具白名单、超时和输出审核 |
| 云服务器资源有限 | 分阶段部署、监控资源、避免过度拆分 |
| 模块数量多、开发周期长 | 严格按照里程碑交付 |

---

# 16. 设计结论

本项目采用前后端分离的 Web 架构。

核心业务由 Drogon 负责，即时通信由独立 Muduo 服务负责，MySQL 承担关系数据持久化，Redis 提供缓存和临时状态支持，Nginx 作为公网统一入口。

初期以模块化业务系统和单服务器部署为主，在业务完整性得到验证后，逐步开展 Linux 网络编程、线程模型、缓存、消息系统和性能优化工作。

项目最终交付包括：

1. 可访问的校园二手交易网站。
2. 可独立运行的 C++ Web API 服务。
3. 可独立运行的 Muduo 即时通信服务。
4. 数据库与 API 设计文档。
5. 自动化测试和性能测试结果。
6. Linux 云端部署配置。
7. 技术总结与项目 README。

**文档版本：V1.0**

**后续详细设计：数据库 DDL、交易状态机、IM 协议、认证与服务间通信、部署配置。**
