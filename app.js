/* ══════════════════════════════════════════════════════════════
   FitSystem  app.js  v1.0.0
   Chetan's adaptive fitness coaching system.
   Vanilla JS — no frameworks — Netlify-ready PWA.
══════════════════════════════════════════════════════════════ */

/* ─── VERSIONING ────────────────────────────────────────────── */
const APP_VERSION = '1.0.0';
console.log(`[FitSystem] v${APP_VERSION} loaded`);

/* ─── API CONFIGURATION ─────────────────────────────────────── */
/*
 * All AI calls route through /.netlify/functions/ai (netlify/functions/ai.js).
 * The real Anthropic API key lives ONLY in Netlify environment variables —
 * it is never exposed to the browser.
 *
 * To run locally:  netlify dev  (reads .env automatically)
 * To deploy:       set ANTHROPIC_API_KEY in Netlify dashboard
 *                  → Site configuration → Environment variables → Add variable
 */
const API_ENDPOINT      = '/.netlify/functions/ai';
const ANTHROPIC_VERSION = '2023-06-01'; // kept for reference only

/* ─── STORAGE KEYS ───────────────────────────────────────────── */
const PROTEIN_TARGET    = 106;
const WEIGHT_HEIGHT_CM  = 166;
const STATE_KEY         = 'cfs_state_v3';
const ANALYTICS_KEY     = 'cfs_analytics_v3';
const WEIGHT_KEY        = 'cfs_weight_v3';
const DAILY_LOGS_KEY    = 'cfs_daily_logs_v1';
const INSIGHT_KEY       = 'cfs_insight_v1';
const FIRST_ACT_KEY     = 'cfs_first_activity_v1';
const CHRONOTYPE_KEY    = 'cfs_chronotype_v1';
const PATTERN_KEY       = 'cfs_pattern_v1';

/* ─── CHECKPOINT DEFINITIONS ────────────────────────────────── */
const CHECKPOINTS = [
  { id:'wake',       group:'morning',   title:'Wake before 7:30 AM',            desc:'Consistent wake time = better sleep quality',        tag:'green' },
  { id:'water-am',   group:'morning',   title:'500ml water on empty stomach',   desc:'Rehydrate after 7–8 hrs without water',              tag:'blue'  },
  { id:'sunlight',   group:'morning',   title:'10 min sunlight / outdoor walk', desc:'Sets circadian rhythm, boosts Vitamin D',            tag:'amber' },
  { id:'breakfast',  group:'morning',   title:'Protein-rich breakfast (25g+)',  desc:'At least 25–30g protein within 1 hr of waking',      tag:'green' },
  { id:'workout',    group:'training',  title:'Complete workout (45–60 min)',   desc:'Strength training 4–5x per week minimum',            tag:'green' },
  { id:'steps',      group:'training',  title:'8,000+ steps today',             desc:'Daily movement keeps metabolism active',              tag:'amber' },
  { id:'post-prot',  group:'training',  title:'Post-workout protein (25g+)',    desc:'Whey, eggs, or paneer within 30 min',                tag:'green' },
  { id:'hit-prot',   group:'nutrition', title:'Hit 106g protein target',        desc:'Track and hit your daily protein goal',              tag:'green' },
  { id:'3l-water',   group:'nutrition', title:'Drink 3 litres of water',        desc:'Hydration affects performance and recovery',         tag:'blue'  },
  { id:'no-junk',    group:'nutrition', title:'No processed / junk food',       desc:'Avoid chips, biscuits, fried snacks, sugary drinks', tag:'red'   },
  { id:'3-meals',    group:'nutrition', title:'Eat 3 balanced meals',           desc:"Don't skip meals — fuel your body consistently",     tag:'amber' },
  { id:'no-screen',  group:'evening',   title:'No screens 45 min before bed',  desc:'Blue light disrupts melatonin production',           tag:'amber' },
  { id:'stretch',    group:'evening',   title:'10 min stretching / mobility',  desc:'Reduces soreness, improves flexibility',             tag:'green' },
  { id:'sleep-time', group:'evening',   title:'In bed by 11 PM',               desc:'7–8 hrs sleep is non-negotiable for gains',          tag:'blue'  },
  { id:'no-alcohol', group:'evening',   title:'No alcohol today',              desc:'Alcohol suppresses testosterone and recovery',       tag:'red'   },
];

const GROUPS = {
  morning:  { label:'Morning Routine',     icon:'🌅' },
  training: { label:'Training & Movement', icon:'🏋️' },
  nutrition:{ label:'Nutrition',           icon:'🥗' },
  evening:  { label:'Evening & Recovery',  icon:'🌙' },
};
const TAG_LABELS = { green:'Performance', amber:'Health', blue:'Recovery', red:'Avoid' };
const FOOD_ICONS = {
  egg:'🥚', dal:'🫘', paneer:'🧀', curd:'🥛', chicken:'🍗',
  rice:'🍚', roti:'🫓', fish:'🐟', soya:'🌱', whey:'💪',
  milk:'🥛', rajma:'🫘', chana:'🫘', tofu:'🧀', banana:'🍌', oats:'🥣',
};

/* ─── STATE ──────────────────────────────────────────────────── */
let foods            = [];
let waterGlasses     = 0;
let cpState          = {};
let streak           = 0;
let lastActiveDay    = '';
let weeklyScores     = [];
let weightLog        = [];
let dailyLogs        = [];
let lastInsight      = null;
let firstActTimes    = {};
let storedChronotype = null;
let patternData      = null;
let chatHistory      = [];
let msgId            = 0;
let addingFood       = false;
let loggingWeight    = false;
let deferredInstall  = null;

CHECKPOINTS.forEach(c => { cpState[c.id] = false; });

/* ══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
══════════════════════════════════════════════════════════════ */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Simple debounce — prevents rapid repeated calls */
function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ══════════════════════════════════════════════════════════════
   callAI  —  single reusable function for all AI requests.
   Routes through /.netlify/functions/ai (API key stays server-side).
   
   @param  userInput  string   — the user's message
   @param  options    object   — optional: { system, messages, maxTokens }
   @return string              — AI reply, or fallback error message
══════════════════════════════════════════════════════════════ */
async function callAI(userInput, options = {}) {
  try {
    // ✅ BUILD MEMORY (THIS IS THE KEY UPGRADE)
    const memory = {
      meals: foods.map(f => f.name),
      protein: foods.reduce((sum, f) => sum + f.protein, 0),
      water: waterGlasses * 0.25,
    };

    const res = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userInput,
        memory: memory,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();

    return data.reply || 'AI unavailable — try again later.';

  } catch (e) {
    console.error('[callAI]', e.message);
    return 'AI unavailable — try again later.';
  }
}
/* ══════════════════════════════════════════════════════════════
   STORAGE  —  load / save helpers
══════════════════════════════════════════════════════════════ */
function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      foods, waterGlasses, cpState, streak, lastActiveDay,
    }));
  } catch(e) { console.warn('[FitSystem] saveState failed:', e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    foods         = s.foods         || [];
    waterGlasses  = s.waterGlasses  || 0;
    streak        = s.streak        || 0;
    lastActiveDay = s.lastActiveDay || '';
    if (s.cpState) CHECKPOINTS.forEach(c => { cpState[c.id] = s.cpState[c.id] || false; });
  } catch(e) { console.warn('[FitSystem] loadState failed:', e); }
}

function loadAnalytics() {
  try { weeklyScores = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '[]'); }
  catch(e) { weeklyScores = []; }
}
function saveAnalytics() {
  try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(weeklyScores)); } catch(e) {}
}

function loadWeightLog() {
  try { weightLog = JSON.parse(localStorage.getItem(WEIGHT_KEY) || '[]'); }
  catch(e) { weightLog = []; }
}
function saveWeightLog() {
  try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(weightLog)); } catch(e) {}
}

function loadDailyLogs() {
  try { dailyLogs = JSON.parse(localStorage.getItem(DAILY_LOGS_KEY) || '[]'); }
  catch(e) { dailyLogs = []; }
}
function saveDailyLogs() {
  try { localStorage.setItem(DAILY_LOGS_KEY, JSON.stringify(dailyLogs)); } catch(e) {}
}

function loadInsightCache() {
  try { lastInsight = JSON.parse(localStorage.getItem(INSIGHT_KEY) || 'null'); }
  catch(e) { lastInsight = null; }
}
function saveInsightCache(insight) {
  try { localStorage.setItem(INSIGHT_KEY, JSON.stringify(insight)); } catch(e) {}
}

function loadFirstActTimes() {
  try {
    firstActTimes = JSON.parse(localStorage.getItem(FIRST_ACT_KEY) || '{}');
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
    Object.keys(firstActTimes).forEach(k => { if (k < cutoff) delete firstActTimes[k]; });
  } catch(e) { firstActTimes = {}; }
}
function saveFirstActTimes() {
  try { localStorage.setItem(FIRST_ACT_KEY, JSON.stringify(firstActTimes)); } catch(e) {}
}

function loadStoredChronotype() {
  try { storedChronotype = JSON.parse(localStorage.getItem(CHRONOTYPE_KEY) || 'null'); }
  catch(e) { storedChronotype = null; }
}
function saveStoredChronotype(ct) {
  try { localStorage.setItem(CHRONOTYPE_KEY, JSON.stringify(ct)); } catch(e) {}
}

function loadPatternData() {
  try { patternData = JSON.parse(localStorage.getItem(PATTERN_KEY) || 'null'); }
  catch(e) { patternData = null; }
}
function savePatternData(p) {
  try { localStorage.setItem(PATTERN_KEY, JSON.stringify(p)); } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════
   DATE TRACKING  —  first activity + chronotype engine
══════════════════════════════════════════════════════════════ */

/** Call on any meaningful user interaction to record day-start time. */
function trackFirstActivity() {
  const today = todayStr();
  if (firstActTimes[today]) return;
  firstActTimes[today] = Date.now();
  saveFirstActTimes();
  computeAndStoreChronotype();
}

/**
 * Compute stable chronotype from last 5 days of firstActTimes.
 * Only updates stored result when 3+ days exist with consistent hours.
 *   4–11 AM  → "day"
 *  12–17     → "late"
 *  18–3 AM   → "night"
 */
function computeAndStoreChronotype() {
  const entries = Object.entries(firstActTimes)
    .sort(([a],[b]) => a.localeCompare(b))
    .slice(-5);
  if (entries.length < 3) return;

  const hours    = entries.map(([, ts]) => new Date(ts).getHours());
  const avgHour  = hours.reduce((a,b) => a+b, 0) / hours.length;
  const variance = Math.max(...hours) - Math.min(...hours);
  if (variance > 8) return; // too scattered to classify

  const type = avgHour >= 4 && avgHour < 12 ? 'day'
             : avgHour >= 12 && avgHour < 18 ? 'late'
             : 'night';

  const ct = { type, avgHour: Math.round(avgHour), confidence: entries.length, updatedDate: todayStr() };
  storedChronotype = ct;
  saveStoredChronotype(ct);
}

/** Returns the best chronotype available. Falls back to current hour. */
function getChronotype() {
  if (storedChronotype) return storedChronotype.type;
  const h = new Date().getHours();
  if (h >= 4  && h < 12) return 'day';
  if (h >= 12 && h < 18) return 'late';
  return 'night';
}

/** Legacy alias — used internally */
function detectChronotype() { return getChronotype(); }

/**
 * Returns chronotype-aware label for a checkpoint.
 * Only visual text changes — all logic stays the same.
 */
function getChronotypicLabel(id, defaultTitle) {
  const ct = getChronotype();
  const overrides = {
    night: {
      'wake':       'Wake at your planned time',
      'sleep-time': 'Sleep at your planned time',
      'water-am':   'Drink water when you wake',
      'breakfast':  'Eat protein within 1hr of waking',
      'sunlight':   '10 min outdoor light (any time)',
    },
    late: {
      'wake':       'Wake at a consistent time',
      'sleep-time': 'Sleep at a consistent time',
    },
    day: {},
  };
  const map = overrides[ct] || {};
  return map[id] || defaultTitle;
}

/* ══════════════════════════════════════════════════════════════
   DAILY RESET + ARCHIVING
══════════════════════════════════════════════════════════════ */
function checkDayReset() {
  const today = todayStr();
  if (lastActiveDay && lastActiveDay !== today) {
    const yScore = calcScore();
    archiveDayScore(lastActiveDay, yScore);

    if (yScore >= 70) {
      streak++;
      showToast(`Great day yesterday! Streak: ${streak} 🔥`, 'success');
    } else {
      if (streak > 0) showToast(`Streak reset. Yesterday: ${yScore}. Back to it! 💪`, 'warning');
      streak = 0;
    }

    // Reset daily trackers
    foods        = [];
    waterGlasses = 0;
    CHECKPOINTS.forEach(c => { cpState[c.id] = false; });
    buildCheckpoints();
  }
  lastActiveDay = today;
  saveState();
}

function archiveDayScore(date, score) {
  const consumed   = foods.reduce((s,f) => s + f.protein, 0);
  const proteinPct = Math.round(Math.min(consumed / PROTEIN_TARGET * 100, 100));
  const cpDone     = CHECKPOINTS.filter(c => cpState[c.id]).length;
  const cpPct      = Math.round(cpDone / CHECKPOINTS.length * 100);
  const waterPct   = Math.round(Math.min(waterGlasses * 0.25 / 3 * 100, 100));

  // Weekly analytics
  weeklyScores = weeklyScores.filter(e => e.date !== date);
  weeklyScores.push({ date, score, proteinPct, cpPct });
  weeklyScores = weeklyScores.sort((a,b) => a.date.localeCompare(b.date)).slice(-7);
  saveAnalytics();

  // Daily coaching logs
  dailyLogs = dailyLogs.filter(e => e.date !== date);
  dailyLogs.push({ date, score, protein: proteinPct, water: waterPct, checkpoints: cpPct, type: getChronotype() });
  dailyLogs = dailyLogs.sort((a,b) => a.date.localeCompare(b.date)).slice(-7);
  saveDailyLogs();
}

/* ══════════════════════════════════════════════════════════════
   SCORE CALCULATION
══════════════════════════════════════════════════════════════ */
function calcScore() {
  const cpDone   = CHECKPOINTS.filter(c => cpState[c.id]).length;
  const cpPct    = Math.round(cpDone / CHECKPOINTS.length * 100);
  const consumed = foods.reduce((s,f) => s + f.protein, 0);
  const protPct  = Math.min(Math.round(consumed / PROTEIN_TARGET * 100), 100);
  const waterPct = Math.min(Math.round(waterGlasses * 0.25 / 3 * 100), 100);
  return Math.round(cpPct * 0.5 + protPct * 0.3 + waterPct * 0.2);
}

/* ══════════════════════════════════════════════════════════════
   TOAST SYSTEM
══════════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type = 'success') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  if (toastTimer) clearTimeout(toastTimer);
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

/* ══════════════════════════════════════════════════════════════
   CHRONOTYPE ENGINE  (already above)
   BEHAVIOR PATTERN DETECTION
══════════════════════════════════════════════════════════════ */
function detectBehaviorPatterns() {
  if (dailyLogs.length < 4) { patternData = null; return; }

  const byDow = {};
  dailyLogs.forEach(l => {
    const dow = new Date(l.date + 'T00:00:00').getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(l.score);
  });

  const dowAvgs = Object.entries(byDow)
    .map(([dow, scores]) => ({
      dow: parseInt(dow),
      avg: Math.round(scores.reduce((a,b) => a+b, 0) / scores.length),
      count: scores.length,
    }))
    .filter(d => d.count >= 1);

  if (!dowAvgs.length) { patternData = null; return; }

  const worst      = dowAvgs.reduce((min, d) => d.avg < min.avg ? d : min);
  const DAYS       = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const overallAvg = Math.round(dailyLogs.reduce((a,l) => a + l.score, 0) / dailyLogs.length);
  const patternRisk = worst.avg < overallAvg - 20;

  patternData = { patternRisk, weakDayOfWeek: worst.dow, weakDayName: DAYS[worst.dow], weakDayAvg: worst.avg, overallAvg };
  savePatternData(patternData);
}

/* ══════════════════════════════════════════════════════════════
   ANALYZE USER  —  7-day pattern engine
══════════════════════════════════════════════════════════════ */
function analyzeUser() {
  const logs = dailyLogs.slice(-7);
  if (logs.length < 2) return null;

  const avg = arr => arr.reduce((a,b) => a+b, 0) / arr.length;
  const avgProtein     = Math.round(avg(logs.map(l => l.protein)));
  const avgWater       = Math.round(avg(logs.map(l => l.water)));
  const avgCheckpoints = Math.round(avg(logs.map(l => l.checkpoints)));
  const avgScore       = Math.round(avg(logs.map(l => l.score)));
  const scores         = logs.map(l => l.score);
  const scoreMax       = Math.max(...scores);
  const scoreMin       = Math.min(...scores);
  const scoreVariance  = scoreMax - scoreMin;

  const typeCounts = {};
  logs.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
  const chronotype = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0][0];

  const flags = [];
  if (avgProtein     < 70) flags.push('low_protein');
  if (avgWater       < 60) flags.push('low_hydration');
  if (avgCheckpoints < 50) flags.push('low_discipline');
  if (scoreVariance  > 30) flags.push('inconsistent');

  const PRIORITY   = ['low_discipline','low_protein','inconsistent','low_hydration'];
  const primaryFlag = PRIORITY.find(f => flags.includes(f)) || 'optimizing';
  const severity   = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'medium' : 'low';

  return { flags, primaryFlag, avgProtein, avgWater, avgCheckpoints, avgScore, scoreVariance, chronotype, severity, daysLogged: logs.length, scoreMin, scoreMax };
}

/* ══════════════════════════════════════════════════════════════
   MICRO INSIGHT  —  live real-time card
══════════════════════════════════════════════════════════════ */
function updateMicroInsight() {
  const wrap     = document.getElementById('micro-insight-wrap');
  if (!wrap) return;
  const consumed = foods.reduce((s,f) => s + f.protein, 0);
  const protPct  = consumed / PROTEIN_TARGET;
  const waterPct = waterGlasses * 0.25 / 3;
  const cpDone   = CHECKPOINTS.filter(c => cpState[c.id]).length;
  const cpPct    = cpDone / CHECKPOINTS.length;
  const score    = calcScore();

  let cls, icon, title, desc;

  if (score < 40 && (cpDone > 0 || consumed > 0)) {
    cls='mi-slipping'; icon='🔴';
    title='You are slipping today.';
    desc = `Score ${score}/100. Complete 6+ habits and hit 70g+ protein to recover the day.`;
  } else if (protPct < 0.5) {
    cls='mi-protein'; icon='🥩';
    title=`Protein: ${consumed}g of ${PROTEIN_TARGET}g`;
    desc = `You are ${PROTEIN_TARGET - consumed}g short. Add paneer, soya, or a whey scoop now.`;
  } else if (waterPct < 0.5) {
    cls='mi-water'; icon='💧';
    title=`Water: ${(waterGlasses*0.25).toFixed(1)}L of 3L`;
    desc = `Drink ${(3 - waterGlasses*0.25).toFixed(1)}L more today. Dehydration cuts performance.`;
  } else if (cpPct < 0.4) {
    cls='mi-habits'; icon='⚡';
    title=`Only ${cpDone} of ${CHECKPOINTS.length} habits done`;
    desc = 'Complete morning and training habits first before the day slips away.';
  } else {
    cls='mi-ok'; icon='✅';
    title=`On track — score ${score}/100`;
    desc = 'Keep momentum. Complete remaining habits before the day ends.';
  }

  wrap.innerHTML = `
    <div class="micro-insight ${cls}">
      <div class="mi-icon">${icon}</div>
      <div class="mi-body"><div class="mi-title">${title}</div><div class="mi-desc">${desc}</div></div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   PERFORMANCE TREND SIGNAL
══════════════════════════════════════════════════════════════ */
function getPerformanceTrend() {
  const today   = todayStr();
  const allDays = [...weeklyScores.filter(e => e.date !== today), { date: today, score: calcScore() }]
    .sort((a,b) => a.date.localeCompare(b.date)).slice(-3);
  if (allDays.length < 2) return { type:'na', label:'Tracking…', sub:'Log more days to see trend', delta:0 };
  const scores = allDays.map(d => d.score);
  const delta  = scores[scores.length-1] - scores[0];
  if (delta > 8)           return { type:'up',   label:'Momentum Building',     sub:`+${delta} pts over ${allDays.length} days`, delta };
  if (delta < -8)          return { type:'down', label:'Performance Dropping',  sub:`${delta} pts over ${allDays.length} days`,  delta };
  if (scores.every(s=>s>0)) return { type:'flat', label:'Stagnant',             sub:'Score flat — push harder today',            delta };
  return { type:'na', label:'Tracking…', sub:'Keep logging to see trend', delta };
}

function renderTrendSignal() {
  const wrap = document.getElementById('trend-signal-wrap');
  if (!wrap) return;
  const t     = getPerformanceTrend();
  const icons = { up:'📈', down:'📉', flat:'➡️', na:'📊' };
  wrap.innerHTML = `
    <div class="trend-signal ${t.type}">
      <span class="ts-icon">${icons[t.type]}</span>
      ${t.label}<span class="ts-sub">— ${t.sub}</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   RISK ALERT SYSTEM
══════════════════════════════════════════════════════════════ */
function checkRiskAlerts() {
  const today     = todayStr();
  const todayScore = calcScore();
  const alertEl   = document.getElementById('risk-alert');
  const titleEl   = document.getElementById('risk-title');
  const descEl    = document.getElementById('risk-desc');
  if (!alertEl) return;

  let showAlert = false, rTitle = '', rDesc = '';

  if (weeklyScores.length >= 2) {
    const last2     = weeklyScores.slice(-2);
    const declining = last2[1].score < last2[0].score - 10;
    if (declining && todayScore < last2[1].score) {
      showAlert = true;
      rTitle = 'Slipping — 3-day decline detected';
      rDesc  = `Scores: ${last2[0].score} → ${last2[1].score} → ${todayScore}. Fix today before this becomes permanent. Do the workout and hit protein — nothing else matters right now.`;
    }
  }

  if (!showAlert && patternData && patternData.patternRisk) {
    const todayDow = new Date().getDay();
    if (todayDow === patternData.weakDayOfWeek) {
      showAlert = true;
      rTitle = `${patternData.weakDayName} — your historically weak day`;
      rDesc  = `Your avg score on ${patternData.weakDayName}s is ${patternData.weakDayAvg} vs ${patternData.overallAvg} overall. You usually drop here. Be deliberate today.`;
    }
  }

  alertEl.classList.toggle('visible', showAlert);
  if (showAlert) { titleEl.textContent = rTitle; descEl.textContent = rDesc; }
}

/* ══════════════════════════════════════════════════════════════
   SMART FOCUS CARD  —  strategic, combines today + weekly
══════════════════════════════════════════════════════════════ */
function updateSmartFocus() {
  const consumed   = foods.reduce((s,f) => s + f.protein, 0);
  const protPct    = consumed / PROTEIN_TARGET;
  const waterPct   = waterGlasses * 0.25 / 3;
  const cpDone     = CHECKPOINTS.filter(c => cpState[c.id]).length;
  const cpPct      = cpDone / CHECKPOINTS.length;
  const score      = calcScore();
  const analysis   = analyzeUser();
  const weeklyWeak = analysis ? analysis.primaryFlag : null;
  const ct         = getChronotype();
  const timingPrefix = { day:'🌅 Morning mode:', late:'☀️ Afternoon mode:', night:'🌙 Evening mode:' }[ct];

  let borderColor, html;

  if (weeklyWeak === 'low_protein' && protPct < 0.7) {
    borderColor = 'var(--amber)';
    const need = PROTEIN_TARGET - consumed;
    html = `${timingPrefix} <strong style="color:var(--amber)">Protein is your weekly bottleneck</strong> — ${consumed}g today, need ${need}g more. Fix it: 100g paneer (18g) + 1 scoop whey (25g) = ${consumed+43}g total.`;
  } else if (weeklyWeak === 'low_discipline' && cpPct < 0.6) {
    borderColor = 'var(--red)';
    const pending = CHECKPOINTS.filter(c => !cpState[c.id]).slice(0,3).map(c => c.title).join(', ');
    html = `${timingPrefix} <strong style="color:var(--red)">Discipline is your weekly bottleneck</strong> — you consistently skip habits. Right now: <em style="color:var(--text)">${pending}</em>. These three change your score.`;
  } else if (protPct < 0.5) {
    borderColor = 'var(--amber)';
    html = `🥩 <strong style="color:var(--amber)">Protein alert</strong> — ${consumed}g of ${PROTEIN_TARGET}g. Add ${PROTEIN_TARGET - consumed}g more: paneer (18g), whey (25g), rajma (15g), 2 eggs (12g).`;
  } else if (waterPct < 0.5) {
    borderColor = 'var(--blue)';
    html = `💧 <strong style="color:var(--blue)">Hydration check</strong> — ${(waterGlasses*0.25).toFixed(1)}L of 3L. Drink ${Math.ceil((3 - waterGlasses*0.25)/0.25)} more glasses. Dehydration cuts strength by 10%.`;
  } else if (cpPct < 0.4) {
    borderColor = 'var(--red)';
    const pending = CHECKPOINTS.filter(c => !cpState[c.id]).slice(0,3).map(c => c.title).join(', ');
    html = `⚡ <strong style="color:var(--red)">Discipline gap</strong> — ${cpDone}/${CHECKPOINTS.length} habits done. Focus: <em style="color:var(--text)">${pending}</em>.`;
  } else if (score >= 80) {
    borderColor = 'var(--green)';
    html = `🏆 <strong style="color:var(--green)">Outstanding day, Chetan!</strong> Score ${score}/100. ${weeklyWeak && weeklyWeak !== 'optimizing' ? `Weekly focus area: <strong>${weeklyWeak.replace('_',' ')}</strong> — make gains here.` : 'Keep it up — this is exactly how best shape is built.'}`;
  } else {
    borderColor = 'var(--green)';
    const focus = weeklyWeak && weeklyWeak !== 'optimizing'
      ? `Weekly weak area: <strong style="color:var(--amber)">${weeklyWeak.replace(/_/g,' ')}</strong> — make progress on that today.`
      : 'Focus: sleep by 11 PM and post-workout protein have the highest ROI.';
    html = `📈 <strong style="color:var(--green)">On track</strong> — score ${score}/100. ${focus}`;
  }

  const fc = document.getElementById('focus-card');
  if (fc) fc.style.borderLeftColor = borderColor;
  const ft = document.getElementById('focus-text');
  if (ft) ft.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   GENERATE INSIGHT HTML
══════════════════════════════════════════════════════════════ */
function generateInsightHTML(a) {
  const timingNote = {
    day:   "You're a morning person — lock in breakfast protein and morning habits before 9 AM. Front-load your day.",
    late:  'As an afternoon-active person, make lunch your biggest protein meal. Train at 5–7 PM for best output.',
    night: "You're most active at night — schedule your workout after 6 PM and eat your last protein meal at 9–10 PM.",
  }[a.chronotype];

  const chronoLabel = { day:'Morning Person', late:'Afternoon Active', night:'Night Owl' }[a.chronotype];
  const chronoIcon  = { day:'🌅', late:'☀️', night:'🌙' }[a.chronotype];

  const INSIGHTS = {
    low_discipline: {
      icon:'⚠️',
      problem:`Your habit completion averages <strong style="color:var(--red)">${a.avgCheckpoints}%</strong> over ${a.daysLogged} days. You are skipping more than half your daily actions. Your body adapts to what you consistently do — not what you occasionally try.`,
      action:`Pick <strong style="color:var(--green)">5 non-negotiable checkpoints</strong> and hit 100% for 5 straight days. Suggested: wake time, water AM, workout, protein breakfast, sleep by 11 PM.`,
      motivation:'"Discipline is not motivation. It is a system. Build the system first."',
    },
    low_protein: {
      icon:'🥩',
      problem:`You are averaging only <strong style="color:var(--red)">${a.avgProtein}%</strong> of your protein target over ${a.daysLogged} days. At this intake your body is breaking down muscle. Fat loss will slow. Muscle gain is impossible.`,
      action:`Add <strong style="color:var(--green)">1 fixed protein anchor per meal</strong>: eggs at breakfast, paneer or curd at lunch, soya chunks or whey at dinner. That alone adds ~60g before you track anything.`,
      motivation:'"You cannot out-train a protein deficit. Eat or stay stuck."',
    },
    inconsistent: {
      icon:'📉',
      problem:`Your daily score swings from <strong style="color:var(--red)">${a.scoreMin}</strong> to <strong style="color:var(--amber)">${a.scoreMax}</strong> — a ${a.scoreVariance}-point gap. Good days followed by zero days produce zero net results. Inconsistency is the single biggest reason people do not change.`,
      action:`Set a <strong style="color:var(--green)">minimum viable day rule</strong>: any day below 40, you still complete workout + hit protein. No zero days allowed.`,
      motivation:'"A bad day where you showed up beats a rest day where you gave up."',
    },
    low_hydration: {
      icon:'💧',
      problem:`You are averaging <strong style="color:var(--red)">${a.avgWater}%</strong> of your water target. Chronic under-hydration reduces strength by 10%, impairs recovery, and causes false hunger — silently wrecking your nutrition too.`,
      action:`Place a <strong style="color:var(--green)">1L bottle on your desk</strong>. Finish by lunch, refill, finish by 6 PM. That is 2L done without thinking. Add 4 glasses in the evening.`,
      motivation:'"Most fatigue is dehydration. Drink first, then decide if you are tired."',
    },
    optimizing: {
      icon:'🏆',
      problem:`Avg score <strong style="color:var(--green)">${a.avgScore}</strong> across ${a.daysLogged} days. Protein: ${a.avgProtein}%. Water: ${a.avgWater}%. Habits: ${a.avgCheckpoints}%. You are tracking consistently — the focus now is compounding these gains.`,
      action:`<strong style="color:var(--green)">Raise your floor</strong>: find your lowest-scoring day this week and identify the habit that broke first. Removing your worst day is worth more than improving your best.`,
      motivation:'"The gap between average and elite is built in ordinary days, not peak ones."',
    },
  };

  const ins = INSIGHTS[a.primaryFlag];

  const BOTTLENECK_NAMES = {
    low_discipline:'Discipline & Consistency',
    low_protein:   'Protein Intake',
    inconsistent:  'Day-to-Day Consistency',
    low_hydration: 'Hydration',
    optimizing:    'None — Optimizing',
  };
  const BOTTLENECK_SUBS = {
    low_discipline:`Avg ${a.avgCheckpoints}% habits completed — below the 50% minimum`,
    low_protein:   `Avg ${a.avgProtein}% of target — muscle growth requires 100%`,
    inconsistent:  `${a.scoreVariance}-point swing — good days cancelled by bad ones`,
    low_hydration: `Avg ${a.avgWater}% of 3L — chronic deficit affecting recovery`,
    optimizing:    'All metrics above threshold — focus on raising your floor',
  };

  const FLAG_LABELS = {
    low_protein:   ['Low Protein',    'bad'],
    low_hydration: ['Low Hydration',  'bad'],
    low_discipline:['Low Discipline', 'bad'],
    inconsistent:  ['Inconsistent',   'warn'],
    optimizing:    ['Optimizing',     'ok'],
  };
  const allFlagKeys = a.flags.length ? a.flags : ['optimizing'];
  const flagsHTML   = allFlagKeys.map(f => {
    const [label, cls] = FLAG_LABELS[f] || [f, 'warn'];
    return `<span class="insight-flag flag-${cls}">${label}</span>`;
  }).join('');

  const badgeClass = a.severity === 'high' ? 'badge-high' : a.severity === 'medium' ? 'badge-medium' : 'badge-low';
  const badgeText  = a.severity === 'high' ? 'Critical'   : a.severity === 'medium' ? 'Needs Work'   : 'On Track';

  return `
    <div class="insight-card sev-${a.severity}">
      <div class="insight-header">
        <span class="insight-badge ${badgeClass}">${badgeText}</span>
        <span class="insight-chronotype">${chronoIcon} ${chronoLabel}</span>
        <span class="insight-meta">${a.daysLogged}-day analysis</span>
      </div>
      <div class="insight-metrics">
        <div class="insight-metric">
          <div class="insight-metric-val" style="color:${a.avgProtein>=70?'var(--green)':'var(--red)'}">${a.avgProtein}%</div>
          <div class="insight-metric-lbl">Protein</div>
        </div>
        <div class="insight-metric">
          <div class="insight-metric-val" style="color:${a.avgWater>=60?'var(--green)':'var(--red)'}">${a.avgWater}%</div>
          <div class="insight-metric-lbl">Water</div>
        </div>
        <div class="insight-metric">
          <div class="insight-metric-val" style="color:${a.avgCheckpoints>=50?'var(--green)':'var(--red)'}">${a.avgCheckpoints}%</div>
          <div class="insight-metric-lbl">Habits</div>
        </div>
        <div class="insight-metric">
          <div class="insight-metric-val" style="color:${a.avgScore>=70?'var(--green)':a.avgScore>=50?'var(--amber)':'var(--red)'}">${a.avgScore}</div>
          <div class="insight-metric-lbl">Avg Score</div>
        </div>
      </div>
      <div class="insight-divider"></div>
      <div class="insight-problem">${ins.icon} ${ins.problem}</div>
      <div class="bottleneck-block">
        <div class="bn-label">Biggest Bottleneck</div>
        <div class="bn-value">${BOTTLENECK_NAMES[a.primaryFlag]}</div>
        <div class="bn-sub">${BOTTLENECK_SUBS[a.primaryFlag]}</div>
      </div>
      <div class="insight-action-row">
        <div class="insight-action-icon">→</div>
        <div class="insight-action-text"><strong>Action:</strong> ${ins.action}</div>
      </div>
      <div class="insight-action-row" style="margin-bottom:0;">
        <div class="insight-action-icon" style="color:var(--text3)">💡</div>
        <div class="insight-action-text" style="color:var(--text3);font-size:12px;">${timingNote}</div>
      </div>
      <div class="insight-divider"></div>
      <div class="insight-motivation">${ins.motivation}</div>
      <div class="insight-flags" style="margin-top:10px;">${flagsHTML}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   RENDER INSIGHT CARD  —  once per day, cached
══════════════════════════════════════════════════════════════ */
function renderInsightCard() {
  const today     = todayStr();
  const container = document.getElementById('insight-container');
  if (!container) return;

  if (lastInsight && lastInsight.date === today) {
    container.innerHTML = lastInsight.html;
    return;
  }

  const analysis = analyzeUser();
  if (!analysis) {
    container.innerHTML = `
      <div class="insight-card sev-low">
        <div class="insight-no-data">
          <span>🧠</span>
          Logging for 2+ days unlocks pattern analysis.<br>
          Keep tracking — your personalized insight appears automatically.
        </div>
      </div>`;
    return;
  }

  const html = generateInsightHTML(analysis);
  container.innerHTML = html;
  lastInsight = { date: today, html, severity: analysis.severity };
  saveInsightCache(lastInsight);
}

/* ══════════════════════════════════════════════════════════════
   CHECKPOINTS
══════════════════════════════════════════════════════════════ */
function buildCheckpoints() {
  const container = document.getElementById('cp-groups');
  if (!container) return;
  container.innerHTML = ['morning','training','nutrition','evening'].map(gKey => {
    const g     = GROUPS[gKey];
    const items = CHECKPOINTS.filter(c => c.group === gKey);
    const done  = items.filter(c => cpState[c.id]).length;
    return `
      <div class="cp-group">
        <div class="cp-group-title">
          <span class="cp-group-icon">${g.icon}</span>${g.label}
          <span class="cp-group-prog" id="gprog-${gKey}">${done}/${items.length}</span>
        </div>
        ${items.map(c => `
          <div class="cp-item ${cpState[c.id]?'done':''}" id="cp-${c.id}" onclick="toggleCp('${c.id}')">
            <div class="cp-check">${cpState[c.id]?'✓':''}</div>
            <div class="cp-body">
              <div class="cp-title">${getChronotypicLabel(c.id, c.title)}</div>
              <div class="cp-desc">${c.desc}</div>
            </div>
            <span class="cp-tag tag-${c.tag}">${TAG_LABELS[c.tag]}</span>
          </div>`).join('')}
      </div>`;
  }).join('');
}

function toggleCp(id) {
  trackFirstActivity();
  cpState[id] = !cpState[id];
  const el    = document.getElementById('cp-' + id);
  if (!el) return;
  const check = el.querySelector('.cp-check');
  el.classList.toggle('done', cpState[id]);
  if (check) check.textContent = cpState[id] ? '✓' : '';
  if (cpState[id]) showToast('Habit completed ✓', 'success');
  updateGroupProg();
  updateAll();
  saveState();
}

function updateGroupProg() {
  ['morning','training','nutrition','evening'].forEach(g => {
    const items = CHECKPOINTS.filter(c => c.group === g);
    const done  = items.filter(c => cpState[c.id]).length;
    const el    = document.getElementById('gprog-' + g);
    if (el) el.textContent = `${done}/${items.length}`;
  });
}

/* ══════════════════════════════════════════════════════════════
   WATER
══════════════════════════════════════════════════════════════ */
function addWater(delta) {
  trackFirstActivity();
  waterGlasses = Math.max(0, Math.min(16, waterGlasses + delta));
  if (delta > 0 && waterGlasses * 0.25 >= 3) showToast('Water goal hit! 💧', 'info');
  renderWater();
  updateAll();
  saveState();
}

function renderWater() {
  const litres = (waterGlasses * 0.25).toFixed(2).replace(/\.?0+$/, '');
  const wv = document.getElementById('water-val');
  if (wv) wv.innerHTML = `${litres}<span style="font-size:14px;color:var(--text3);font-family:var(--font-body)">L / 3L</span>`;
  const wb = document.getElementById('water-bar');
  if (wb) wb.style.width = Math.min(waterGlasses * 0.25 / 3 * 100, 100) + '%';
  const wd = document.getElementById('water-dots');
  if (!wd) return;
  let html = '';
  for (let i = 0; i < 12; i++) {
    const filled = i < waterGlasses;
    html += `<div style="width:26px;height:26px;border-radius:50%;background:${filled?'var(--blue-dim)':'var(--bg3)'};border:1px solid ${filled?'var(--blue)':'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;" onclick="addWater(${filled?-1:1})">💧</div>`;
  }
  wd.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   WEIGHT TRACKER
══════════════════════════════════════════════════════════════ */
function logWeight() {
  if (loggingWeight) return; // prevent double-click
  const input = document.getElementById('weight-in');
  const w     = parseFloat(input.value);
  if (!w || w < 30 || w > 200) { showToast('Enter a valid weight (30–200 kg)', 'error'); return; }

  loggingWeight = true;
  const btn = document.getElementById('weight-log-btn');
  if (btn) btn.disabled = true;

  const today = todayStr();
  const idx   = weightLog.findIndex(e => e.date === today);
  if (idx >= 0) weightLog[idx].weight = w;
  else weightLog.push({ date: today, weight: w });
  weightLog = weightLog.sort((a,b) => a.date.localeCompare(b.date)).slice(-30);
  saveWeightLog();
  input.value = '';
  showToast(`Weight logged: ${w} kg`, 'success');
  renderWeightCard();

  if (btn) btn.disabled = false;
  loggingWeight = false;
}

function renderWeightCard() {
  const recent = weightLog.slice(-7);
  const wtEl   = document.getElementById('weight-trend');
  const wlEl   = document.getElementById('weight-change-lbl');
  const wcEl   = document.getElementById('weight-chart');

  if (!recent.length) {
    if (wtEl) wtEl.textContent = '—';
    if (wlEl) wlEl.textContent = 'No data yet';
    if (wcEl) wcEl.innerHTML   = '';
    const od = document.getElementById('wc-oldest-date'); if (od) od.textContent = '';
    const td = document.getElementById('wc-today-date');  if (td) td.textContent = '';
    return;
  }

  const latest   = recent[recent.length - 1];
  const previous = recent.length >= 2 ? recent[recent.length - 2] : null;
  const change   = previous ? +(latest.weight - previous.weight).toFixed(1) : null;

  const pwEl = document.getElementById('profile-weight');
  if (pwEl) pwEl.textContent = latest.weight + ' kg';
  const bmi    = (latest.weight / ((WEIGHT_HEIGHT_CM / 100) ** 2)).toFixed(1);
  const bmiLbl = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const pbEl = document.getElementById('profile-bmi');
  if (pbEl) pbEl.textContent = `${bmi} (${bmiLbl})`;

  const trendIcon = change === null ? '—' : Math.abs(change) < 0.2 ? '→' : change > 0 ? '↑' : '↓';
  const changeLbl = change === null ? 'First entry' : Math.abs(change) < 0.2 ? 'Stable' : `${change > 0 ? '+' : ''}${change} kg`;

  if (wtEl) { wtEl.textContent = trendIcon; wtEl.style.color = change > 0.2 ? 'var(--amber)' : change < -0.2 ? 'var(--green)' : 'var(--text2)'; }
  if (wlEl) wlEl.textContent = changeLbl;

  if (wcEl) {
    const weights  = recent.map(e => e.weight);
    const minW     = Math.min(...weights) - 0.5;
    const maxW     = Math.max(...weights) + 0.5;
    const range    = maxW - minW || 1;
    const today    = todayStr();
    wcEl.innerHTML = recent.map(e => {
      const h       = Math.round(((e.weight - minW) / range) * 90) + 10;
      const isToday = e.date === today;
      return `<div class="wc-bar-wrap"><div class="wc-bar${isToday?' today':''}" style="height:${h}%"></div><div class="wc-label">${e.weight}</div></div>`;
    }).join('');
  }

  if (recent.length > 1) {
    const od = document.getElementById('wc-oldest-date'); if (od) od.textContent = dayLabel(recent[0].date);
    const td = document.getElementById('wc-today-date');  if (td) td.textContent = 'today';
  }
}

/* ══════════════════════════════════════════════════════════════
   WEEKLY ANALYTICS
══════════════════════════════════════════════════════════════ */
function renderWeekBars() {
  const today      = todayStr();
  const todayScore = calcScore();
  const allDays    = [...weeklyScores.filter(e => e.date !== today), { date: today, score: todayScore, isToday: true }]
    .sort((a,b) => a.date.localeCompare(b.date)).slice(-7);

  const wbEl = document.getElementById('week-bars');
  const waEl = document.getElementById('week-avg');
  if (!wbEl) return;

  if (allDays.length < 2) {
    wbEl.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:1rem 0">Keep logging — chart appears after 2 days</div>`;
    if (waEl) waEl.textContent = todayScore;
    return;
  }

  const scores = allDays.map(d => d.score);
  const avg    = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
  if (waEl) waEl.textContent = avg;

  wbEl.innerHTML = allDays.map(d => {
    const h    = Math.max(Math.round(d.score / 100 * 100), 3);
    const col  = d.score >= 70 ? 'var(--green)' : d.score >= 50 ? 'var(--amber)' : 'var(--red)';
    const opac = d.isToday ? '1' : '0.6';
    return `<div class="abc-bar-wrap">
      <div class="abc-val">${d.score}</div>
      <div class="abc-bar" style="height:${h}%;background:${col};opacity:${opac}"></div>
      <div class="abc-label">${dayLabel(d.date)}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   MAIN UPDATE
══════════════════════════════════════════════════════════════ */
function updateAll() {
  const cpDone   = CHECKPOINTS.filter(c => cpState[c.id]).length;
  const total    = CHECKPOINTS.length;
  const cpPct    = Math.round(cpDone / total * 100);
  const consumed = foods.reduce((s,f) => s + f.protein, 0);
  const protPct  = Math.min(Math.round(consumed / PROTEIN_TARGET * 100), 100);
  const waterPct = Math.min(Math.round(waterGlasses * 0.25 / 3 * 100), 100);
  const score    = calcScore();

  const setEl = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

  // Header score
  setEl('score-big', el => { el.textContent = score; el.style.color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)'; });

  // Overview cards
  setEl('ov-cp',      el => el.textContent = `${cpDone}/${total}`);
  setEl('ov-cp-sub',  el => el.textContent = cpPct >= 100 ? 'All done! 🎉' : cpPct > 60 ? 'On track' : 'Keep going');
  setEl('ov-cp-bar',  el => el.style.width = cpPct + '%');
  setEl('ov-prot',    el => el.textContent = consumed + 'g');
  setEl('ov-prot-bar',el => el.style.width = Math.min(protPct, 100) + '%');
  setEl('ov-water',   el => el.textContent = (waterGlasses * 0.25).toFixed(1) + 'L');
  setEl('ov-water-bar',el => el.style.width = waterPct + '%');
  setEl('ov-streak',  el => el.textContent = streak + ' 🔥');

  // Checkpoint panel
  setEl('cp-done-count', el => el.textContent = cpDone);
  setEl('cp-total-count',el => el.textContent = total);
  setEl('cp-pct-pill', el => { el.textContent = cpPct + '%'; el.className = 'pct-pill ' + (cpPct >= 80 ? 'pct-green' : cpPct >= 50 ? 'pct-amber' : 'pct-red'); });
  setEl('cp-main-bar', el => el.style.width = cpPct + '%');

  // Nutrition ring
  const over   = consumed > PROTEIN_TARGET;
  const circ   = 2 * Math.PI * 35;
  const offset = circ - circ * Math.min(consumed / PROTEIN_TARGET, 1);
  setEl('nut-ring',     el => { el.style.strokeDashoffset = offset.toFixed(1); el.style.stroke = over ? '#ff5f5f' : '#3ddc84'; });
  setEl('nut-ring-pct', el => { el.textContent = protPct + '%'; el.setAttribute('fill', over ? '#ff5f5f' : '#3ddc84'); });
  setEl('nut-consumed', el => el.textContent = consumed + 'g');
  setEl('nut-remain',   el => el.textContent = over ? 'Done!' : (PROTEIN_TARGET - consumed) + 'g');
  setEl('nut-meals',    el => el.textContent = foods.length);
  setEl('nut-bar', el => { el.style.width = Math.min(protPct, 100) + '%'; el.classList.toggle('over', over); });

  renderFoodList();
  renderWater();
  updateSmartFocus();
  updateMicroInsight();
  renderTrendSignal();
  checkRiskAlerts();
  renderWeekBars();
  updateGroupProg();
  renderInsightCard();
}

function renderFoodList() {
  const fl = document.getElementById('food-list');
  if (!fl) return;
  if (!foods.length) { fl.innerHTML = '<div class="food-empty">No foods logged yet</div>'; return; }
  fl.innerHTML = foods.map((f, i) => {
    const n = f.name.toLowerCase();
    let icon = '🍽️';
    for (const [k,v] of Object.entries(FOOD_ICONS)) { if (n.includes(k)) { icon = v; break; } }
    return `<div class="food-item">
      <span style="font-size:16px">${icon}</span>
      <span class="food-name">${esc(f.name)}</span>
      <span class="food-g">+${f.protein}g</span>
      <button class="food-del" onclick="delFood(${i})">×</button>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   FOOD LOG
══════════════════════════════════════════════════════════════ */
function delFood(i) {
  foods.splice(i, 1);
  updateAll();
  saveState();
}

async function addFood() {
  if (addingFood) return;
  const inp  = document.getElementById('food-in');
  const text = inp.value.trim();
  if (!text) return;
  await estimateAndAdd(text);
}

// Debounced version to prevent rapid fire from keyboard
const debouncedAddFood = debounce(addFood, 400);

function quickLog(text) {
  const inp = document.getElementById('food-in');
  if (inp) inp.value = text;
  addFood();
}

async function estimateAndAdd(text) {
  trackFirstActivity(); // record first interaction for chronotype engine
  addingFood = true;
  const btn  = document.getElementById('add-btn');
  const hint = document.getElementById('ai-hint');
  if (btn) btn.disabled = true;

  if (!navigator.onLine) {
    const estimate = roughProteinEstimate(text);
    foods.unshift({ name: estimate.label, protein: estimate.protein });
    if (hint) hint.textContent = `⚡ Offline estimate: ~${estimate.protein}g protein`;
    const inp = document.getElementById('food-in');
    if (inp) inp.value = '';
    updateAll();
    saveState();
    showToast(`Added ${estimate.label} (~${estimate.protein}g)`, 'success');
    if (btn) btn.disabled = false;
    addingFood = false;
    return;
  }

  if (hint) hint.innerHTML = '<span class="spinner"></span>Estimating with AI…';
  const consumed = foods.reduce((s,f) => s + f.protein, 0);

  try {
    const reply = await callAI(text, {
      maxTokens: 200,
      system: `You are a nutrition expert. Chetan: 66kg, 166cm. Daily protein target: ${PROTEIN_TARGET}g. Consumed so far: ${consumed}g.
Return ONLY valid JSON, no markdown: {"protein":<integer>,"label":"<concise food name, max 40 chars>","note":"<one short motivating sentence>"}
Use accurate Indian food protein values. Be realistic — do not overestimate.`,
    });

    if (reply === 'AI unavailable — try again later.') throw new Error(reply);

    let parsed;
    try { parsed = JSON.parse(reply.replace(/```json|```/g,'').trim()); } catch { parsed = null; }

    if (parsed && typeof parsed.protein === 'number') {
      foods.unshift({ name: parsed.label || text, protein: Math.round(parsed.protein) });
      if (hint) hint.textContent = parsed.note || '✓ Added!';
      const inp = document.getElementById('food-in');
      if (inp) inp.value = '';
      updateAll();
      saveState();
      showToast(`+${Math.round(parsed.protein)}g protein logged`, 'success');
    } else {
      if (hint) hint.textContent = 'Could not parse response. Be more specific.';
    }
  } catch(e) {
    const offline = !navigator.onLine || e.message.includes('Failed to fetch');
    if (offline) {
      if (hint) hint.textContent = '⚡ Offline — using estimate';
      const est = roughProteinEstimate(text);
      foods.unshift({ name: est.label, protein: est.protein });
      const inp = document.getElementById('food-in');
      if (inp) inp.value = '';
      updateAll();
      saveState();
    } else {
      if (hint) hint.textContent = 'AI unavailable — try again later.';
      showToast('AI unavailable — try again later.', 'error');
    }
  }

  if (btn) btn.disabled = false;
  addingFood = false;
}

function roughProteinEstimate(text) {
  const t = text.toLowerCase();
  const lookup = [
    { keys:['whey','protein powder','scoop'],  protein:25, label:'Whey protein (1 scoop)' },
    { keys:['chicken breast','chicken'],        protein:31, label:'Chicken breast (100g)'  },
    { keys:['paneer'],                          protein:18, label:'Paneer (100g)'           },
    { keys:['egg','anda'],                      protein:12, label:'Eggs (2 pcs)'            },
    { keys:['rajma'],                           protein:15, label:'Rajma (1 cup)'           },
    { keys:['dal','daal','moong','masoor'],      protein:12, label:'Dal (1 cup)'             },
    { keys:['soya','soy chunk'],                protein:26, label:'Soya chunks (30g)'       },
    { keys:['curd','dahi','yogurt'],            protein:10, label:'Curd (1 cup)'            },
    { keys:['milk','doodh'],                    protein:8,  label:'Milk (1 glass)'          },
    { keys:['tofu'],                            protein:15, label:'Tofu (100g)'             },
    { keys:['fish','tuna','salmon'],            protein:26, label:'Fish (100g)'             },
    { keys:['chana','chickpea'],                protein:14, label:'Chana (1 cup)'           },
  ];
  for (const entry of lookup) {
    if (entry.keys.some(k => t.includes(k))) return entry;
  }
  return { protein: 10, label: text.slice(0, 40) };
}

/* ══════════════════════════════════════════════════════════════
   AI CHAT
   /* ══════════════════════════════════════════════════════════════
   AI CHAT
══════════════════════════════════════════════════════════════ */

async function sendChat() {
  const inp = document.getElementById('chat-in');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';

  appendMsg('user', text);
  chatHistory.push({ role: 'user', content: text });

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const tid = appendMsg('ai', '<span class="spinner"></span>thinking…', true);

  // OFFLINE MODE
  if (!navigator.onLine) {
    updateMsg(tid, '⚡ AI coach is unavailable offline. Your data is saved — ask me when you\'re back online!');
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  try {
    // 🧠 MAIN AI RESPONSE
    const reply = await callAI(text);

    updateMsg(tid, reply);
    chatHistory.push({ role: 'assistant', content: reply });

    // 🍗 AUTO FOOD TRACKING
    try {
      const foodReply = await callAI(text);

      let parsed;
      try {
        parsed = JSON.parse(foodReply);
      } catch {
        parsed = null;
      }

      if (parsed && parsed.foods && parsed.foods.length > 0) {
        parsed.foods.forEach(f => {
          foods.unshift({
            name: f.name,
            protein: Math.round(f.protein)
          });
        });

        updateAll();
        saveState();
        showToast("Food auto-logged 🍗", "success");
      }

    } catch (e) {
      console.log("Auto food tracking skipped");
    }

  } catch (err) {
    console.error(err);
    updateMsg(tid, 'AI unavailable — try again later.');
  }

  if (sendBtn) sendBtn.disabled = false;
}
══════════════════════════════════════════════════════════════ */
    updateMsg(tid, '⚡ AI coach is unavailable offline. Your data is saved — ask me when you\'re back online!');
/* ══════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════ */
function switchPanel(name) {
  ['dash','cp','nut','sc','ai'].forEach(p => {
    const panel = document.getElementById('panel-'+p);
    const btn   = document.getElementById('nav-'+p);
    if (panel) panel.classList.toggle('active', p === name);
    if (btn)   btn.classList.toggle('active',   p === name);
  });
  if (name === 'sc') renderSmartChoices();
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ══════════════════════════════════════════════════════════════
   ⚡ SMART CHOICES ENGINE
   Pure logic + static food DB. Zero AI calls. Zero API cost.
   Reads live state (foods array) — syncs with existing tracker.
══════════════════════════════════════════════════════════════ */

const FOOD_DB = [
  { name:'Egg (1)',           protein: 6,  type:'non-veg', emoji:'🥚' },
  { name:'Paneer (100g)',     protein:18,  type:'veg',     emoji:'🧀' },
  { name:'Chicken (100g)',    protein:25,  type:'non-veg', emoji:'🍗' },
  { name:'Dal (1 bowl)',      protein:10,  type:'veg',     emoji:'🫘' },
  { name:'Curd (1 bowl)',     protein: 8,  type:'veg',     emoji:'🥛' },
  { name:'Peanuts (40g)',     protein:10,  type:'veg',     emoji:'🥜' },
  { name:'Whey scoop (30g)', protein:25,  type:'veg',     emoji:'💪' },
  { name:'Soya chunks (30g)',protein:13,  type:'veg',     emoji:'🌱' },
  { name:'Rajma (1 bowl)',    protein:12,  type:'veg',     emoji:'🫘' },
  { name:'Tofu (100g)',       protein:10,  type:'veg',     emoji:'🫐' },
  { name:'Tuna (100g)',       protein:29,  type:'non-veg', emoji:'🐟' },
];

/* Day phases based on Chetan's actual schedule:
   Sleep 4–5 AM | Wake 11 AM–1 PM | Work 6:30 PM–3:30 AM */
const DAY_PHASES = [
  { id:'start',    name:'Wake & Start',   hours:[11,12,13,14], icon:'🌅', cls:'phase-start',
    tip:'First meal of the day. Prioritise protein to kickstart metabolism.' },
  { id:'build',    name:'Build Phase',    hours:[15,16,17,18], icon:'🏋️', cls:'phase-build',
    tip:'Pre-work window. Heavy protein + complex carbs for sustained energy.' },
  { id:'work',     name:'Work Mode',      hours:[19,20,21,22,23,0,1,2,3], icon:'💼', cls:'phase-work',
    tip:'Working hours. Light meals, keep protein steady, avoid heavy carbs.' },
  { id:'shutdown', name:'Wind Down',      hours:[4,5,6,7,8,9,10], icon:'🌙', cls:'phase-shutdown',
    tip:'Pre-sleep window. Curd or paneer (slow protein) is ideal right now.' },
];

let scDietFilter = 'all';

function getCurrentPhase() {
  const h = new Date().getHours();
  return DAY_PHASES.find(p => p.hours.includes(h)) || DAY_PHASES[0];
}

function getScRemaining() {
  const consumed = foods.reduce((s,f) => s + f.protein, 0);
  return Math.max(0, PROTEIN_TARGET - consumed);
}

function getFilteredDB() {
  if (scDietFilter === 'veg')     return FOOD_DB.filter(f => f.type === 'veg');
  if (scDietFilter === 'non-veg') return FOOD_DB.filter(f => f.type !== 'veg');
  return FOOD_DB;
}

/* Core engine — generates up to 3 food combos, pure logic */
function generateSmartChoices() {
  const remaining = getScRemaining();
  const db        = getFilteredDB();
  if (!db.length || remaining <= 0) return [];

  const sorted  = [...db].sort((a,b) => b.protein - a.protein);
  const combos  = [];

  /* ── Strategy 1: Greedy — highest protein first ── */
  let c1 = [], t1 = 0;
  for (const item of sorted) {
    if (c1.length >= 3) break;
    const qty    = item.protein <= 8 ? Math.min(Math.ceil((remaining - t1) / item.protein), 4) : 1;
    const tp     = item.protein * qty;
    const label  = qty > 1 ? `${item.name.replace(/\s*\(.*\)/,'').trim()} ×${qty}` : item.name;
    c1.push({ ...item, qty, tp, label });
    t1 += tp;
    if (t1 >= remaining * 0.85) break;
  }
  if (c1.length) combos.push({ label:'Option 1', items: c1, total: t1 });

  /* ── Strategy 2: Balanced mix ── */
  const veg    = db.filter(f => f.type === 'veg').sort((a,b) => b.protein - a.protein);
  const nonveg = db.filter(f => f.type !== 'veg').sort((a,b) => b.protein - a.protein);
  const pool2  = scDietFilter === 'all'
    ? [...nonveg.slice(0,1), ...veg.slice(0,2)]
    : sorted.slice(1);
  let c2 = [], t2 = 0;
  for (const item of pool2) {
    if (c2.length >= 3) break;
    const qty   = item.protein <= 8 ? Math.min(Math.ceil((remaining - t2) / item.protein), 3) : 1;
    const tp    = item.protein * qty;
    const label = qty > 1 ? `${item.name.replace(/\s*\(.*\)/,'').trim()} ×${qty}` : item.name;
    c2.push({ ...item, qty, tp, label });
    t2 += tp;
    if (t2 >= remaining * 0.80) break;
  }
  if (c2.length && JSON.stringify(c2.map(i=>i.name)) !== JSON.stringify(c1.map(i=>i.name))) {
    combos.push({ label:'Option 2', items: c2, total: t2 });
  }

  /* ── Strategy 3: Phase-aware pick ── */
  const phase = getCurrentPhase();
  const phaseKeywords = {
    shutdown: ['Curd','Paneer','Tofu'],
    start:    ['Egg','Paneer','Whey'],
    build:    ['Chicken','Whey','Egg'],
    work:     ['Soya','Dal','Peanuts','Tuna'],
  };
  const keys   = phaseKeywords[phase.id] || [];
  const pool3  = db.filter(f => keys.some(k => f.name.includes(k)));
  const src3   = pool3.length >= 2 ? pool3.sort((a,b)=>b.protein-a.protein) : sorted;
  let c3 = [], t3 = 0;
  for (const item of src3.slice(0,3)) {
    const qty   = item.protein <= 8 ? Math.min(Math.ceil((remaining - t3) / item.protein), 3) : 1;
    const tp    = item.protein * qty;
    const label = qty > 1 ? `${item.name.replace(/\s*\(.*\)/,'').trim()} ×${qty}` : item.name;
    c3.push({ ...item, qty, tp, label });
    t3 += tp;
    if (t3 >= remaining * 0.80) break;
  }
  if (c3.length && JSON.stringify(c3.map(i=>i.name)) !== JSON.stringify(c1.map(i=>i.name))) {
    combos.push({ label:`${phase.icon} ${phase.name} Pick`, items: c3, total: t3 });
  }

  return combos.slice(0, 3);
}

/* Add a full combo to the food tracker */
function addComboToTracker(idx) {
  const combo = generateSmartChoices()[idx];
  if (!combo) return;
  combo.items.forEach(item => {
    for (let i = 0; i < (item.qty || 1); i++) {
      foods.unshift({ name: item.name, protein: item.protein });
    }
  });
  updateAll();
  saveState();
  showToast(`Added ${combo.items.length} items — +${combo.total}g protein 💪`, 'success');
  renderSmartChoices();
}

/* Add a single snack from the quick grid */
function addSnackToTracker(name, protein) {
  foods.unshift({ name, protein });
  updateAll();
  saveState();
  showToast(`+${protein}g protein added ✓`, 'success');
  renderSmartChoices();
}

/* Diet filter button handler */
function setDiet(type) {
  scDietFilter = type;
  ['all','veg','non-veg'].forEach(t => {
    const btn = document.getElementById('diet-' + (t === 'non-veg' ? 'nonveg' : t));
    if (btn) btn.classList.toggle('active', t === type);
  });
  renderCombos();
  renderSnacks();
}

/* Master render — call when switching to Choices tab */
function renderSmartChoices() {
  renderPhaseBanner();
  renderProteinHeader();
  renderCombos();
  renderSnacks();
}

function renderPhaseBanner() {
  const el = document.getElementById('sc-phase-banner');
  if (!el) return;
  const phase = getCurrentPhase();
  el.innerHTML = `
    <div class="phase-banner ${phase.cls}">
      <div class="phase-icon">${phase.icon}</div>
      <div class="phase-info">
        <div class="phase-name">${phase.name}</div>
        <div class="phase-tip">${phase.tip}</div>
      </div>
    </div>`;
}

function renderProteinHeader() {
  const consumed  = foods.reduce((s,f) => s + f.protein, 0);
  const remaining = Math.max(0, PROTEIN_TARGET - consumed);
  const pct       = Math.min(Math.round(consumed / PROTEIN_TARGET * 100), 100);
  const done      = remaining === 0;

  const setEl = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  setEl('sc-remain',    el => el.textContent = done ? '✓ Done!' : remaining + 'g');
  setEl('sc-consumed',  el => el.textContent = consumed + 'g');
  setEl('sc-prog-bar',  el => el.style.width = pct + '%');
  setEl('sc-remain-sub',el => el.textContent = done
    ? "You've hit your 106g target today. Great work! 🎯"
    : `${consumed}g consumed · ${remaining}g to go · ${pct}% complete`);
}

function renderCombos() {
  const el = document.getElementById('sc-combos');
  if (!el) return;
  const remaining = getScRemaining();

  if (remaining <= 0) {
    el.innerHTML = `<div class="sc-empty"><span>🎯</span>Protein target hit! Nothing left to fill.</div>`;
    return;
  }

  const combos = generateSmartChoices();
  if (!combos.length) {
    el.innerHTML = `<div class="sc-empty"><span>🤔</span>No combos for this filter. Try "All".</div>`;
    return;
  }

  el.innerHTML = combos.map((combo, idx) => `
    <div class="combo-card">
      <div class="combo-header">
        <span class="combo-title">${combo.label}</span>
        <span class="combo-total${combo.total > remaining + 10 ? ' over' : ''}">${combo.total}g</span>
      </div>
      <div class="combo-items">
        ${combo.items.map(item => `
          <div class="combo-item">
            <div class="combo-dot"></div>
            <span class="combo-food">${item.emoji || '🍽️'} ${item.label}</span>
            <span class="combo-g">+${item.tp}g</span>
          </div>`).join('')}
      </div>
      <button class="btn-add-combo" onclick="addComboToTracker(${idx})">
        👉 Add to my day
      </button>
    </div>`).join('');
}

function renderSnacks() {
  const el = document.getElementById('sc-snacks');
  if (!el) return;
  el.innerHTML = getFilteredDB().map(item => `
    <div class="snack-card" onclick="addSnackToTracker(${JSON.stringify(item.name)}, ${item.protein})">
      <div class="snack-name">${item.emoji} ${item.name}</div>
      <div class="snack-prot">+${item.protein}g protein</div>
      <div class="snack-tap">Tap to add</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   PWA — SERVICE WORKER REGISTRATION
══════════════════════════════════════════════════════════════ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[FitSystem] Service workers not supported');
    return;
  }
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(reg => {
      console.log('[FitSystem] SW registered, scope:', reg.scope);
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('App updated — refresh for the latest version', 'info');
          }
        });
      });
    })
    .catch(err => console.warn('[FitSystem] SW registration failed:', err));
}

/* ══════════════════════════════════════════════════════════════
   PWA — INSTALL PROMPT
══════════════════════════════════════════════════════════════ */
function setupInstallPrompt() {
  // Do not show if already installed (standalone mode)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    // Show banner after 4s delay if not previously dismissed
    setTimeout(() => {
      if (!localStorage.getItem('install_dismissed') && !isStandalone) {
        const banner = document.getElementById('install-banner');
        if (banner) banner.classList.add('visible');
      }
    }, 4000);
  });

  window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('visible');
    deferredInstall = null;
    localStorage.setItem('install_dismissed', '1');
    showToast('FitSystem installed! 🎉', 'success');
  });
}

function triggerInstall() {
  if (!deferredInstall) return;
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('visible');
  deferredInstall.prompt();
  deferredInstall.userChoice.then(r => {
    if (r.outcome === 'accepted') showToast('Installing FitSystem…', 'success');
    deferredInstall = null;
  });
}

function dismissInstall() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('visible');
  localStorage.setItem('install_dismissed', '1');
}

/* ══════════════════════════════════════════════════════════════
   OFFLINE DETECTION
══════════════════════════════════════════════════════════════ */
function setupOfflineDetection() {
  function updateOfflineBadge() {
    const badge = document.getElementById('offline-badge');
    if (badge) badge.classList.toggle('visible', !navigator.onLine);
  }
  function onOffline() { updateOfflineBadge(); showToast('Gone offline — AI features paused', 'warning'); }
  function onOnline()  { updateOfflineBadge(); showToast('Back online ✓', 'success'); }
  window.addEventListener('offline', onOffline);
  window.addEventListener('online',  onOnline);
  updateOfflineBadge(); // set initial state without toast
}

/* ══════════════════════════════════════════════════════════════
   KEYBOARD BINDINGS
══════════════════════════════════════════════════════════════ */
function setupKeyBindings() {
  const foodIn = document.getElementById('food-in');
  if (foodIn) {
    foodIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); debouncedAddFood(); }
    });
  }
  const chatIn = document.getElementById('chat-in');
  if (chatIn) {
    chatIn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
function init() {
  // Load all persisted data
  loadState();
  loadAnalytics();
  loadWeightLog();
  loadDailyLogs();
  loadInsightCache();
  loadFirstActTimes();
  loadStoredChronotype();
  loadPatternData();

  // Daily reset check — must run before any rendering
  checkDayReset();

  // Detect behavior patterns (uses dailyLogs, no UI side-effects)
  detectBehaviorPatterns();

  // Set date display
  const dateEl = document.getElementById('top-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });

  // Build dynamic DOM
  buildCheckpoints();
  renderWeightCard();
  updateAll();

  // Keyboard bindings
  setupKeyBindings();

  // PWA setup
  registerServiceWorker();
  setupInstallPrompt();
  setupOfflineDetection();

  // Handle ?panel= URL param (e.g. from manifest shortcuts)
  const urlParams = new URLSearchParams(window.location.search);
  const panelParam = urlParams.get('panel');
  if (panelParam && ['dash','cp','nut','ai'].includes(panelParam)) {
    switchPanel(panelParam);
  }
}

// Boot
init();
