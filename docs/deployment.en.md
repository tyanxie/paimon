# Deployment Guide

See [README](../README.en.md) for installation and local startup. Hub listens on `127.0.0.1:8080` by default; Edge listens on `127.0.0.1:8033`.

## Multiple Machines

Install the Paimon CLI and Pi Extension and start Edge on every machine running Pi. Hub provides the central browser entry point.

On a trusted network, start Hub and the local Edge on machine A:

```bash
paimon hub start --host 0.0.0.0
paimon edge start --hub ws://localhost:8080
```

Connect machine B using the Access Token printed when Hub starts:

```bash
paimon edge start --hub ws://<hub-ip>:8080 --token <access-token>
```

Run `pi` in a working directory on either machine, or create an instance from the Web UI. A local Edge reads the token from the Hub state file by default; a remote Edge needs an explicit token.

Keep Edge bound to loopback. The Web UI can execute Pi operations with system access, so limit remote access to trusted users. Use a TLS reverse proxy for public-network access and connect Edge with the corresponding `wss://` URL.

## Sub-paths and Reverse Proxies

For an nginx deployment under `/paimon/`, start Hub on the proxy machine:

```bash
paimon hub start --base-path /paimon
```

Add the following configuration to an nginx `server` that provides HTTPS:

```nginx
location /paimon/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Visit `https://<domain>/paimon/`. Edge connections through this proxy use a Hub URL containing the sub-path:

```bash
paimon edge start --hub wss://<domain>/paimon --token <access-token>
```

## Proxy Authentication and Automatic Login

When the proxy already provides authentication such as SSO, configure the same token in Hub and nginx:

```bash
paimon hub start --base-path /paimon --token <access-token>
```

Add this header inside the nginx `location` block above:

```nginx
proxy_set_header Authorization "Bearer <access-token>";
```

The browser logs in automatically after proxy authentication. Protect the entire `/paimon/` path and allow access only to trusted users. Edge must also meet the proxy's access requirements.

## Service Management

Hub and Edge commands support `start`, `stop`, `restart` and `status`. Use `restart` to change configuration; see `paimon hub --help` and `paimon edge --help` for options.
