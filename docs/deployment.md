# 部署指南

安装与本机启动见 [README](../README.md)。Hub 默认监听 `127.0.0.1:8080`，Edge 默认监听 `127.0.0.1:8033`。

## 多机部署

每台运行 Pi 的机器都需要安装 Paimon CLI 和 Pi Extension，并启动 Edge。Hub 集中提供浏览器入口。

在可信网络中，机器 A 启动 Hub 和本机 Edge：

```bash
paimon hub start --host 0.0.0.0
paimon edge start --hub ws://localhost:8080
```

机器 B 使用 Hub 启动时输出的 Access Token 连接：

```bash
paimon edge start --hub ws://<hub-ip>:8080 --token <access-token>
```

两台机器都可以在工作目录执行 `pi`，或从页面创建实例。本机 Edge 默认从 Hub 状态文件读取 token，远程 Edge 需要显式提供 token。

Edge 保持 loopback 监听。Web 可以执行具有系统访问权限的 Pi 操作，远程访问仅向可信用户开放；公共网络访问通过反向代理提供 TLS，Edge 使用对应的 `wss://` 地址连接。

## 子路径与反向代理

以 nginx 的 `/paimon/` 子路径为例，在代理所在机器启动 Hub：

```bash
paimon hub start --base-path /paimon
```

在提供 HTTPS 的 nginx `server` 中配置：

```nginx
location /paimon/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

浏览器访问 `https://<域名>/paimon/`。通过此代理连接的 Edge 使用包含子路径的 Hub 地址：

```bash
paimon edge start --hub wss://<域名>/paimon --token <access-token>
```

## 代理认证与自动登录

代理已经配置 SSO 等认证时，使用相同的 token 配置 Hub 和 nginx：

```bash
paimon hub start --base-path /paimon --token <access-token>
```

在上述 nginx `location` 中增加：

```nginx
proxy_set_header Authorization "Bearer <access-token>";
```

浏览器通过代理认证后自动登录。代理认证应保护整个 `/paimon/` 路径，仅向可信用户开放；Edge 同样需要满足代理的访问条件。

## 服务管理

Hub 和 Edge 命令支持 `start`、`stop`、`restart`、`status`。修改配置时使用 `restart`，具体参数查看 `paimon hub --help` 和 `paimon edge --help`。
