# Render部署指南

## 部署步骤

### 1. 准备工作
- 确保代码已推送到GitHub仓库
- 注册Render账号：https://render.com

### 2. 创建Web Service
1. 登录Render Dashboard
2. 点击"New +" → "Web Service"
3. 连接你的GitHub账号
4. 选择super-guandan仓库
5. 填写服务配置：
   - **Name**: super-guandan（或其他名称）
   - **Region**: 选择离你最近的区域
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

### 3. 环境变量（可选）
如果需要设置环境变量，在Environment标签下添加：
- `NODE_ENV`: production

### 4. 部署
点击"Create Web Service"开始部署，等待部署完成。

### 5. 访问应用
部署成功后，Render会提供一个URL，格式如：
`https://super-guandan.onrender.com`

## 注意事项

### 免费套餐限制
- 应用会在15分钟无活动后休眠
- 首次访问需要等待30-60秒启动
- 每月750小时免费运行时间

### Socket.IO配置
服务器已配置为自动使用Render提供的端口和URL：
- 端口：通过`process.env.PORT`自动获取
- URL：通过`process.env.RENDER_EXTERNAL_URL`自动获取

### 客户端连接
客户端会自动连接到部署的服务器URL，无需额外配置。

### 查看日志
在Render Dashboard中点击你的服务，然后点击"Logs"查看实时日志。

## 常见问题

### 1. 部署失败
- 检查package.json中的依赖是否完整
- 查看Render的部署日志找出错误

### 2. WebSocket连接失败
- 确保客户端使用HTTPS连接（Render自动提供SSL）
- 检查浏览器控制台是否有CORS错误

### 3. 应用频繁休眠
- 这是免费套餐的正常行为
- 可以考虑升级到付费套餐获得持续运行

## 本地测试Render环境
```bash
# 模拟Render环境变量
PORT=3000 RENDER_EXTERNAL_URL=http://localhost:3000 npm start
```