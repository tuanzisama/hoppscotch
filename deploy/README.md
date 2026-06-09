# Hoppscotch Self-Host Deployment

此文件夹包含 Hoppscotch 的一键部署配置，已内置 GitLab SSO (OIDC) 支持。

## 快速开始

### 方式 A：从源码构建

```bash
# 1. 进入部署目录
cd deploy

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填写 DATA_ENCRYPTION_KEY

# 3. 启动
docker compose up -d

# 4. 打开 Admin Dashboard 完成初始化
# http://localhost:3100
```

### 方式 B：使用 GHCR 预构建镜像

```bash
# 1. 进入部署目录
cd deploy

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填写 DATA_ENCRYPTION_KEY

# 3. 编辑 docker-compose.ghcr.yml，将 GHCR_OWNER 改为你的 GitHub 用户名

# 4. 认证 GHCR（私有镜像需要）
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# 5. 启动
docker compose -f docker-compose.ghcr.yml up -d

# 6. 打开 Admin Dashboard
# http://localhost:3100
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `.env.example` | 环境变量模板，复制为 `.env` 后修改 |
| `docker-compose.yml` | 从源码构建，含 PostgreSQL + 自动迁移 |
| `docker-compose.ghcr.yml` | 使用 GHCR 预构建镜像，无需本地编译 |

## 服务端口

| 服务 | 端口 |
|------|------|
| Hoppscotch App | 3000 |
| Admin Dashboard | 3100 |
| Backend API | 3170 |
| WebSocket / Desktop | 3200 |

## 配置 GitLab SSO

服务启动后，通过 Admin Dashboard 完成配置：

1. 打开 `http://localhost:3100`
2. 完成 Onboarding 或进入 **Settings → Auth Providers**
3. 启用 **GitLab**，填写 OAuth 应用凭据和 OIDC 端点
4. 保存后即可在登录页看到 "Continue with GitLab" 按钮

详细说明见仓库根目录的 `GITLAB_SSO_DEPLOYMENT.md`。

## 生产部署注意事项

- 修改 `POSTGRES_PASSWORD` 为强密码
- 生成安全的 `DATA_ENCRYPTION_KEY`：`openssl rand -hex 16`
- 将 `VITE_BASE_URL` / `VITE_ADMIN_URL` / `VITE_BACKEND_*` 改为真实域名
- 配合反向代理 (Caddy/Nginx) 配置 HTTPS
- 设置 `ENABLE_SUBPATH_BASED_ACCESS=true` 可启用桌面应用支持
