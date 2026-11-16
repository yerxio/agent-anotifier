# 本机 WSL ntfy 部署记录

本文记录在 Windows + WSL 上为本项目搭建局域网 ntfy，并配置 anotifier 的实际步骤。下列地址和路径对应本机当前环境。

## 环境与安装位置

- Windows 登录用户：`b2014`
- WSL 发行版真实名称：`Ubuntu-24.04-D`（注意是 `24.04`，不是 `24-04`）
- WSL Linux 用户：`b2014`，家目录 `/home/b2014`
- ntfy 版本：`2.38.0`
- 安装目录：`/home/b2014/documents/programs/ntfy_2.38.0_linux_amd64/`
- 可执行文件：`/home/b2014/documents/programs/ntfy_2.38.0_linux_amd64/ntfy`
- 服务监听端口：`7667/tcp`
- 本机局域网地址（当前）：`192.168.5.5`
- ntfy topic（anotifier setup 生成）：`anotifier-ic5e5tamgl4b0wza`

> 局域网 IP 可能因 DHCP 变化。变化后需更新 anotifier 配置、手机 ntfy 服务器地址，并重新做连通性测试。

## 下载与安装

ntfy 官方 Linux amd64 发布包经 WSL HTTP 代理 `http://127.0.0.1:7890` 下载并解压到上述目录。下载包为 `ntfy_2.38.0_linux_amd64.tar.gz`。可检查：

```bash
cd ~/documents/programs/ntfy_2.38.0_linux_amd64
./ntfy --version
```

预期输出：`ntfy version 2.38.0`。本机安装的是官方静态 Linux x86-64 可执行文件，不依赖 Docker。

## 手动前台启动

```bash
cd ~/documents/programs/ntfy_2.38.0_linux_amd64
./ntfy serve --listen-http :7667
```

`serve` 是前台服务命令，关闭运行它的 WSL 终端会停止该实例。`ntfy serve` 的 `-d` 是 debug 日志选项，不是 daemon 模式。

## 后台启动脚本

WSL 脚本：

```text
/home/b2014/documents/programs/ntfy_2.38.0_linux_amd64/start-ntfy.sh
```

内容如下。它先检查 7667 是否已有服务；若没有则用 `nohup` 启动，并将日志写入 `ntfy-autostart.log`，最后检查本地端口：

```bash
#!/bin/bash
set -eu
cd /home/b2014/documents/programs/ntfy_2.38.0_linux_amd64
if ! (echo >/dev/tcp/127.0.0.1/7667) 2>/dev/null; then
  nohup ./ntfy serve --listen-http :7667 >> ntfy-autostart.log 2>&1 </dev/null &
fi
sleep 2
(echo >/dev/tcp/127.0.0.1/7667) 2>/dev/null
```

手动后台启动与检查：

```bash
~/documents/programs/ntfy_2.38.0_linux_amd64/start-ntfy.sh
pgrep -a ntfy
ss -ltnp | grep 7667
curl -I http://localhost:7667
tail -n 20 ~/documents/programs/ntfy_2.38.0_linux_amd64/ntfy-autostart.log
```

## Windows 登录后自启动

Windows 计划任务名：`ntfy WSL Ubuntu-24.04-D`，触发器是当前 Windows 用户登录（不是登录界面前的系统启动阶段）。任务运行：

```text
C:\Users\b2014\AppData\Local\ntfy-wsl-start.ps1
```

PowerShell 脚本内容：

```powershell
$ErrorActionPreference = 'Stop'
$wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
Start-Process -FilePath $wsl -ArgumentList @(
  '-d', 'Ubuntu-24.04-D', '--user', 'b2014', '--',
  '/home/b2014/documents/programs/ntfy_2.38.0_linux_amd64/start-ntfy.sh'
) -WindowStyle Hidden
```

查看任务状态：

```powershell
Get-ScheduledTask -TaskName 'ntfy WSL Ubuntu-24.04-D'
Get-ScheduledTaskInfo -TaskName 'ntfy WSL Ubuntu-24.04-D'
```

在不重启 Windows 的情况下立即运行任务：

```powershell
Start-ScheduledTask -TaskName 'ntfy WSL Ubuntu-24.04-D'
```

此任务已通过实际停止 ntfy 进程后手动触发验证：计划任务启动了新的 `ntfy` 进程，任务结果为 `0`。尚未通过 Windows 完整重启验证登录触发器。

## Windows 防火墙

已建立仅对 Private 网络开放的入站规则：`ntfy WSL LAN TCP 7667`。如需重建（管理员 PowerShell）：

```powershell
New-NetFirewallRule `
  -DisplayName "ntfy WSL LAN TCP 7667" `
  -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 7667 `
  -Profile Private
```

## anotifier 配置与手机订阅

`anotifier setup` 中选择启用 ntfy。由于本机 Windows 与 WSL 在此网络环境下使用相同的 LAN IP，Windows 端 anotifier 使用 LAN IP 回连会超时；setup 时先填本机回环地址：

```text
http://localhost:7667
```

如果此前 setup 填的是 `http://192.168.5.5:7667`，请在 `%USERPROFILE%\.anotifier\config.json` 将 `ntfy.server` 改为 `http://localhost:7667`。当前已修正，且 `anotifier test ntfy` 返回 `✓ ntfy sent`。Windows 端和手机端地址不同是预期的：电脑通过 localhost 连接 WSL，手机通过局域网 IP 连接 Windows/WSL 转发。

topic 提示处直接按 Enter，使用向导生成的：

```text
anotifier-ic5e5tamgl4b0wza
```

匿名使用统计提示选择了 `n`。向导完成后重启 Claude Code、Codex CLI、Gemini CLI 以加载 hooks。

手机与电脑连接同一 Wi-Fi，在 ntfy iOS/Android 应用中设置服务器 `http://192.168.5.5:7667`，订阅 topic `anotifier-ic5e5tamgl4b0wza`。setup 不会替手机应用自动订阅；必须在手机应用中添加服务器并订阅 topic。服务器日志 `subscribers=0` 表示目前没有活跃订阅连接。

## 连通性验证

1. WSL 内：

   ```bash
   curl -I http://localhost:7667
   ```

2. Windows PowerShell：

   ```powershell
   curl.exe -I --max-time 5 http://localhost:7667
   ```

3. 局域网设备：访问 `http://192.168.5.5:7667`，应返回 HTTP 200/显示 ntfy 页面。

4. 当前连接的 Android ADB 设备验证命令（设备内置 toybox，无 curl）：

   ```powershell
   adb shell 'printf "HEAD / HTTP/1.0\r\nHost: 192.168.5.5\r\n\r\n" | toybox nc -w 5 192.168.5.5 7667'
   ```

   本机实测收到 `HTTP/1.0 200 OK`。anotifier 配置完成后可发送测试推送：

   ```powershell
   anotifier test ntfy
   ```

PowerShell 中 `anotifier test ntfy` 显示 `✓ ntfy sent` 只确认电脑成功发布到 ntfy 服务；手机能否收到还取决于应用已连接到 LAN 地址并订阅了同一个 topic。

## 停止与排障

停止服务：

```bash
pkill -x ntfy
```

排查状态和日志：

```bash
pgrep -a ntfy
ss -ltnp | grep 7667
tail -n 50 ~/documents/programs/ntfy_2.38.0_linux_amd64/ntfy-autostart.log
```

若手机不能访问，确认 ntfy 正在监听 `*:7667`、手机和电脑在同一 Wi-Fi/子网、Windows 当前网络配置为 Private，并确认防火墙规则已启用。若 DHCP 更换电脑 IP，更新服务地址后重新测试。

## 官方资料

- [ntfy 安装文档](https://docs.ntfy.sh/install/)
- [ntfy 手机订阅说明](https://docs.ntfy.sh/subscribe/phone/)
