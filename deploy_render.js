// deploy_render.js — 用 Render API 一键创建 Blueprint(Web服务 + Postgres) 并等待上线
// 用法:
//   RENDER_API_KEY=xxx REPO_URL=https://github.com/<你>/<仓库> node deploy_render.js
// 前置: 1) 代码已推到 REPO_URL 的根目录(render.yaml 在根)  2) 你的 GitHub 已在 Render 账号里授权连接
const API = 'https://api.render.com/v1';
const token = process.env.RENDER_API_KEY;
const repo = process.env.REPO_URL;
const BLUEPRINT_NAME = 'hidynamic-training-quiz';

if (!token || !repo) {
  console.error('用法: RENDER_API_KEY=xxx REPO_URL=https://github.com/<你>/<仓库> node deploy_render.js');
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) { console.error('API 错误', res.status, JSON.stringify(json)); throw new Error('API ' + res.status); }
  return json;
}

function findUrl(svc) {
  return svc?.serviceDetails?.url || svc?.url || (svc?.service?.serviceDetails?.url) || null;
}

(async () => {
  console.log('→ 从', repo, '创建 Blueprint ...');
  let bp;
  try {
    bp = await api('/blueprints', {
      method: 'POST',
      body: JSON.stringify({ name: BLUEPRINT_NAME, repo, branch: 'master', autoDeploy: 'yes' }),
    });
  } catch (e) {
    console.error('蓝图创建失败。请确认：① 代码已推到仓库根目录 ② GitHub 已在 Render 账号中授权连接 ③ Token 有效。');
    process.exit(1);
  }
  console.log('✅ Blueprint 已创建:', bp.id || JSON.stringify(bp).slice(0, 200));

  let url = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    let list;
    try { list = await api('/services?limit=100'); } catch { continue; }
    const arr = Array.isArray(list) ? list : (list.results || []);
    const svc = arr.find((s) => s.name === BLUEPRINT_NAME) || arr.find((s) => (s.name || '').includes('hidynamic'));
    if (svc) {
      const status = svc.status || svc.state;
      url = findUrl(svc);
      console.log(`[${i}] status=${status} url=${url || '(构建中)'}`);
      if (url && (status === 'live' || status === 'available')) break;
    } else {
      console.log(`[${i}] 服务尚未出现，等待...`);
    }
  }

  if (url) {
    console.log('SERVICE_URL=' + url);
    console.log('下一步: TARGET_URL=' + url + ' node seed.js   （导入6条安全记录）');
    console.log('健康检查: ' + url + '/api/health');
  } else {
    console.log('服务还没就绪，请到 Render 控制台查看构建日志。');
  }
})();
