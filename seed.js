// seed.js — 把安全备份的答题记录导入到运行中的服务（本地或 Render 均可）
// 用法:
//   node seed.js                -> 导入到 http://localhost:3000
//   TARGET_URL=https://xxx.onrender.com node seed.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const TARGET = process.env.TARGET_URL || 'http://localhost:3000';
const SAFE = path.join(__dirname, '..', 'deploy', 'data', 'quiz_records_safe.json');

if (!fs.existsSync(SAFE)) {
  console.error('找不到安全备份文件:', SAFE);
  process.exit(1);
}
const records = JSON.parse(fs.readFileSync(SAFE, 'utf8'));
console.log(`读取到 ${records.length} 条安全记录，准备导入 ${TARGET}`);

const body = JSON.stringify({ records, tracking: {} });
const url = new URL(TARGET + '/api/data/import');
const lib = url.protocol === 'https:' ? https : http;
const req = lib.request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    console.log('导入响应:', res.statusCode, data);
    if (res.statusCode === 200) console.log('✅ 记录导入成功');
    else { console.error('❌ 导入失败'); process.exit(1); }
  });
});
req.on('error', (e) => { console.error('请求错误:', e.message); process.exit(1); });
req.write(body);
req.end();
