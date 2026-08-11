const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));

// ============ Hot-update static files (bypass rebuild queue) ============
app.put('/api/static', (req, res) => {
  try {
    const { file, content } = req.body;
    if (!file || content === undefined) return res.status(400).json({ error: 'file and content required' });
    const fullPath = path.join(PUBLIC_DIR, file);
    if (!fullPath.startsWith(PUBLIC_DIR)) return res.status(403).json({ error: 'Only public/ allowed' });
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Hot-updated:', file);
    res.json({ ok: true, file });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ Full data export/import (backup before deploy / restore after) ============
app.get('/api/data/export', (req, res) => {
  try {
    const data = store.getQuiz();
    res.json({ records: data.records, tracking: data.tracking });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/data/import', async (req, res) => {
  try {
    const { records, tracking } = req.body;
    const data = store.getQuiz();
    if (Array.isArray(records)) {
      const existingIds = new Set(data.records.map(r => r.id));
      for (const r of records) {
        if (!existingIds.has(r.id)) data.records.push(r);
      }
    }
    if (tracking && typeof tracking === 'object') {
      data.tracking = { ...data.tracking, ...tracking };
    }
    await store.persistQuiz();
    console.log(`Data imported: ${records?.length || 0} records`);
    res.json({ ok: true, count: data.records.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ API: Records ============
app.get('/api/records', (req, res) => {
  try { res.json(store.getQuiz().records); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/records', async (req, res) => {
  try {
    const data = store.getQuiz();
    const record = req.body;
    if (!record.id) record.id = 'record_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    data.records.push(record);
    await store.persistQuiz();
    res.json({ success: true, record });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/records/:id', async (req, res) => {
  try {
    const data = store.getQuiz();
    const idx = data.records.findIndex(r => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    Object.assign(data.records[idx], req.body);
    await store.persistQuiz();
    res.json({ success: true, record: data.records[idx] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/records/:id', async (req, res) => {
  try {
    const data = store.getQuiz();
    data.records = data.records.filter(r => r.id !== req.params.id);
    await store.persistQuiz();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ============ API: Tracking ============
app.get('/api/tracking', (req, res) => {
  try { res.json(store.getQuiz().tracking); }
  catch (e) { res.json({}); }
});

app.get('/api/tracking/:pid', async (req, res) => {
  try {
    const data = store.getQuiz();
    const key = (req.query.name || '') + '_' + req.params.pid;
    if (!data.tracking[key]) {
      data.tracking[key] = { seenIds: [], lastSeenIds: [] };
      await store.persistQuiz();
    }
    res.json(data.tracking[key]);
  } catch (e) { res.json({ seenIds: [], lastSeenIds: [] }); }
});

app.post('/api/tracking/:pid', async (req, res) => {
  try {
    const data = store.getQuiz();
    const key = (req.body.name || '') + '_' + req.params.pid;
    data.tracking[key] = { seenIds: req.body.seenIds || [], lastSeenIds: req.body.lastSeenIds || [] };
    await store.persistQuiz();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/tracking/:pid/reset', async (req, res) => {
  try {
    const data = store.getQuiz();
    const key = (req.body.name || '') + '_' + req.params.pid;
    data.tracking[key] = { seenIds: [], lastSeenIds: [] };
    await store.persistQuiz();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/users', (req, res) => {
  try {
    const names = [...new Set(store.getQuiz().records.map(r => r.name))];
    res.json(names);
  } catch (e) { res.json([]); }
});

app.get('/api/health', (req, res) => {
  const data = store.getQuiz();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: store.isPg() ? 'postgres' : 'file',
    recordCount: (data.records || []).length,
  });
});

// ============ API: Questions ============
app.get('/api/questions', (req, res) => {
  try { res.json(store.readQuestions()); }
  catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/questions', (req, res) => {
  try {
    store.writeQuestions(req.body);
    console.log('Questions updated successfully');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/questions/:product', (req, res) => {
  try {
    const qs = store.readQuestions();
    qs[req.params.product] = req.body;
    store.writeQuestions(qs);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/questions/:product', (req, res) => {
  try {
    const qs = store.readQuestions();
    if (!qs[req.params.product]) return res.status(404).json({ error: 'Product not found' });
    const { type, question } = req.body;
    qs[req.params.product].pool[type].push(question);
    store.writeQuestions(qs);
    res.json({ success: true, question });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/questions/:product/:qid', (req, res) => {
  try {
    const qs = store.readQuestions();
    const prod = qs[req.params.product];
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    let found = false;
    for (const type of ['single', 'multi', 'judge', 'short']) {
      const idx = prod.pool[type].findIndex(q => q.id === req.params.qid);
      if (idx >= 0) {
        prod.pool[type][idx] = { ...prod.pool[type][idx], ...req.body };
        found = true;
        break;
      }
    }
    if (!found) return res.status(404).json({ error: 'Question not found' });
    store.writeQuestions(qs);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/questions/:product/:qid', (req, res) => {
  try {
    const qs = store.readQuestions();
    const prod = qs[req.params.product];
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    let found = false;
    for (const type of ['single', 'multi', 'judge', 'short']) {
      const len = prod.pool[type].length;
      prod.pool[type] = prod.pool[type].filter(q => q.id !== req.params.qid);
      if (prod.pool[type].length < len) { found = true; break; }
    }
    if (!found) return res.status(404).json({ error: 'Question not found' });
    store.writeQuestions(qs);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ============ API: Subscribe ============
app.get('/api/subscribe', (req, res) => {
  try { res.json(store.getSubs()); }
  catch (e) { res.json([]); }
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const { name, email, types, time } = req.body;
    if (!name || !email) return res.status(400).json({ error: '姓名和邮箱必填' });
    const subs = store.getSubs();
    const exists = subs.find(s => s.email === email);
    if (exists) {
      Object.assign(exists, { name, types, time, updatedAt: new Date().toISOString() });
    } else {
      subs.push({ name, email, types, time, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    await store.persistSubs();
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/subscribe/:email', async (req, res) => {
  try {
    let subs = store.getSubs();
    const before = subs.length;
    subs = subs.filter(s => s.email !== decodeURIComponent(req.params.email));
    if (subs.length === before) return res.status(404).json({ error: 'Not found' });
    await store.persistSubs();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ============ Start (load storage before accepting traffic) ============
store.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Quiz server started on port ${PORT} (storage: ${store.isPg() ? 'postgres' : 'file'})`);
  });
}).catch((e) => {
  console.error('Storage init failed:', e);
  process.exit(1);
});
