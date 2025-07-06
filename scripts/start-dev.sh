#!/bin/bash

# 检查并杀掉占用3000端口的进程
PORT=3000
PID=$(lsof -ti:$PORT)

if [ ! -z "$PID" ]; then
    echo "Port $PORT is in use by process $PID. Killing it..."
    kill -9 $PID
    sleep 1
fi

# 启动开发服务器
echo "Starting development server on port $PORT..."
npm run dev