# 连接问题分析

## 主要断开连接原因
1. **心跳检测超时** - 服务器10秒心跳，5秒超时
2. **临时修复问题** - 客户端清除localStorage导致无法重连
3. **网络不稳定** - WiFi信号、防火墙、移动网络切换
4. **浏览器限制** - 标签页挂起、省电模式

## 解决方案
- 调整心跳参数 (pingInterval/pingTimeout)
- 恢复uniquePlayerId存储机制
- 优化重连策略
- 添加网络质量检测

## 相关文件
- `server/server.js:10-29` - Socket.IO配置
- `client/main.js:213-229` - 客户端连接配置
- `client/main.js:233` - 临时修复代码位置