# GitLab SSO (OIDC) 部署指南

本文档说明如何部署包含 GitLab OIDC SSO 支持的 Hoppscotch 实例，并在 Admin Dashboard 中完成 GitLab 登录的配置。

---

## 1. 前提条件

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Docker | 20.10+ | 构建与运行容器 |
| Docker Compose | v2+ | 编排服务 |
| Git | 2.x+ | 克隆仓库 |
| pnpm | 10.33.4 | 仅源码构建时需要，Docker 构建已内置 |
| PostgreSQL | 15+ | 使用外部 DB 时需要 |
| GitLab 实例 | 13.0+ | 自建 GitLab CE/EE 或 gitlab.com 均可 |

---

## 2. 获取 Docker 镜像

有两种方式获取镜像：直接从 GHCR 拉取预构建镜像，或从源码自行构建。

### 2.1 从 GHCR 拉取（推荐）

项目通过 GitHub Actions 自动构建并推送多架构镜像到 GitHub Container Registry。

**可用镜像：**

| 镜像 | 说明 |
|------|------|
| `ghcr.io/<owner>/hoppscotch-aio` | 全量 AIO（推荐） |
| `ghcr.io/<owner>/hoppscotch-backend` | 仅后端 |
| `ghcr.io/<owner>/hoppscotch-app` | 仅前端 |
| `ghcr.io/<owner>/hoppscotch-sh-admin` | 仅 Admin Dashboard |

> 将 `<owner>` 替换为你的 GitHub 用户名或组织名。

```bash
# 拉取 AIO 镜像（支持 amd64 + arm64）
docker pull ghcr.io/<owner>/hoppscotch-aio:latest
```

**GHCR 认证（私有仓库需要）：**

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin
```

### 2.2 从源码构建

#### 克隆仓库

```bash
git clone https://github.com/hoppscotch/hoppscotch.git
cd hoppscotch
```

#### 选择构建目标

使用项目根目录的 `prod.Dockerfile`，通过 `--target` 选择不同构建目标：

| Target | 包含的服务 | 适用场景 |
|--------|-----------|---------|
| `aio` | Backend + App + Admin (单容器) | 最常见，推荐 |
| `backend` | 仅 Backend | 独立部署后端 |
| `app` | 仅前端 App | 独立部署前端 |
| `sh_admin` | 仅 Admin Dashboard | 独立部署管理面板 |

**推荐：AIO 全量构建**

```bash
docker build -f prod.Dockerfile --target aio -t hoppscotch:gitlab-sso .
```

---

## 3. 配置环境变量

### 3.1 创建 `.env` 文件

```bash
cp .env.example .env
```

### 3.2 必填配置

编辑 `.env`，确保以下变量正确设置：

```bash
# PostgreSQL 连接（使用内置 DB 时保持默认）
DATABASE_URL=postgresql://postgres:testpass@hoppscotch-db:5432/hoppscotch

# 数据加密密钥（必须 32 字符，生产环境请更换）
DATA_ENCRYPTION_KEY=<你的32位加密密钥>

# CORS 白名单
WHITELISTED_ORIGINS=https://your-domain.com,https://admin.your-domain.com

# 前端 URL
VITE_BASE_URL=https://your-domain.com
VITE_ADMIN_URL=https://admin.your-domain.com

# 后端 URL
VITE_BACKEND_GQL_URL=https://your-domain.com/graphql
VITE_BACKEND_WS_URL=wss://your-domain.com/graphql
VITE_BACKEND_API_URL=https://your-domain.com/v1
```

> **注意**：GitLab SSO 的 8 个配置项（`GITLAB_CLIENT_ID` 等）**不需要**写在 `.env` 中，它们通过 Admin Dashboard 写入数据库 (`infra_config` 表)，后端启动时自动加载。

---

## 4. 启动服务

### 4.1 使用 GHCR 预构建镜像

创建 `docker-compose.ghcr.yml`：

```yaml
services:
  hoppscotch-aio:
    container_name: hoppscotch-aio
    restart: unless-stopped
    image: ghcr.io/<owner>/hoppscotch-aio:latest
    env_file:
      - ./.env
    depends_on:
      hoppscotch-db:
        condition: service_healthy
    ports:
      - "3000:3000"
      - "3100:3100"
      - "3170:3170"
      - "3200:3200"

  hoppscotch-db:
    image: postgres:15
    container_name: hoppscotch-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: hoppscotch
    volumes:
      - hoppscotch-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d hoppscotch"]
      interval: 5s
      timeout: 5s
      retries: 10

  hoppscotch-migrate:
    image: ghcr.io/<owner>/hoppscotch-backend:latest
    env_file:
      - ./.env
    depends_on:
      hoppscotch-db:
        condition: service_healthy
    command: sh -c "pnpm exec prisma migrate deploy"

volumes:
  hoppscotch-db-data:
```

```bash
# 认证 GHCR（私有仓库需要）
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# 启动
docker compose -f docker-compose.ghcr.yml up -d
```

### 4.2 从源码构建启动（AIO 模式）

```bash
docker compose --profile default up -d
```

此命令启动：
- `hoppscotch-aio`：全部服务 (端口 3000/3100/3170)
- `hoppscotch-db`：PostgreSQL 15
- `hoppscotch-migrate`：自动执行 Prisma 数据库迁移

### 4.3 无内置数据库模式

如果你使用外部 PostgreSQL：

```bash
docker compose --profile default-no-db up -d
```

确保 `.env` 中的 `DATABASE_URL` 指向你的外部数据库。

### 4.4 分离部署模式

```bash
# 仅后端
docker compose --profile backend up -d

# 仅前端
docker compose --profile app up -d

# 仅 Admin
docker compose --profile admin up -d
```

### 4.5 验证服务状态

```bash
# 检查容器运行状态
docker compose ps

# 检查后端健康
curl -f http://localhost:3170/v1/health

# 检查前端
curl -f http://localhost:3000
```

---

## 5. 配置 GitLab SSO

服务启动后，通过 Admin Dashboard 配置 GitLab OIDC 登录。

### 5.1 在 GitLab 上创建 OAuth 应用

1. 登录你的 GitLab 实例（自建或 gitlab.com）
2. 进入 **Admin Area → Applications → New Application**（自建）或 **Settings → Applications**（gitlab.com 个人版）
3. 填写：

| 字段 | 值 |
|------|-----|
| Name | `Hoppscotch` |
| Redirect URI | `https://your-domain.com/v1/auth/gitlab/callback` |
| Scopes | `openid`, `profile`, `email`（至少勾选 `openid`） |
| Confidential | 是 |

4. 保存后获得 **Application ID** (Client ID) 和 **Secret** (Client Secret)

### 5.2 获取 OIDC 端点

**gitlab.com：**

| 配置项 | 值 |
|--------|-----|
| Issuer | `https://gitlab.com` |
| Authorization URL | `https://gitlab.com/oauth/authorize` |
| Token URL | `https://gitlab.com/oauth/token` |
| Userinfo URL | `https://gitlab.com/oauth/userinfo` |
| Scope | `openid,profile,email` |

**自建 GitLab（替换 `gitlab.example.com`）：**

| 配置项 | 值 |
|--------|-----|
| Issuer | `https://gitlab.example.com` |
| Authorization URL | `https://gitlab.example.com/oauth/authorize` |
| Token URL | `https://gitlab.example.com/oauth/token` |
| Userinfo URL | `https://gitlab.example.com/oauth/userinfo` |
| Scope | `openid,profile,email` |

> 自建 GitLab 可通过 `https://gitlab.example.com/.well-known/openid-configuration` 查看完整 OIDC 发现文档。

### 5.3 在 Admin Dashboard 中配置

1. 打开 `https://admin.your-domain.com`（默认端口 3100）
2. 完成 Onboarding（首次启动）或进入 **Settings → Auth Providers**
3. 找到 **GitLab** 卡片，点击开关启用
4. 填写以下字段：

| Admin 字段 | 对应配置 | 说明 |
|------------|---------|------|
| Client ID | `GITLAB_CLIENT_ID` | GitLab Application ID |
| Client Secret | `GITLAB_CLIENT_SECRET` | GitLab Secret |
| Callback URL | `GITLAB_CALLBACK_URL` | 自动生成，无需手动填写 |
| Scope | `GITLAB_SCOPE` | `openid,profile,email`（逗号分隔） |
| Issuer | `GITLAB_ISSUER` | GitLab 实例的 Issuer URL |
| Authorization URL | `GITLAB_AUTHORIZATION_URL` | OAuth 授权端点 |
| Token URL | `GITLAB_TOKEN_URL` | Token 交换端点 |
| Userinfo URL | `GITLAB_USERINFO_URL` | 用户信息端点 |

5. 点击 **Save** 保存

保存后后端会自动校验配置完整性。如果所有必填项均有值，GitLab 会被加入 `VITE_ALLOWED_AUTH_PROVIDERS`，服务会重启以加载 `GitlabStrategy`。

### 5.4 验证 GitLab 登录

1. 访问 `https://your-domain.com`
2. 点击登录，应该能看到 **"Continue with GitLab"** 按钮
3. 点击后跳转到 GitLab 授权页面
4. 授权后跳转回 Hoppscotch 并自动登录

---

## 6. 配置参数参考

### 6.1 GitLab SSO 配置项

| InfraConfig Key | 加密 | 必填 | 默认值 | 说明 |
|-----------------|------|------|--------|------|
| `GITLAB_CLIENT_ID` | 是 | 是 | null | GitLab OAuth Application ID |
| `GITLAB_CLIENT_SECRET` | 是 | 是 | null | GitLAB OAuth Secret |
| `GITLAB_CALLBACK_URL` | 否 | 是 | 自动生成 | 回调地址，通常自动设置 |
| `GITLAB_SCOPE` | 否 | 是 | null | 逗号分隔的 OIDC scope |
| `GITLAB_ISSUER` | 否 | 是 | null | OIDC Issuer 标识 |
| `GITLAB_AUTHORIZATION_URL` | 否 | 是 | null | OAuth 授权端点 |
| `GITLAB_TOKEN_URL` | 否 | 是 | null | Token 交换端点 |
| `GITLAB_USERINFO_URL` | 否 | 是 | null | 用户信息端点 |

### 6.2 Callback URL 自愈机制

后端在启动时会检查 `VITE_BACKEND_API_URL` 是否与 `GITLAB_CALLBACK_URL` 匹配。如果不匹配（例如你更换了域名），后端会自动将 Callback URL 更新为：

```
{VITE_BACKEND_API_URL}/auth/gitlab/callback
```

因此你通常不需要手动设置 Callback URL。

---

## 7. 故障排查

### 7.1 GitLab 登录按钮未出现

- 检查 Admin Dashboard 中 GitLab 是否已启用
- 检查所有 8 个 GitLab 配置项是否填写了有效值（非空）
- 检查后端日志：`docker logs hoppscotch-aio 2>&1 | grep -i gitlab`

### 7.2 跳转 GitLab 后报错

- 确认 GitLab OAuth 应用的 **Redirect URI** 与 `GITLAB_CALLBACK_URL` 完全一致
- 确认 Client ID 和 Secret 正确
- 确认 Scope 中包含 `openid`

### 7.3 GitLab 授权后跳转失败

- 检查 `VITE_BACKEND_API_URL` 是否可从用户浏览器访问
- 检查 `WHITELISTED_ORIGINS` 是否包含前端域名
- 如果使用反向代理，确保 `X-Forwarded-Proto` 头正确传递（影响 Cookie Secure 标志）

### 7.4 后端启动报 `AUTH_PROVIDER_NOT_SPECIFIED`

这表示 GitLab 被加入 `VITE_ALLOWED_AUTH_PROVIDERS` 但配置不完整。后端会自动从允许列表中移除配置不完整的 provider 并重启。

### 7.5 Cookie / State 验证失败

GitLab Strategy 使用独立的 State Store Cookie（名称为 `{SESSION_COOKIE_NAME}_gitlab`，默认 `__oauth_nonce_gitlab`）。如果使用了自定义 `SESSION_COOKIE_NAME`，确保：

- Cookie 名称不超过浏览器限制
- 如果使用 HTTPS，`ALLOW_SECURE_COOKIES` 应为 `true`

### 7.6 查看后端日志

```bash
# AIO 模式
docker logs -f hoppscotch-aio 2>&1 | grep -iE "gitlab|oidc|auth"

# 分离模式
docker logs -f hoppscotch-backend 2>&1 | grep -iE "gitlab|oidc|auth"
```

---

## 8. 升级注意事项

从不含 GitLab SSO 的版本升级时：

1. **数据库迁移**：新版本会增加 `infra_config` 表中的 8 个 `GITLAB_*` 条目，后端启动时自动 upsert，无需手动执行 SQL
2. **前端重新构建**：`hoppscotch-common` 和 `hoppscotch-sh-admin` 需要重新构建以包含 GitLab 登录按钮和 Admin 表单
3. **GraphQL Schema**：后端新增的 `GITLAB_*` InfraConfigEnum 值需要重新生成 GraphQL schema 并更新 Admin 的 codegen 输出

```bash
# 重新生成 GraphQL schema
pnpm gen-gql

# 重新构建
docker build -f prod.Dockerfile --target aio -t hoppscotch:gitlab-sso .

# 重启服务
docker compose --profile default down
docker compose --profile default up -d
```

---

## 9. 与其他 SSO 提供商共存

GitLab SSO 与现有的 Google、GitHub、Microsoft SSO 完全兼容，可同时启用。每个 provider 使用独立的：

- Strategy 名称（`google`/`github`/`microsoft`/`gitlab`）
- Auth Guard
- State Store Cookie（通过 `_gitlab` 后缀区分）
- OAuth 路由（`/auth/gitlab`、`/auth/gitlab/callback`）

用户首次通过 GitLab 登录时：

1. 系统根据 GitLab 返回的 email 查找已有用户
2. 如果该 email 已存在（通过其他 SSO 注册），自动关联 GitLab provider 账号
3. 如果该 email 不存在，自动创建新用户

---

## 10. CI/CD — GitHub Actions 推送 GHCR

项目已包含 `.github/workflows/push-ghcr.yml` 工作流，用于自动构建并推送多架构镜像到 GHCR。

### 10.1 触发方式

| 触发条件 | 说明 |
|----------|------|
| 推送 `*.*.*` 格式的 tag | 自动构建并以 tag 名作为镜像版本号 |
| 手动触发 (workflow_dispatch) | 可选填自定义 tag |

### 10.2 构建流程

1. **并行构建**：4 个 target (aio/backend/app/sh-admin) x 2 个架构 (amd64/arm64) = 8 个并行任务
2. **多架构支持**：使用 QEMU + Buildx 构建 `linux/amd64` 和 `linux/arm64`
3. **Digest 合并**：每个 target 的两个架构 digest 通过 `docker buildx imagetools` 合并为多架构 manifest
4. **双标签推送**：每次构建同时推送 `{tag}` 和 `latest` 标签

### 10.3 产出镜像

| 镜像名 | Target |
|--------|--------|
| `ghcr.io/<owner>/hoppscotch-aio` | aio |
| `ghcr.io/<owner>/hoppscotch-backend` | backend |
| `ghcr.io/<owner>/hoppscotch-app` | app |
| `ghcr.io/<owner>/hoppscotch-sh-admin` | sh-admin |

### 10.4 前置配置

1. 确保仓库的 GitHub Packages 可见性设置为 **Public**（或根据需要设为 Internal/Private）
2. `GITHUB_TOKEN` 由 GitHub Actions 自动注入，默认有 GHCR 读写权限
3. 如果仓库是 **Private**，需要在仓库 Settings → Actions → General 中确认 "Workflow permissions" 为 "Read and write"

### 10.5 发布新版本

```bash
# 打 tag 触发自动构建
git tag 2026.6.0
git push origin 2026.6.0

# 或手动触发（GitHub 网页端 → Actions → Build & Push to GHCR → Run workflow）
```

### 10.6 在服务器上拉取更新

```bash
# 认证 GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# 拉取最新镜像
docker compose -f docker-compose.ghcr.yml pull

# 重启服务（自动使用新镜像）
docker compose -f docker-compose.ghcr.yml up -d
```
