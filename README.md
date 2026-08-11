# 嗨动新人培训 · 在线答题系统（Render.com 免费版）

从 CloudBase 迁移到 **Render.com 免费版**：Web 服务免费（750 小时/月，不绑卡）+ 免费 Postgres 做数据持久化，彻底解决 CloudBase「容器文件系统临时、一部署就丢数据」的问题。

## 架构
- `server.js` (Express) + `store.js`(存储层)
- 生产环境：有 `DATABASE_URL` 时，**Postgres 为唯一真相源**（部署/重启数据不丢）
- 本地/未配置 DB：自动回退到 `data/quiz-data.json` 文件（行为和以前一致，便于本地调试）
- 前端 `index.html` 已改为相对路径，自动适配任意域名

## 一键部署（Render Blueprint）
1. 把本目录推送到你的 GitHub 仓库（默认分支 `main`）：
   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 打开一键部署链接（把下面 URL 的仓库换成你的）：
   ```
   https://render.com/deploy?repo=https://github.com/<你的用户名>/<仓库名>
   ```
3. 登录 Render（免费，无需信用卡）→ 点击 Create → 等待 1~2 分钟构建完成。
   - 蓝图会自动创建：① 免费 Postgres（`quiz-db`）② 免费 Web 服务（`hidynamic-quiz`），并把 `DATABASE_URL` 注入 Web 服务。
4. 部署完成后拿到 `https://hidynamic-quiz.onrender.com`，导入历史记录：
   ```bash
   TARGET_URL=https://hidynamic-quiz.onrender.com node seed.js
   ```

## 重要说明
- **冷启动**：Render 免费版空闲 15 分钟后会休眠，首个访问者需等 ~10–30 秒唤醒，属正常现象。
- **免费 Postgres 有效期**：Render 免费 Postgres 实例 90 天后会被自动删除。数据重要，建议每 90 天用下面的备份命令导出一次（或换用 Neon/Supabase 免费库，连接串填到 `DATABASE_URL` 即可）。
- **备份 / 恢复**：
  ```bash
  # 备份（导出当前所有记录到本地 JSON）
  curl https://hidynamic-quiz.onrender.com/api/data/export -o backup.json
  # 恢复
  TARGET_URL=https://hidynamic-quiz.onrender.com node seed.js   # 或 POST backup.json 到 /api/data/import
  ```
- **验证健康**：访问 `https://hidynamic-quiz.onrender.com/api/health`，返回 `db:"postgres"` 即表示持久化已生效。

## 本地运行
```bash
npm install
node server.js          # 默认 3000 端口，文件模式
# 或连本地 Postgres 测试生产路径：
# DATABASE_URL=postgres://user:pass@localhost:5432/quizdb node server.js
```
