# 企业微信扫码登录融合 · 设计文档

> 日期：2026-06-04
> 参考：`docs/api_user.py`（Python FastAPI 原始实现）

---

## 概述

将 `api_user.py` 中的企业微信扫码登录及用户管理功能完整移植到 Cobalt Next.js 项目中。移除邮箱密码登录，改用企业微信扫码作为唯一登录方式。Token 策略采用 JWT（与现有 Cobalt 架构一致），权限和状态检查在 API route 层通过 DB 查询完成。

---

## 一、技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Token 策略 | JWT（jose） | 与现有 middleware 兼容，无需改动 Edge Runtime |
| 架构方式 | 全部在 Next.js 实现 | api_user.py 仅 Cobalt 使用，无需独立 Python 后端 |
| 登录方式 | 仅企业微信扫码 | 移除邮箱密码注册/登录 |
| 数据模型 | 扩展现有 Prisma User 表 | 保留 relation 结构，新增扫码相关字段 |
| 权限检查 | JWT 验签 + API route 层 DB 查询 | middleware 高性能（无状态），API 层精确控制 |

### Token 安全性说明

JWT 签发后 7 天内无法从服务端主动作废。但通过 API route 层检查 `accountStatus`，被禁用用户的请求返回 403，实际效果等同于即时失效（最多 1 次请求的毫秒级窗口）。

---

## 二、数据模型

### Prisma User 表

```prisma
model User {
  id            String   @id @default(uuid())
  email         String?  @unique           // 改为可选（扫码用户可能无邮箱）
  name          String?                     // 保留（兼容）
  avatar        String?                     // 保留（映射自外部 photoUrl/portrait）
  passwordHash  String   @default("")       // 保留字段，扫码用户为空字符串

  // 新增字段（来自 api_user.py）
  username      String?  @unique            // adAccount，企业微信账号
  mobile        String?
  group         String?                     // 用户组
  permissions   Json?                       // {"is_admin": true, ...}
  accountStatus String   @default("active") // active | inactive | disabled | locked
  extras        Json?                       // 其他扩展字段

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tasks         Task[]
  skills        Skill[]
  feedbacks     TaskFeedback[]
  knowledge     Knowledge[]
}
```

**字段映射关系（api_user.py → Prisma）：**

| Python 字段 | Prisma 字段 | 说明 |
|---|---|---|
| username (adAccount) | username | 企业微信账号，唯一标识 |
| portrait (photoUrl) | avatar | 用户头像 URL |
| mobile | mobile | 手机号 |
| email | email | 邮箱（可选） |
| group | group | 用户组 |
| permissions | permissions | JSON 权限信息 |
| account_status | accountStatus | 账户状态 |
| extras | extras | 扩展字段 |
| token_info / token_expiry | 不需要 | JWT 方案无需存 DB |
| is_del | 不需要 | 用 accountStatus=disabled 替代 |

---

## 三、API 设计

### 认证 API（替换现有）

| 方法 | 路径 | 说明 |
|---|---|---|
| **删除** | `/api/auth/login` | 移除邮箱密码登录 |
| **删除** | `/api/auth/register` | 移除注册功能 |
| **新增** | `GET /api/auth/qr/generate` | 调外部 API 生成二维码，返回 uuid + base64 图片 |
| **新增** | `GET /api/auth/qr/check?uuid=xxx` | 轮询扫码状态，成功时 upsert 用户 + 签发 JWT |
| **修改** | `GET /api/auth/me` | 返回扩展用户信息 |
| **保留** | `POST /api/auth/logout` | 清除 cookie |

### 用户管理 API（新增）

| 方法 | 路径 | 说明 |
|---|---|---|
| **新增** | `GET /api/admin/users` | 用户列表（分页+筛选），需管理员权限 |
| **新增** | `POST /api/admin/users/batch-update` | 批量更新用户，需管理员权限 |

### QR Generate 接口

```
GET /api/auth/qr/generate

Response 200:
{
  "uuid": "xxx-xxx-xxx",
  "qrBase64": "data:image/png;base64,...",
  "status": 10
}
```

实现逻辑：
1. POST `QR_BASE_URL/generate` → 获取 uuid
2. 拼接扫码 URL：`https://app.corpautohome.com/newautobots/qr/confirm?uuid={uuid}`
3. 用 `qrcode` npm 包生成 base64 PNG 图片
4. 返回 uuid + qrBase64 + status

### QR Check 接口

```
GET /api/auth/qr/check?uuid=xxx

Response 200:
{
  "status": 30,          // 10=待扫码 20=已扫码 30=成功 50=过期
  "user": {              // 仅 status=30 时返回
    "id": "...",
    "username": "zhangsan",
    "name": "张三",
    "avatar": "https://...",
    "group": "测试",
    "permissions": {...},
    "accountStatus": "active"
  }
}
```

实现逻辑（status=30 时）：
1. POST `QR_BASE_URL/validateTokenIoa?token={token}` → 获取用户信息
2. 字段映射：
   - `adAccount` → username
   - `photoUrl` → avatar
   - `displayName`（或其他名字字段）→ name；无则取 username 作为 name
   - 其余字段存入 extras JSON
3. Prisma upsert：按 username 查找，存在则更新（portrait、mobile、email、group、extras），不存在则创建
4. 检查 `accountStatus`：如果不是 active，返回错误（禁止登录）
5. 签发 JWT（payload: {userId, username, email?}）→ 写入 httpOnly cookie
6. 返回用户信息

### Admin Users 接口

```
GET /api/admin/users?page=1&pageSize=20&keyword=xxx&group=xxx&accountStatus=xxx
Headers: Cookie: token=xxx

Response 200:
{
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "users": [...]
}
```

权限检查流程：
1. `getAuthUser(token)` → JWT 验证
2. `prisma.user.findUnique({ where: { id: userId } })` → 查 DB
3. 检查 `accountStatus === "active"`
4. 检查 `isAdmin(user)` → 管理员列表或 permissions.is_admin

### Admin Batch Update 接口

```
POST /api/admin/users/batch-update
Body:
{
  "userIds": ["id1", "id2"],
  "mobile": "138xxxx",        // 可选
  "email": "xx@xx.com",       // 可选
  "group": "测试",             // 可选
  "accountStatus": "active",  // 可选
  "permissions": {...}         // 可选
}
```

**服务端校验：** `accountStatus` 仅允许 `active | inactive | disabled | locked`，非法值返回 400。

---

## 四、扫码登录流程

```
前端                    Next.js API              企业微信外部 API
 │                         │                          │
 │─ GET /qr/generate ─────→│── POST /generate ────────→│
 │                         │←── {uuid, status} ───────│
 │←── {uuid, qrBase64} ───│  (qrcode 库生成 base64)    │
 │                         │                          │
 │ [展示二维码图片]          │                          │
 │                         │                          │
 │─ GET /qr/check?uuid ──→│── GET /check?uuid ───────→│
 │   (每 2 秒轮询)          │←── {status, token} ──────│
 │                         │                          │
 │                         │ [status=30 成功]          │
 │                         │── POST /validateTokenIoa ─→│
 │                         │←── {adAccount, photoUrl} ─│
 │                         │                          │
 │                         │ [upsert User]             │
 │                         │ [检查 accountStatus]       │
 │                         │ [签发 JWT → cookie]       │
 │←── {user, status=30} ──│                          │
 │                         │                          │
 │ [跳转首页]               │                          │
```

**二维码状态码：**
- 10 = 待扫码（展示二维码）
- 20 = 已扫码（提示"已扫码，请在手机上确认"）
- 30 = 成功（自动登录跳转）
- 50 = 过期（展示"点击刷新"按钮）

---

## 五、前端 UI 设计

### 登录页（重写 `/login`）

- 居中卡片布局，COBALT 品牌标题
- 企业微信二维码图片（base64 渲染）
- 状态文案：等待扫码 / 已扫码确认中 / 登录成功 / 二维码已过期
- 过期后展示"刷新二维码"按钮
- 移除注册页 `/register`

### 用户管理页（新增 `/admin/users`）

- 顶部搜索栏：关键词输入 + 用户组下拉 + 状态下拉
- 用户表格：复选框、用户名、邮箱、用户组、状态（彩色圆点）、注册时间、操作按钮
- 底部批量操作栏：选中多用户后可批量修改用户组/状态/权限
- 分页导航

### 侧边栏改动

新增"用户管理"入口，仅管理员可见：
- 判断条件：`user.username in ADMIN_USERS` 或 `user.permissions?.is_admin`

### Auth Store 扩展

User 接口新增字段：username、group、permissions、accountStatus

---

## 六、权限系统

### 管理员判断

新增 `lib/admin.ts`：

```typescript
const ADMIN_USERS = (process.env.ADMIN_USERS || "").split(",").filter(Boolean);

export function isAdmin(user: {
  username?: string | null;
  permissions?: any;
}): boolean {
  if (user.username && ADMIN_USERS.includes(user.username)) return true;
  if (user.permissions?.is_admin) return true;
  return false;
}
```

### API Route 权限检查模式

```typescript
// 1. JWT 验证（middleware 已完成）
const { userId } = await getAuthUser(token);

// 2. 查 DB 获取用户详情
const user = await prisma.user.findUnique({ where: { id: userId } });

// 3. 状态检查
if (user.accountStatus !== "active") {
  return NextResponse.json({ error: "账户已禁用" }, { status: 403 });
}

// 4. 权限检查（仅管理接口）
if (!isAdmin(user)) {
  return NextResponse.json({ error: "权限不足" }, { status: 403 });
}
```

---

## 七、Middleware 改动

```typescript
const PUBLIC_PATHS = [
  "/login",
];
// 移除: /register, /api/auth/register, /api/auth/login
```

**说明：** QR 接口路径 `/api/auth/qr/*` 属于 `/api/auth/` 前缀，当前 middleware 逻辑 `!pathname.startsWith("/api/auth/")` 已自动跳过 token 检查，无需额外添加到 PUBLIC_PATHS。`/api/auth/me` 和 `/api/auth/logout` 同理。

其余逻辑不变：API 路由检查 cookie token，页面路由无 token 时重定向 `/login`。

---

## 八、环境变量

```env
# 新增
ADMIN_USERS=jingjiejie
QR_BASE_URL=https://app.corpautohome.com/newautobots/qr

# 修改
AUTH_ENABLED=true              # 开启认证
```

---

## 九、npm 依赖

```bash
npm install qrcode
npm install -D @types/qrcode
npm uninstall bcryptjs @types/bcryptjs   # 移除密码登录相关依赖
```

移除后同步清理 `lib/auth.ts` 中的 `hashPassword` 和 `verifyPassword` 函数。

---

## 十、文件变更清单

### 新建文件

| 文件 | 说明 |
|---|---|
| `app/api/auth/qr/generate/route.ts` | 二维码生成接口 |
| `app/api/auth/qr/check/route.ts` | 二维码状态轮询接口（核心登录逻辑） |
| `app/api/admin/users/route.ts` | 用户列表接口 |
| `app/api/admin/users/batch-update/route.ts` | 批量更新接口 |
| `lib/admin.ts` | 管理员权限检查 |
| `app/admin/users/page.tsx` | 用户管理页面 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `prisma/schema.prisma` | User 表扩展 |
| `middleware.ts` | PUBLIC_PATHS 调整 |
| `lib/auth.ts` | JWT payload 增加 username、email 改为可选；getAuthUser 返回类型增加 username；AUTH_ENABLED=false 匿名用户 upsert 适配新字段；删除 hashPassword/verifyPassword |
| `stores/auth-store.ts` | User 接口扩展 |
| `components/auth-provider.tsx` | /me 返回结构适配 |
| `components/sidebar.tsx` | 新增"用户管理"入口（管理员可见） |
| `app/login/page.tsx` | 整体重写为扫码登录 |
| `.env` | 新增环境变量 |

### 删除文件

| 文件 | 原因 |
|---|---|
| `app/api/auth/login/route.ts` | 移除邮箱密码登录 |
| `app/api/auth/register/route.ts` | 移除注册 |
| `app/register/page.tsx` | 移除注册页 |

### Prisma Migration

本次 User 表变更为结构性修改（字段新增、email 改为可选），需要运行：

```bash
npx prisma migrate dev --name add-qr-auth-fields
```

---

## 十一、测试要点

- 二维码生成成功，返回有效 uuid 和 base64 图片
- 二维码过期后前端展示刷新按钮，重新生成成功
- 扫码成功 → 用户 upsert 到 Prisma → JWT 签发 → cookie 设置正确
- 扫码用户缺少 username (adAccount) 时返回错误
- 被禁用用户（accountStatus != active）扫码登录被拒绝
- JWT 过期后 middleware 正确拦截 → 重定向登录页
- 管理员可访问用户列表，非管理员返回 403
- 批量更新用户组/状态/手机号/邮箱成功
- 批量更新 accountStatus 传入非法值时返回 400
- 用户列表分页、筛选（keyword/group/accountStatus）正确
- 旧 anonymous 用户数据不影响新功能
- AUTH_ENABLED=false 开发模式下匿名用户 upsert 正常（username 默认 "anonymous"）
- 外部 API 返回的用户信息中 displayName 正确映射到 name 字段
- 移除 bcryptjs 后项目编译正常
