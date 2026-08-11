// store.js — dual-mode persistence:
//  - When DATABASE_URL is set (Render production): Postgres is the source of truth (survives deploys/restarts).
//  - Otherwise (local dev): file-based JSON in data/ (behavior identical to before).
// Reads are served from an in-memory cache (sync). Writes update the cache, flush to file (backup),
// and await Postgres so data is durable before the response returns.

const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const USE_PG = !!DATABASE_URL;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const QUIZ_FILE = path.join(DATA_DIR, 'quiz-data.json');
const SUB_FILE = path.join(DATA_DIR, 'subscriptions.json');
const QUESTION_FILE = path.join(DATA_DIR, 'questions.json');

let pool = null;
let pgReady = false;

if (USE_PG) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    pool.query('SELECT 1')
      .then(() => { pgReady = true; console.log('[store] Postgres connected'); })
      .catch((e) => console.error('[store] Postgres connect error:', e.message));
    pool.query('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value JSONB NOT NULL)')
      .then(() => console.log('[store] kv table ready'))
      .catch((e) => console.error('[store] kv table create error:', e.message));
  } catch (e) {
    console.error('[store] pg init failed:', e.message);
  }
}

const cache = {
  quizdata: { records: [], tracking: {} },
  subscriptions: [],
};

async function init() {
  // Seed from file fallback first (so local dev & first boot work even without DB).
  try {
    const raw = fs.readFileSync(QUIZ_FILE, 'utf8');
    cache.quizdata = JSON.parse(raw);
  } catch (_) { /* no file yet */ }
  try {
    const raw = fs.readFileSync(SUB_FILE, 'utf8');
    cache.subscriptions = JSON.parse(raw);
  } catch (_) { /* no file yet */ }

  if (USE_PG && pool) {
    try {
      const q = await pool.query('SELECT value FROM kv WHERE key=$1', ['quizdata']);
      if (q.rows.length) cache.quizdata = q.rows[0].value;
      const s = await pool.query('SELECT value FROM kv WHERE key=$1', ['subscriptions']);
      if (s.rows.length) cache.subscriptions = s.rows[0].value;
      pgReady = true;
      console.log('[store] loaded from Postgres; records =', (cache.quizdata.records || []).length);
    } catch (e) {
      console.error('[store] Postgres load error (falling back to file):', e.message);
    }
  }
  return cache;
}

const getQuiz = () => cache.quizdata;
const getSubs = () => cache.subscriptions;
const isPg = () => USE_PG && pgReady;

async function persistQuiz() {
  // File backup (always)
  try { fs.writeFileSync(QUIZ_FILE, JSON.stringify(cache.quizdata, null, 2)); }
  catch (e) { console.error('[store] file write quiz err:', e.message); }
  // Postgres is source of truth in production — await so the write is durable.
  if (USE_PG && pgReady) {
    try {
      await pool.query(
        'INSERT INTO kv(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
        ['quizdata', JSON.stringify(cache.quizdata)]
      );
    } catch (e) {
      console.error('[store] pg persist quiz err (will retry on next write):', e.message);
    }
  }
}

async function persistSubs() {
  try { fs.writeFileSync(SUB_FILE, JSON.stringify(cache.subscriptions, null, 2)); }
  catch (e) { console.error('[store] file write subs err:', e.message); }
  if (USE_PG && pgReady) {
    try {
      await pool.query(
        'INSERT INTO kv(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
        ['subscriptions', JSON.stringify(cache.subscriptions)]
      );
    } catch (e) {
      console.error('[store] pg persist subs err:', e.message);
    }
  }
}

// Questions are static config — served from the committed file (no DB needed).
function readQuestions() {
  try { return JSON.parse(fs.readFileSync(QUESTION_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function writeQuestions(qs) {
  fs.writeFileSync(QUESTION_FILE, JSON.stringify(qs, null, 2), 'utf8');
}

module.exports = {
  init, getQuiz, getSubs, persistQuiz, persistSubs,
  readQuestions, writeQuestions, isPg,
};
