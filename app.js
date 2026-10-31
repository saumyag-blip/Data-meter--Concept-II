/* ===================================================================
   Horizon — app logic
   All data below is simulated on the client so the dashboard has
   something believable to show. Swap `getLiveScore()` and friends
   for real sensor input (Screen Time API, wearable SDK, etc.) later.
   =================================================================== */

/* ---------- small utilities ---------- */
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function lerpColor(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map(v => parseInt(v, 16));
  const b = hexB.match(/\w\w/g).map(v => parseInt(v, 16));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function bandFor(score) {
  if (score >= 76) return 'Clear';
  if (score >= 51) return 'Clearing';
  if (score >= 26) return 'Hazy';
  return 'Overcast';
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* ---------- tab navigation ---------- */
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const target = btn.dataset.tab;
    $$('.tab').forEach(t => t.classList.remove('is-active'));
    $(`#tab-${target}`).classList.add('is-active');
  });
});

function goToTab(name) {
  $(`.nav-item[data-tab="${name}"]`)?.click();
}

/* ---------- clock ---------- */
function tickClock() {
  const now = new Date();
  $('#clockReadout').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
tickClock();
setInterval(tickClock, 15000);

/* ===================================================================
   HORIZON DIAL
   =================================================================== */
let currentScore = 58; // starting mock reading

function renderDial(score) {
  const theta = (score / 100) * Math.PI;
  const cx = 200 - 160 * Math.cos(theta);
  const cy = 190 - 160 * Math.sin(theta);

  $('#sunDot').setAttribute('cx', cx);
  $('#sunDot').setAttribute('cy', cy);

  const t = score / 100;
  const sunColor = lerpColor('5B8FA8', 'E8A567', t);
  $('#sunDot').setAttribute('fill', sunColor);
  $('#skyStopTop').setAttribute('stop-color', sunColor);

  const arcLen = 503; // approx length of the semicircle path
  $('#dialProgress').setAttribute('stroke-dashoffset', arcLen - (arcLen * t));
  $('#dialProgress').setAttribute('stroke', sunColor);

  $('#scoreText').textContent = Math.round(score);
  $('#bandText').textContent = bandFor(score).toUpperCase();

  const window = Math.max(4, Math.round(score * 0.32));
  $('#focusWindow').textContent = `~${window} min`;

  const debt = clamp(100 - score + 10, 5, 95);
  $('#debtFill').style.width = `${debt}%`;
  $('#attentionDebt').textContent = debt > 60 ? 'Building up' : debt > 30 ? 'Manageable' : 'Low';

  const captions = {
    Clear:     'Good conditions for the hardest thing on your list.',
    Clearing:  'Steadying. A good moment to start something that needs focus.',
    Hazy:      'Attention is scattered. Short blocks will work better than long ones.',
    Overcast:  'Running low. Consider a real break before pushing into deep work.'
  };
  $('#dialCaption').textContent = captions[bandFor(score)];

  updatePrompt(score);
}

function updatePrompt(score) {
  const title = $('#promptTitle');
  const body  = $('#promptBody');
  const action = $('#promptAction');

  if (score < 40) {
    title.textContent = 'Your window looks short right now';
    body.textContent = 'A short protected block can steady things before you take on something demanding.';
    action.textContent = 'Start a 12-minute block';
  } else if (score < 70) {
    title.textContent = 'Conditions are clearing';
    body.textContent = 'This is a reasonable moment to start on real work — an 18-minute block fits the current window.';
    action.textContent = 'Start an 18-minute block';
  } else {
    title.textContent = 'This is about as clear as it gets today';
    body.textContent = 'Worth spending it on the task you keep putting off.';
    action.textContent = 'Start a 25-minute block';
  }
}

$('#promptAction').addEventListener('click', () => goToTab('session'));

/* gentle random walk so the dashboard feels alive */
setInterval(() => {
  currentScore = clamp(currentScore + (Math.random() * 10 - 5), 8, 96);
  renderDial(currentScore);
  pushSpark(currentScore);
}, 4000);

renderDial(currentScore);

/* ---------- contributing factors disclosure ---------- */
$('#factorsToggle').addEventListener('click', () => {
  $('#factorsToggle').parentElement.classList.toggle('is-open');
});

/* ===================================================================
   MINI SPARKLINE (home, "since this morning")
   =================================================================== */
const sparkHistory = Array.from({ length: 24 }, () => 40 + Math.random() * 40);
function pushSpark(v) {
  sparkHistory.push(v);
  if (sparkHistory.length > 24) sparkHistory.shift();
  drawSpark();
}
function drawSpark() {
  const canvas = $('#miniSpark');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const max = 100, min = 0;
  const step = w / (sparkHistory.length - 1);

  ctx.beginPath();
  sparkHistory.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / (max - min)) * (h - 8) - 4;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#E8A567';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const last = sparkHistory[sparkHistory.length - 1];
  const lastY = h - ((last - min) / (max - min)) * (h - 8) - 4;
  ctx.beginPath();
  ctx.arc(w - step, lastY, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#E8A567';
  ctx.fill();
}
drawSpark();

/* ===================================================================
   SESSION TAB
   =================================================================== */
let sessionRunning = false;
let sessionSeconds = 0;
let sessionTargetSeconds = 18 * 60;
let sessionInterval = null;
const sessionHistory = [];

function formatTime(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

$('#sessionStart').addEventListener('click', () => {
  if (sessionRunning) {
    stopSession();
  } else {
    startSession();
  }
});

function startSession() {
  sessionRunning = true;
  sessionSeconds = 0;
  sessionTargetSeconds = parseInt($('#sessionLength').value, 10) * 60;
  sessionHistory.length = 0;
  $('#sessionStart').textContent = 'End session';
  $('#driftPanel').hidden = true;

  sessionInterval = setInterval(() => {
    sessionSeconds++;
    $('#sessionTimer').textContent = formatTime(sessionSeconds);

    // simulated live focus during the block — drifts down, recovers a bit
    const progress = sessionSeconds / sessionTargetSeconds;
    const drift = Math.sin(progress * Math.PI * 1.4) * 12;
    const noise = (Math.random() - 0.5) * 8;
    const liveScore = clamp(75 - progress * 20 + drift + noise, 20, 95);
    sessionHistory.push(liveScore);
    drawSessionChart();

    // occasional gentle drift alert
    if (sessionSeconds > 60 && liveScore < 38 && Math.random() < 0.02 && $('#driftPanel').hidden) {
      $('#driftPanel').hidden = false;
    }

    if (sessionSeconds >= sessionTargetSeconds) {
      stopSession();
    }
  }, 1000);
}

function stopSession() {
  sessionRunning = false;
  clearInterval(sessionInterval);
  $('#sessionStart').textContent = 'Start session';
}

$('#driftDismiss').addEventListener('click', () => { $('#driftPanel').hidden = true; });
$('#driftReset').addEventListener('click', () => {
  $('#driftPanel').hidden = true;
  stopSession();
  $('#sessionTimer').textContent = '02:00';
});

function drawSessionChart() {
  const canvas = $('#sessionCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (sessionHistory.length < 2) return;

  const max = 100, min = 0;
  const step = w / (sessionTargetSeconds - 1);

  ctx.beginPath();
  sessionHistory.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / (max - min)) * (h - 16) - 8;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#E8A567';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.lineTo(sessionHistory.length * step, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(232,165,103,0.08)';
  ctx.fill();
}

/* ===================================================================
   TRENDS TAB
   =================================================================== */
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayScores = [52, 61, 47, 68, 74, 40, 58];

function drawTrends() {
  const canvas = $('#trendsCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const padding = 30;
  const barWidth = (w - padding * 2) / dayScores.length * 0.55;
  const gap = (w - padding * 2) / dayScores.length;

  dayScores.forEach((score, i) => {
    const barH = (score / 100) * (h - padding * 2);
    const x = padding + i * gap + (gap - barWidth) / 2;
    const y = h - padding - barH;

    const t = score / 100;
    ctx.fillStyle = lerpColor('5B8FA8', 'E8A567', t);
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, 6);
    ctx.fill();

    ctx.fillStyle = '#5C6584';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(days[i], x + barWidth / 2, h - padding + 18);

    ctx.fillStyle = '#93A0BD';
    ctx.fillText(score, x + barWidth / 2, y - 8);
  });

  // baseline
  ctx.strokeStyle = 'rgba(232,227,216,0.14)';
  ctx.beginPath();
  ctx.moveTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();
}
drawTrends();

const insights = [
  'Focus was strongest on Friday afternoons — well above your weekly average.',
  'Saturday consistently reads lowest. Consider treating weekends as recovery, not catch-up time.',
  'Scores climb on days that start with a walk or exercise before the first work block.',
  'Long unbroken screen stretches past 90 minutes tend to precede a same-day dip.'
];
$('#insightsList').innerHTML = insights.map(i => `<li>${i}</li>`).join('');

/* ===================================================================
   SETTINGS — attention probe (simple reaction-time calibration)
   =================================================================== */
let probeRound = 0;
let probeTimes = [];
let probeShownAt = 0;
const PROBE_ROUNDS = 5;

$('#probeStart').addEventListener('click', () => {
  probeRound = 0;
  probeTimes = [];
  $('#probeResult').textContent = '';
  runProbeRound();
});

function runProbeRound() {
  const stage = $('#probeStage');
  stage.innerHTML = '';

  if (probeRound >= PROBE_ROUNDS) {
    const avg = Math.round(probeTimes.reduce((a, b) => a + b, 0) / probeTimes.length);
    $('#probeResult').textContent = `Average response: ${avg} ms — reading logged for calibration.`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Run 45-second probe';
    btn.id = 'probeStart2';
    btn.addEventListener('click', () => { probeRound = 0; probeTimes = []; $('#probeResult').textContent = ''; runProbeRound(); });
    stage.appendChild(btn);
    return;
  }

  const delay = 600 + Math.random() * 1400;
  const label = document.createElement('p');
  label.style.cssText = 'position:absolute;top:10px;left:14px;font-size:11px;color:var(--text-dim);font-family:var(--font-mono)';
  label.textContent = `Round ${probeRound + 1} of ${PROBE_ROUNDS} — wait for the dot`;
  stage.appendChild(label);

  setTimeout(() => {
    const target = document.createElement('button');
    target.className = 'probe-target';
    const stageRect = stage.getBoundingClientRect();
    const maxX = stageRect.width - 34;
    const maxY = stageRect.height - 34;
    target.style.left = `${Math.random() * maxX}px`;
    target.style.top = `${Math.random() * maxY}px`;

    probeShownAt = performance.now();
    target.addEventListener('click', () => {
      const rt = performance.now() - probeShownAt;
      probeTimes.push(rt);
      probeRound++;
      runProbeRound();
    });
    stage.appendChild(target);
  }, delay);
}

/* ---------- tone pills ---------- */
$$('.tone-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    $$('.tone-pill').forEach(p => p.classList.remove('is-active'));
    pill.classList.add('is-active');
  });
});
