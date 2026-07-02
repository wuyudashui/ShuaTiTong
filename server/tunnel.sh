#!/bin/bash
# 启动刷题通后端 + 内网穿透隧道
# 手机端通过生成的公网地址访问

echo "🚀 启动刷题通后端服务..."
node "$(dirname "$0")/index.js" &
SERVER_PID=$!
sleep 2

echo "🔗 启动内网穿透隧道..."
npx localtunnel --port 3001 &
TUNNEL_PID=$!
sleep 4

echo ""
echo "========================================"
echo "  手机端同步地址："
echo "  打开刷题通 → 开发者模式 → 同步"
echo "  服务器地址填上面那个 https:// 地址"
echo "  用户名 root  密码 linux"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止服务"

# Wait for either process
trap "kill $SERVER_PID $TUNNEL_PID 2>/dev/null; exit" INT TERM
wait
