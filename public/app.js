const chartCanvas = document.getElementById("priceChart");
const chartCtx = chartCanvas.getContext("2d");
const diagramCanvas = document.getElementById("strategyCanvas");
const diagramCtx = diagramCanvas.getContext("2d");
const MAX_LOG_ROWS = 8;

const state = {
  candles: [],
  ema20: [],
  ema50: [],
  forecast: [],
  analysis: null,
  feed: null,
  eventSource: null,
  live: true,
  log: [],
};

function resizeCanvas(canvas, cssHeight) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * ratio));
  canvas.height = Math.floor(cssHeight * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  values.forEach((value, index) => {
    out.push(index === 0 ? value : value * k + out[index - 1] * (1 - k));
  });
  return out;
}

function rsi(values, period = 14) {
  let gains = 0;
  let losses = 0;
  for (let i = Math.max(1, values.length - period); i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / Math.max(0.0001, losses));
}

function averageRange(candles) {
  return candles.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / Math.max(1, candles.length);
}

function analyze() {
  const closes = state.candles.map((candle) => candle.close);
  state.ema20 = ema(closes, 20);
  state.ema50 = ema(closes, 50);

  const last = state.candles[state.candles.length - 1];
  const prev = state.candles[Math.max(0, state.candles.length - 9)];
  const lastEma20 = state.ema20[state.ema20.length - 1];
  const lastEma50 = state.ema50[state.ema50.length - 1];
  const lastRsi = rsi(closes);
  const slope = last.close - prev.close;
  const volatility = averageRange(state.candles.slice(-18));
  const trendGap = lastEma20 - lastEma50;
  const trendScore = clamp(20 + trendGap * 1.35 + slope * 0.6, 0, 40);
  const momentumScore = clamp(lastRsi > 50 ? 12 + (lastRsi - 50) * 0.45 : 12 - (50 - lastRsi) * 0.35, 0, 25);
  const riskScore = clamp(15 - volatility * 0.36, 0, 15);
  const total = trendScore + momentumScore + riskScore + 12;

  let signal = "WAIT";
  if (total >= 64 && last.close > lastEma20 && lastEma20 > lastEma50) signal = "BUY";
  if (total <= 38 && last.close < lastEma20 && lastEma20 < lastEma50) signal = "SELL";

  const confidence = signal === "WAIT" ? Math.round(clamp(52 + Math.abs(total - 50) * 0.35, 50, 68)) : Math.round(clamp(total, 61, 88));
  const riskBuffer = Math.max(volatility * 1.4, Math.max(4, last.close * 0.0018));
  const reward = riskBuffer * 1.8;
  const entry = last.close;
  const takeProfit = signal === "SELL" ? entry - reward : entry + reward;
  const stopLoss = signal === "SELL" ? entry + riskBuffer : entry - riskBuffer;

  state.forecast = makeForecast(entry, signal, volatility);
  state.analysis = {
    signal,
    confidence,
    entry,
    takeProfit,
    stopLoss,
    trendScore: Math.round(trendScore),
    momentumScore: Math.round(momentumScore),
    riskScore: Math.round(riskScore),
    strategy: trendGap > 0 ? "Trend Long" : trendGap < 0 ? "Trend Short" : "Wait",
    rsi: lastRsi,
    volatility,
    reason: buildReason(signal, lastRsi, trendGap, slope, volatility),
  };
}

function makeForecast(entry, signal, volatility) {
  const points = [];
  const direction = signal === "SELL" ? -1 : signal === "BUY" ? 1 : 0.12;
  let value = entry;
  for (let i = 1; i <= 12; i++) {
    value += direction * volatility * 0.18 + Math.sin(i / 2) * volatility * 0.06;
    points.push(value);
  }
  return points;
}

function buildReason(signal, rsiValue, trendGap, slope, volatility) {
  const trendText = trendGap > 0 ? "EMA 20 อยู่เหนือ EMA 50 จึงให้น้ำหนักฝั่งซื้อ" : "EMA 20 อยู่ต่ำกว่า EMA 50 จึงให้น้ำหนักฝั่งขาย";
  const momentumText = rsiValue > 62 ? "RSI แข็งแรงแต่เริ่มต้องระวังการย่อ" : rsiValue < 38 ? "RSI อ่อนแรงและอาจรอจังหวะกลับตัว" : "RSI อยู่กลางโซน ต้องดูร่วมกับเทรนด์";
  const actionText = signal === "BUY" ? "ระบบให้ BUY เพราะราคาและแรงส่งยืนยันขาขึ้น" : signal === "SELL" ? "ระบบให้ SELL เพราะราคาอ่อนกว่าเส้นเฉลี่ยและ slope ติดลบ" : "ระบบให้ WAIT เพราะคะแนนรวมยังไม่ชัดพอ";
  return `${actionText}: ${trendText}, ${momentumText}, slope ${slope.toFixed(2)} และ average range ${volatility.toFixed(2)} จุด`;
}

function drawChart() {
  if (!state.candles.length || !state.analysis) return;
  resizeCanvas(chartCanvas, chartCanvas.clientHeight || 470);
  const w = chartCanvas.clientWidth;
  const h = chartCanvas.clientHeight || 470;
  chartCtx.clearRect(0, 0, w, h);

  const pad = { left: 58, right: 58, top: 24, bottom: 38 };
  const visibleCandles = state.candles.slice(-100);
  const emaOffset = state.candles.length - visibleCandles.length;
  const ema20 = state.ema20.slice(emaOffset);
  const ema50 = state.ema50.slice(emaOffset);
  const allPrices = [
    ...visibleCandles.flatMap((candle) => [candle.high, candle.low]),
    ...ema20,
    ...ema50,
    ...state.forecast,
  ];
  const min = Math.min(...allPrices) - state.analysis.volatility;
  const max = Math.max(...allPrices) + state.analysis.volatility;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const candleGap = plotW / (visibleCandles.length + state.forecast.length + 3);
  const candleW = Math.max(4, candleGap * 0.58);
  const y = (price) => pad.top + ((max - price) / (max - min)) * plotH;
  const x = (index) => pad.left + index * candleGap;

  drawGrid(w, h, pad, min, max, y);
  visibleCandles.forEach((candle, index) => drawCandle(candle, x(index), y, candleW));
  drawLine(ema20, x, y, "#f4c44f", 2);
  drawLine(ema50, x, y, "#6aa7ff", 2);
  drawForecast(x, y, visibleCandles.length - 1);
  drawSignalMarker(x, y, visibleCandles.length - 1, visibleCandles[visibleCandles.length - 1].close);
}

function drawGrid(w, h, pad, min, max, y) {
  chartCtx.fillStyle = "#111319";
  chartCtx.fillRect(0, 0, w, h);
  chartCtx.strokeStyle = "rgba(255,255,255,0.08)";
  chartCtx.fillStyle = "#9ba3b2";
  chartCtx.font = "12px Segoe UI";
  chartCtx.textAlign = "right";
  chartCtx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const price = min + (max - min) * (i / 5);
    const yy = y(price);
    chartCtx.beginPath();
    chartCtx.moveTo(pad.left, yy);
    chartCtx.lineTo(w - pad.right, yy);
    chartCtx.stroke();
    chartCtx.fillText(price.toFixed(1), pad.left - 8, yy);
  }
}

function drawCandle(candle, cx, y, candleW) {
  const color = candle.close >= candle.open ? "#42d392" : "#ff6b6b";
  chartCtx.strokeStyle = color;
  chartCtx.lineWidth = 1.4;
  chartCtx.beginPath();
  chartCtx.moveTo(cx, y(candle.high));
  chartCtx.lineTo(cx, y(candle.low));
  chartCtx.stroke();
  const top = y(Math.max(candle.open, candle.close));
  const bottom = y(Math.min(candle.open, candle.close));
  chartCtx.fillStyle = color;
  chartCtx.fillRect(cx - candleW / 2, top, candleW, Math.max(2, bottom - top));
}

function drawLine(values, x, y, color, width) {
  chartCtx.strokeStyle = color;
  chartCtx.lineWidth = width;
  chartCtx.beginPath();
  values.forEach((value, index) => {
    if (index === 0) chartCtx.moveTo(x(index), y(value));
    else chartCtx.lineTo(x(index), y(value));
  });
  chartCtx.stroke();
}

function drawForecast(x, y, start) {
  const last = state.candles[state.candles.length - 1].close;
  chartCtx.strokeStyle = "#b893ff";
  chartCtx.setLineDash([7, 6]);
  chartCtx.lineWidth = 2.5;
  chartCtx.beginPath();
  chartCtx.moveTo(x(start), y(last));
  state.forecast.forEach((value, index) => {
    chartCtx.lineTo(x(start + index + 1), y(value));
  });
  chartCtx.stroke();
  chartCtx.setLineDash([]);
}

function drawSignalMarker(x, y, index, price) {
  const color = state.analysis.signal === "BUY" ? "#42d392" : state.analysis.signal === "SELL" ? "#ff6b6b" : "#f4c44f";
  chartCtx.fillStyle = color;
  chartCtx.strokeStyle = "#101114";
  chartCtx.lineWidth = 3;
  chartCtx.beginPath();
  chartCtx.arc(x(index), y(price), 10, 0, Math.PI * 2);
  chartCtx.fill();
  chartCtx.stroke();
  chartCtx.fillStyle = "#101114";
  chartCtx.font = "bold 11px Segoe UI";
  chartCtx.textAlign = "center";
  chartCtx.textBaseline = "middle";
  chartCtx.fillText(state.analysis.signal[0], x(index), y(price));
}

function drawDiagram() {
  if (!state.candles.length || !state.analysis) return;
  resizeCanvas(diagramCanvas, diagramCanvas.clientHeight || 270);
  const w = diagramCanvas.clientWidth;
  const h = diagramCanvas.clientHeight || 270;
  const points = state.candles.slice(-28).map((candle) => candle.close);
  const min = Math.min(...points) - state.analysis.volatility;
  const max = Math.max(...points) + state.analysis.volatility;
  const px = (i) => 32 + (i / (points.length - 1)) * (w - 64);
  const py = (value) => 32 + ((max - value) / (max - min)) * (h - 86);
  const color = state.analysis.signal === "BUY" ? "#42d392" : state.analysis.signal === "SELL" ? "#ff6b6b" : "#f4c44f";

  diagramCtx.clearRect(0, 0, w, h);
  diagramCtx.fillStyle = "#121419";
  diagramCtx.fillRect(0, 0, w, h);
  diagramCtx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 1; i < 5; i++) {
    diagramCtx.beginPath();
    diagramCtx.moveTo(24, (h / 5) * i);
    diagramCtx.lineTo(w - 24, (h / 5) * i);
    diagramCtx.stroke();
  }

  diagramCtx.strokeStyle = "#f4c44f";
  diagramCtx.lineWidth = 3;
  diagramCtx.beginPath();
  points.forEach((value, i) => {
    if (i === 0) diagramCtx.moveTo(px(i), py(value));
    else diagramCtx.lineTo(px(i), py(value));
  });
  diagramCtx.stroke();

  const lastX = px(points.length - 1);
  const lastY = py(points[points.length - 1]);
  diagramCtx.fillStyle = color;
  diagramCtx.beginPath();
  diagramCtx.arc(lastX, lastY, 15, 0, Math.PI * 2);
  diagramCtx.fill();
  diagramCtx.fillStyle = "#101114";
  diagramCtx.font = "bold 12px Segoe UI";
  diagramCtx.textAlign = "center";
  diagramCtx.textBaseline = "middle";
  diagramCtx.fillText(state.analysis.signal, lastX, lastY);
  drawCallout(30, 22, "Trend", `EMA ${state.analysis.trendScore}/40`, "#6aa7ff");
  drawCallout(w * 0.42, h - 66, "Momentum", `RSI ${state.analysis.rsi.toFixed(0)}`, "#b893ff");
  drawCallout(w - 190, 22, "Risk Plan", `SL ${fmt(state.analysis.stopLoss)}`, color);
}

function drawCallout(x, y, title, text, color) {
  diagramCtx.fillStyle = "rgba(24,26,32,0.94)";
  diagramCtx.strokeStyle = color;
  diagramCtx.lineWidth = 1.5;
  diagramCtx.beginPath();
  diagramCtx.roundRect(x, y, 160, 48, 8);
  diagramCtx.fill();
  diagramCtx.stroke();
  diagramCtx.fillStyle = "#f2f4f8";
  diagramCtx.font = "bold 13px Segoe UI";
  diagramCtx.textAlign = "left";
  diagramCtx.fillText(title, x + 12, y + 18);
  diagramCtx.fillStyle = "#9ba3b2";
  diagramCtx.font = "12px Segoe UI";
  diagramCtx.fillText(text, x + 12, y + 36);
}

function updateUi() {
  const a = state.analysis;
  const signalEl = document.getElementById("signal");
  signalEl.textContent = a.signal;
  signalEl.className = `signal ${a.signal.toLowerCase()}`;
  document.getElementById("confidence").textContent = `${a.confidence}%`;
  document.getElementById("confidenceRing").style.borderColor = a.signal === "BUY" ? "#42d392" : a.signal === "SELL" ? "#ff6b6b" : "#f4c44f";
  document.getElementById("entry").textContent = fmt(a.entry);
  document.getElementById("takeProfit").textContent = fmt(a.takeProfit);
  document.getElementById("stopLoss").textContent = fmt(a.stopLoss);
  document.getElementById("reason").textContent = a.reason;
  document.getElementById("trendScore").textContent = `${a.trendScore}/40`;
  document.getElementById("momentumScore").textContent = `${a.momentumScore}/25`;
  document.getElementById("riskScore").textContent = `${a.riskScore}/15`;
  document.getElementById("strategyName").textContent = a.strategy;
  document.getElementById("lastPrice").textContent = `Price: ${fmt(a.entry)} ${state.feed?.currency || "USD"}`;
  document.getElementById("marketState").textContent = `Market: ${state.feed?.marketState || "-"}`;
  document.getElementById("updatedAt").textContent = `Updated: ${new Date(state.feed?.fetchedAt || Date.now()).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  document.getElementById("sourceName").textContent = `Source: ${state.feed?.source || "-"}`;
  drawHistory();
}

function pushLog(note) {
  const a = state.analysis;
  state.log.unshift({
    time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    signal: a.signal,
    entry: a.entry,
    tp: a.takeProfit,
    sl: a.stopLoss,
    confidence: a.confidence,
    note,
  });
  state.log = state.log.slice(0, MAX_LOG_ROWS);
}

function drawHistory() {
  const body = document.getElementById("historyBody");
  body.innerHTML = state.log
    .map(
      (row) => `
        <tr>
          <td>${row.time}</td>
          <td class="${row.signal.toLowerCase()}">${row.signal}</td>
          <td>${fmt(row.entry)}</td>
          <td>${fmt(row.tp)}</td>
          <td>${fmt(row.sl)}</td>
          <td>${row.confidence}%</td>
          <td>${row.note}</td>
        </tr>
      `,
    )
    .join("");
}

function applyFeed(feed, note = "Live update") {
  state.feed = feed;
  state.candles = feed.candles;
  analyze();
  pushLog(note);
  updateUi();
  drawChart();
  drawDiagram();
  setFeedStatus(`Live ${feed.symbol} | ${feed.exchange}`);
}

async function refreshOnce() {
  const symbol = document.getElementById("symbolSelect").value;
  setFeedStatus("Fetching latest price...");
  const response = await fetch(`/api/gold?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Market feed failed");
  }
  applyFeed(await response.json(), "Manual refresh");
}

function startStream() {
  stopStream();
  const symbol = document.getElementById("symbolSelect").value;
  state.live = true;
  document.getElementById("liveBtn").classList.add("is-live");
  document.getElementById("liveBtn").textContent = "● Live";
  setFeedStatus("Connecting live stream...");
  state.eventSource = new EventSource(`/api/gold/stream?symbol=${encodeURIComponent(symbol)}`);
  state.eventSource.addEventListener("price", (event) => applyFeed(JSON.parse(event.data), "Stream update"));
  state.eventSource.addEventListener("error", () => setFeedStatus("Stream retrying..."));
}

function stopStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

function toggleLive() {
  if (state.live) {
    state.live = false;
    stopStream();
    document.getElementById("liveBtn").classList.remove("is-live");
    document.getElementById("liveBtn").textContent = "○ Paused";
    setFeedStatus("Live paused");
  } else {
    startStream();
  }
}

function setFeedStatus(text) {
  document.getElementById("feedStatus").textContent = text;
}

function fmt(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

document.getElementById("refreshBtn").addEventListener("click", () => refreshOnce().catch((error) => setFeedStatus(error.message)));
document.getElementById("diagramBtn").addEventListener("click", drawDiagram);
document.getElementById("liveBtn").addEventListener("click", toggleLive);
document.getElementById("symbolSelect").addEventListener("change", startStream);
window.addEventListener("resize", () => {
  drawChart();
  drawDiagram();
});

startStream();
