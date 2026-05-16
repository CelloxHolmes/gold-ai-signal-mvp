const chartCanvas = document.getElementById("priceChart");
const chartCtx = chartCanvas.getContext("2d");
const chartTooltip = document.getElementById("chartTooltip");
const diagramCanvas = document.getElementById("strategyCanvas");
const diagramCtx = diagramCanvas.getContext("2d");
const MAX_LOG_ROWS = 8;

const state = {
  candles: [],
  ema20: [],
  ema50: [],
  atr: [],
  macd: [],
  bollinger: [],
  forecast: [],
  analysis: null,
  feed: null,
  eventSource: null,
  live: true,
  showTradePlan: true,
  log: [],
  hover: null,
  chartModel: null,
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

function atr(candles, period = 14) {
  const out = [];
  let previousAtr = 0;
  candles.forEach((candle, index) => {
    const previousClose = index === 0 ? candle.close : candles[index - 1].close;
    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
    if (index === 0) previousAtr = trueRange;
    else if (index < period) previousAtr = (previousAtr * index + trueRange) / (index + 1);
    else previousAtr = (previousAtr * (period - 1) + trueRange) / period;
    out.push(previousAtr);
  });
  return out;
}

function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const line = fast.map((value, index) => value - slow[index]);
  const signal = ema(line, signalPeriod);
  return line.map((value, index) => ({
    macd: value,
    signal: signal[index],
    hist: value - signal[index],
  }));
}

function bollinger(values, period = 20, multiplier = 2) {
  return values.map((value, index) => {
    const start = Math.max(0, index - period + 1);
    const window = values.slice(start, index + 1);
    const mean = window.reduce((sum, item) => sum + item, 0) / window.length;
    const variance = window.reduce((sum, item) => sum + (item - mean) ** 2, 0) / window.length;
    const deviation = Math.sqrt(variance);
    return {
      middle: mean,
      upper: mean + deviation * multiplier,
      lower: mean - deviation * multiplier,
      width: deviation * multiplier * 2,
    };
  });
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

function analyzeHybrid() {
  const closes = state.candles.map((candle) => candle.close);
  state.ema20 = ema(closes, 20);
  state.ema50 = ema(closes, 50);
  state.atr = atr(state.candles, 14);
  state.macd = macd(closes);
  state.bollinger = bollinger(closes);

  const last = state.candles[state.candles.length - 1];
  const prev = state.candles[Math.max(0, state.candles.length - 9)];
  const lastEma20 = state.ema20[state.ema20.length - 1];
  const lastEma50 = state.ema50[state.ema50.length - 1];
  const lastAtr = state.atr[state.atr.length - 1];
  const recentAtr = state.atr.slice(-50);
  const atrAverage = recentAtr.reduce((sum, value) => sum + value, 0) / Math.max(1, recentAtr.length);
  const lastMacd = state.macd[state.macd.length - 1];
  const previousMacd = state.macd[Math.max(0, state.macd.length - 2)];
  const lastBand = state.bollinger[state.bollinger.length - 1];
  const previousBand = state.bollinger[Math.max(0, state.bollinger.length - 2)];
  const previousClose = closes[Math.max(0, closes.length - 2)];
  const lastRsi = rsi(closes);
  const slope = last.close - prev.close;
  const volatility = lastAtr || averageRange(state.candles.slice(-18));
  const trendGap = lastEma20 - lastEma50;
  const trendScore = clamp(12 + (Math.abs(trendGap) / Math.max(0.01, volatility)) * 14 + (Math.abs(slope) / Math.max(0.01, volatility)) * 8, 0, 40);
  const histSlope = lastMacd.hist - previousMacd.hist;
  const bullishTrend = last.close > lastEma20 && lastEma20 > lastEma50;
  const bearishTrend = last.close < lastEma20 && lastEma20 < lastEma50;
  const bullishMomentum = clamp((lastRsi - 45) * 0.45 + (lastMacd.hist > 0 ? 8 : 0) + (histSlope > 0 ? 5 : 0), 0, 25);
  const bearishMomentum = clamp((55 - lastRsi) * 0.45 + (lastMacd.hist < 0 ? 8 : 0) + (histSlope < 0 ? 5 : 0), 0, 25);
  const momentumScore = Math.max(bullishMomentum, bearishMomentum);
  const atrRatio = volatility / Math.max(0.01, atrAverage);
  const riskScore = clamp(15 - Math.abs(Math.log(Math.max(0.2, atrRatio))) * 7, 0, 15);
  const recentBands = state.bollinger.slice(-50);
  const averageBandWidth = recentBands.reduce((sum, band) => sum + band.width, 0) / Math.max(1, recentBands.length);
  const squeeze = lastBand.width < averageBandWidth * 0.72;
  const breakoutUp = last.close > lastBand.upper && previousClose <= previousBand.upper && histSlope > 0;
  const breakoutDown = last.close < lastBand.lower && previousClose >= previousBand.lower && histSlope < 0;
  const trending = trendScore >= 23 && (bullishTrend || bearishTrend);
  const regimeScore = breakoutUp || breakoutDown ? 20 : trending ? 16 : squeeze ? 5 : 10;
  const macdScore = clamp((Math.abs(lastMacd.hist) / Math.max(0.01, volatility)) * 45 + (Math.abs(histSlope) / Math.max(0.01, volatility)) * 35, 0, 20);
  const buyScore = (bullishTrend ? trendScore : trendGap > 0 ? trendScore * 0.45 : 0) + bullishMomentum + riskScore + regimeScore + (breakoutUp ? 12 : 0);
  const sellScore = (bearishTrend ? trendScore : trendGap < 0 ? trendScore * 0.45 : 0) + bearishMomentum + riskScore + regimeScore + (breakoutDown ? 12 : 0);

  let signal = "WAIT";
  if (!squeeze || breakoutUp || breakoutDown) {
    if (buyScore >= 68 && buyScore - sellScore >= 10) signal = "BUY";
    if (sellScore >= 68 && sellScore - buyScore >= 10) signal = "SELL";
  }

  const rawConfidence = Math.max(buyScore, sellScore);
  const confidence = signal === "WAIT" ? Math.round(clamp(50 + Math.abs(buyScore - sellScore) * 0.45, 50, 69)) : Math.round(clamp(rawConfidence, 62, 92));
  const riskBuffer = Math.max(volatility * 1.5, Math.max(4, last.close * 0.0018));
  const rewardMultiple = breakoutUp || breakoutDown ? 2.6 : trending ? 2.2 : 1.6;
  const reward = riskBuffer * rewardMultiple;
  const entry = last.close;
  const takeProfit = signal === "SELL" ? entry - reward : entry + reward;
  const stopLoss = signal === "SELL" ? entry + riskBuffer : entry - riskBuffer;
  const regime = breakoutUp ? "Breakout Up" : breakoutDown ? "Breakout Down" : squeeze ? "Squeeze / Wait" : trending ? "Trend" : "Range";
  const strategy = signal === "WAIT" ? (squeeze ? "Squeeze Wait" : "Hybrid Wait") : breakoutUp || breakoutDown ? "Breakout + ATR" : "Trend + ATR";

  state.forecast = makeForecastHybrid(entry, signal, volatility, lastMacd.hist, regime);
  state.analysis = {
    signal,
    confidence,
    entry,
    takeProfit,
    stopLoss,
    trendScore: Math.round(trendScore),
    momentumScore: Math.round(momentumScore),
    riskScore: Math.round(riskScore),
    regimeScore: Math.round(regimeScore),
    macdScore: Math.round(macdScore),
    strategy,
    regime,
    rsi: lastRsi,
    atr: volatility,
    rr: reward / riskBuffer,
    macdHist: lastMacd.hist,
    macdSlope: histSlope,
    buyScore,
    sellScore,
    volatility,
    reason: buildHybridReason(signal, lastRsi, trendGap, slope, volatility, lastMacd.hist, histSlope, regime, buyScore, sellScore),
  };
}

function makeForecastHybrid(entry, signal, volatility, macdHist, regime) {
  const points = [];
  const direction = signal === "SELL" ? -1 : signal === "BUY" ? 1 : 0.12;
  const regimeMultiplier = regime.includes("Breakout") ? 0.28 : regime === "Trend" ? 0.2 : 0.08;
  const momentumBias = clamp(macdHist / Math.max(0.01, volatility), -0.5, 0.5);
  let value = entry;
  for (let i = 1; i <= 12; i++) {
    value += direction * volatility * regimeMultiplier + momentumBias * volatility * 0.04 + Math.sin(i / 2) * volatility * 0.05;
    points.push(value);
  }
  return points;
}

function buildHybridReason(signal, rsiValue, trendGap, slope, volatility, macdHist, histSlope, regime, buyScore, sellScore) {
  const trendText = trendGap > 0 ? "EMA20 > EMA50 ให้น้ำหนักฝั่งซื้อ" : "EMA20 < EMA50 ให้น้ำหนักฝั่งขาย";
  const momentumText = macdHist > 0 && histSlope > 0 ? "MACD histogram เร่งขึ้น" : macdHist < 0 && histSlope < 0 ? "MACD histogram เร่งลง" : "MACD ยังไม่ยืนยันเต็มที่";
  const rsiText = rsiValue > 62 ? "RSI แข็งแรงแต่ต้องระวังย่อ" : rsiValue < 38 ? "RSI อ่อนแรง/เสี่ยงกลับตัว" : "RSI กลางโซน";
  const actionText = signal === "BUY" ? "AI Hybrid v2 ให้ BUY" : signal === "SELL" ? "AI Hybrid v2 ให้ SELL" : "AI Hybrid v2 ให้ WAIT เพื่อกรองสัญญาณหลอก";
  return `${actionText}: regime=${regime}, ${trendText}, ${momentumText}, ${rsiText}, ATR ${volatility.toFixed(2)}, slope ${slope.toFixed(2)}, buyScore ${buyScore.toFixed(0)} / sellScore ${sellScore.toFixed(0)}`;
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
  const bollingerBands = state.bollinger.slice(emaOffset);
  const visibleMacd = state.macd.slice(emaOffset);
  const allPrices = [
    ...visibleCandles.flatMap((candle) => [candle.high, candle.low]),
    ...ema20,
    ...ema50,
    ...bollingerBands.flatMap((band) => [band.upper, band.lower]),
    state.analysis.entry,
    state.analysis.takeProfit,
    state.analysis.stopLoss,
    ...state.forecast,
  ];
  const min = Math.min(...allPrices) - state.analysis.volatility;
  const max = Math.max(...allPrices) + state.analysis.volatility;
  const plotW = w - pad.left - pad.right;
  const macdHeight = Math.max(82, h * 0.22);
  const macdGap = 14;
  const priceBottom = h - pad.bottom - macdHeight - macdGap;
  const plotH = priceBottom - pad.top;
  const macdTop = priceBottom + macdGap;
  const macdBottom = h - pad.bottom;
  const candleGap = plotW / (visibleCandles.length + state.forecast.length + 3);
  const candleW = Math.max(4, candleGap * 0.58);
  const y = (price) => pad.top + ((max - price) / (max - min)) * plotH;
  const x = (index) => pad.left + index * candleGap;
  state.chartModel = {
    w,
    h,
    pad,
    min,
    max,
    plotW,
    plotH,
    candleGap,
    candleW,
    visibleCandles,
    ema20,
    ema50,
    bollingerBands,
    visibleMacd,
    priceBottom,
    macdTop,
    macdBottom,
    x,
    y,
  };

  drawGrid(w, h, pad, min, max, y);
  visibleCandles.forEach((candle, index) => drawCandle(candle, x(index), y, candleW));
  drawLine(ema20, x, y, "#f4c44f", 2);
  drawLine(ema50, x, y, "#6aa7ff", 2);
  drawDashedLine(bollingerBands.map((band) => band.upper), x, y, "rgba(184,147,255,0.42)", 1.2, [4, 5]);
  drawDashedLine(bollingerBands.map((band) => band.lower), x, y, "rgba(184,147,255,0.42)", 1.2, [4, 5]);
  drawCurrentPriceLine(y, visibleCandles[visibleCandles.length - 1].close);
  drawTradePlanOverlay();
  drawForecast(x, y, visibleCandles.length - 1);
  drawSignalMarker(x, y, visibleCandles.length - 1, visibleCandles[visibleCandles.length - 1].close);
  drawMacdPanel();
  drawCrosshair();
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

function drawCurrentPriceLine(y, price) {
  const model = state.chartModel;
  const yy = y(price);
  chartCtx.strokeStyle = "rgba(255, 74, 104, 0.72)";
  chartCtx.setLineDash([2, 4]);
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(model.pad.left, yy);
  chartCtx.lineTo(model.w - model.pad.right, yy);
  chartCtx.stroke();
  chartCtx.setLineDash([]);

  const label = fmt(price);
  chartCtx.font = "bold 12px Segoe UI";
  const labelW = chartCtx.measureText(label).width + 14;
  chartCtx.fillStyle = "#ff4a68";
  chartCtx.fillRect(model.w - model.pad.right + 6, yy - 10, labelW, 20);
  chartCtx.fillStyle = "#ffffff";
  chartCtx.textAlign = "left";
  chartCtx.textBaseline = "middle";
  chartCtx.fillText(label, model.w - model.pad.right + 13, yy);
}

function drawTradePlanOverlay() {
  if (!state.showTradePlan || !state.analysis || state.analysis.signal === "WAIT") return;
  const model = state.chartModel;
  const levels = [
    { key: "Entry", value: state.analysis.entry, color: "#ffffff", dash: [8, 6] },
    { key: "TP", value: state.analysis.takeProfit, color: "#42d392", dash: [10, 5] },
    { key: "SL", value: state.analysis.stopLoss, color: "#ff6b6b", dash: [10, 5] },
  ];
  const signalIndex = model.visibleCandles.length - 1;
  const signalX = model.x(signalIndex);

  chartCtx.save();
  levels.forEach((level) => {
    const yy = model.y(level.value);
    chartCtx.strokeStyle = level.color;
    chartCtx.lineWidth = level.key === "Entry" ? 1.5 : 1.3;
    chartCtx.setLineDash(level.dash);
    chartCtx.beginPath();
    chartCtx.moveTo(model.pad.left, yy);
    chartCtx.lineTo(model.w - model.pad.right, yy);
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    const label = `${level.key} ${fmt(level.value)}`;
    chartCtx.font = "bold 12px Segoe UI";
    const labelW = chartCtx.measureText(label).width + 16;
    chartCtx.fillStyle = level.color;
    chartCtx.globalAlpha = 0.95;
    chartCtx.fillRect(model.w - model.pad.right - labelW - 8, yy - 11, labelW, 22);
    chartCtx.globalAlpha = 1;
    chartCtx.fillStyle = level.key === "Entry" ? "#101114" : "#081014";
    chartCtx.textAlign = "left";
    chartCtx.textBaseline = "middle";
    chartCtx.fillText(label, model.w - model.pad.right - labelW, yy);
  });

  chartCtx.strokeStyle = "rgba(255,255,255,0.5)";
  chartCtx.setLineDash([4, 5]);
  chartCtx.beginPath();
  chartCtx.moveTo(signalX, model.pad.top);
  chartCtx.lineTo(signalX, model.priceBottom);
  chartCtx.stroke();
  chartCtx.setLineDash([]);

  const timeLabel = `Signal ${formatCandleTime(model.visibleCandles[signalIndex].time)}`;
  chartCtx.font = "bold 12px Segoe UI";
  const timeW = chartCtx.measureText(timeLabel).width + 18;
  chartCtx.fillStyle = "rgba(32,35,43,0.96)";
  chartCtx.fillRect(Math.max(model.pad.left, signalX - timeW / 2), model.pad.top + 8, timeW, 24);
  chartCtx.fillStyle = "#f2f4f8";
  chartCtx.textAlign = "center";
  chartCtx.textBaseline = "middle";
  chartCtx.fillText(timeLabel, Math.max(model.pad.left + timeW / 2, signalX), model.pad.top + 20);
  chartCtx.restore();
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

function drawDashedLine(values, x, y, color, width, dash) {
  chartCtx.save();
  chartCtx.strokeStyle = color;
  chartCtx.lineWidth = width;
  chartCtx.setLineDash(dash);
  chartCtx.beginPath();
  values.forEach((value, index) => {
    if (index === 0) chartCtx.moveTo(x(index), y(value));
    else chartCtx.lineTo(x(index), y(value));
  });
  chartCtx.stroke();
  chartCtx.restore();
}

function drawMacdPanel() {
  const model = state.chartModel;
  const values = model.visibleMacd;
  if (!values.length) return;
  const maxAbs = Math.max(0.01, ...values.flatMap((item) => [Math.abs(item.macd), Math.abs(item.signal), Math.abs(item.hist)]));
  const center = (model.macdTop + model.macdBottom) / 2;
  const halfHeight = (model.macdBottom - model.macdTop) / 2 - 8;
  const yMacd = (value) => center - (value / maxAbs) * halfHeight;

  chartCtx.save();
  chartCtx.strokeStyle = "rgba(255,255,255,0.12)";
  chartCtx.beginPath();
  chartCtx.moveTo(model.pad.left, model.macdTop);
  chartCtx.lineTo(model.w - model.pad.right, model.macdTop);
  chartCtx.moveTo(model.pad.left, center);
  chartCtx.lineTo(model.w - model.pad.right, center);
  chartCtx.stroke();

  values.forEach((item, index) => {
    const xValue = model.x(index);
    const yValue = yMacd(item.hist);
    chartCtx.fillStyle = item.hist >= 0 ? "rgba(66,211,146,0.72)" : "rgba(255,176,32,0.78)";
    chartCtx.fillRect(xValue - model.candleW / 2, Math.min(center, yValue), model.candleW, Math.max(1, Math.abs(center - yValue)));
  });

  drawLine(values.map((item) => item.macd), model.x, yMacd, "#ff9f1a", 1.6);
  drawLine(values.map((item) => item.signal), model.x, yMacd, "#ff4a68", 1.4);

  chartCtx.fillStyle = "#9ba3b2";
  chartCtx.font = "12px Segoe UI";
  chartCtx.textAlign = "left";
  chartCtx.textBaseline = "top";
  chartCtx.fillText("MACD 12 26 9", model.pad.left, model.macdTop + 6);
  chartCtx.restore();
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

function drawCrosshair() {
  const model = state.chartModel;
  if (!model || !state.hover) return;
  const { mouseX, mouseY, candleIndex, price } = state.hover;
  const candle = model.visibleCandles[candleIndex];
  if (!candle) return;
  const crossX = model.x(candleIndex);

  chartCtx.save();
  chartCtx.strokeStyle = "rgba(220, 226, 236, 0.68)";
  chartCtx.lineWidth = 1;
  chartCtx.setLineDash([5, 5]);
  chartCtx.beginPath();
  chartCtx.moveTo(crossX, model.pad.top);
  chartCtx.lineTo(crossX, model.macdBottom);
  chartCtx.moveTo(model.pad.left, mouseY);
  chartCtx.lineTo(model.w - model.pad.right, mouseY);
  chartCtx.stroke();
  chartCtx.setLineDash([]);

  const priceLabel = fmt(price);
  chartCtx.font = "bold 12px Segoe UI";
  const priceLabelW = chartCtx.measureText(priceLabel).width + 14;
  chartCtx.fillStyle = "#303744";
  chartCtx.fillRect(model.w - model.pad.right + 6, mouseY - 10, priceLabelW, 20);
  chartCtx.fillStyle = "#e8edf5";
  chartCtx.textAlign = "left";
  chartCtx.textBaseline = "middle";
  chartCtx.fillText(priceLabel, model.w - model.pad.right + 13, mouseY);

  const timeLabel = formatCandleTime(candle.time);
  const timeLabelW = chartCtx.measureText(timeLabel).width + 18;
  chartCtx.fillStyle = "#303744";
  chartCtx.fillRect(crossX - timeLabelW / 2, model.h - model.pad.bottom + 10, timeLabelW, 22);
  chartCtx.fillStyle = "#e8edf5";
  chartCtx.textAlign = "center";
  chartCtx.fillText(timeLabel, crossX, model.h - model.pad.bottom + 21);

  chartCtx.strokeStyle = "rgba(244, 196, 79, 0.9)";
  chartCtx.lineWidth = 1.5;
  chartCtx.strokeRect(mouseX - 5, mouseY - 5, 10, 10);
  chartCtx.restore();
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
  drawCallout(w * 0.42, h - 66, "Momentum", `RSI ${state.analysis.rsi.toFixed(0)} / MACD ${state.analysis.macdScore}/20`, "#b893ff");
  drawCallout(w - 190, 22, state.analysis.regime, `ATR ${fmt(state.analysis.atr)} / ${state.analysis.rr.toFixed(1)}R`, color);
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
  const lastCandle = state.candles[state.candles.length - 1];
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
  document.getElementById("regimeScore").textContent = `${a.regimeScore}/20`;
  document.getElementById("macdScore").textContent = `${a.macdScore}/20`;
  document.getElementById("atrScore").textContent = `${fmt(a.atr)} / ${a.rr.toFixed(1)}R`;
  document.getElementById("strategyName").textContent = a.strategy;
  document.getElementById("lastPrice").textContent = `Price: ${fmt(a.entry)} ${state.feed?.currency || "USD"}`;
  document.getElementById("ohlcBadge").textContent = `O: ${fmt(lastCandle.open)} H: ${fmt(lastCandle.high)} L: ${fmt(lastCandle.low)} C: ${fmt(lastCandle.close)}`;
  document.getElementById("timeframeBadge").textContent = `TF: ${state.feed?.timeframe || "-"}`;
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
  analyzeHybrid();
  pushLog(note);
  updateUi();
  drawChart();
  drawDiagram();
  setFeedStatus(`Live ${feed.symbol} | ${feed.timeframeLabel || feed.timeframe} | ${feed.exchange}`);
}

async function refreshOnce() {
  const symbol = document.getElementById("symbolSelect").value;
  const timeframe = document.getElementById("timeframeSelect").value;
  setFeedStatus("Fetching latest price...");
  const response = await fetch(`/api/gold?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, { cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Market feed failed");
  }
  applyFeed(await response.json(), "Manual refresh");
}

function startStream() {
  stopStream();
  const symbol = document.getElementById("symbolSelect").value;
  const timeframe = document.getElementById("timeframeSelect").value;
  state.live = true;
  document.getElementById("liveBtn").classList.add("is-live");
  document.getElementById("liveBtn").textContent = "● Live";
  setFeedStatus("Connecting live stream...");
  state.eventSource = new EventSource(`/api/gold/stream?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
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

function toggleTradePlan() {
  state.showTradePlan = !state.showTradePlan;
  const button = document.getElementById("tradePlanBtn");
  button.classList.toggle("is-on", state.showTradePlan);
  button.textContent = state.showTradePlan ? "▤ Trade Plan" : "▢ Trade Plan";
  drawChart();
}

function setFeedStatus(text) {
  document.getElementById("feedStatus").textContent = text;
}

function fmt(value) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCandleTime(value) {
  return new Date(value).toLocaleString("th-TH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priceFromY(mouseY) {
  const model = state.chartModel;
  return model.max - ((mouseY - model.pad.top) / model.plotH) * (model.max - model.min);
}

function updateHover(event) {
  const model = state.chartModel;
  if (!model) return;
  const rect = chartCanvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const inPlot =
    mouseX >= model.pad.left &&
    mouseX <= model.w - model.pad.right &&
    mouseY >= model.pad.top &&
    mouseY <= model.priceBottom;

  if (!inPlot) {
    clearHover();
    return;
  }

  const candleIndex = clamp(Math.round((mouseX - model.pad.left) / model.candleGap), 0, model.visibleCandles.length - 1);
  const candle = model.visibleCandles[candleIndex];
  const macdPoint = model.visibleMacd[candleIndex];
  const price = priceFromY(mouseY);
  state.hover = { mouseX, mouseY, candleIndex, price };
  document.getElementById("ohlcBadge").textContent = `O: ${fmt(candle.open)} H: ${fmt(candle.high)} L: ${fmt(candle.low)} C: ${fmt(candle.close)}`;
  chartTooltip.hidden = false;
  chartTooltip.style.left = `${Math.min(mouseX, rect.width - 210)}px`;
  chartTooltip.style.top = `${Math.min(mouseY, rect.height - 120)}px`;
  chartTooltip.innerHTML = `
    <strong>${formatCandleTime(candle.time)}</strong>
    O ${fmt(candle.open)} &nbsp; H ${fmt(candle.high)}<br>
    L ${fmt(candle.low)} &nbsp; C ${fmt(candle.close)}<br>
    MACD ${macdPoint ? macdPoint.hist.toFixed(3) : "-"}<br>
    Pointer ${fmt(price)}
  `;
  drawChart();
}

function clearHover() {
  if (!state.hover) return;
  state.hover = null;
  chartTooltip.hidden = true;
  if (state.analysis) {
    const lastCandle = state.candles[state.candles.length - 1];
    document.getElementById("ohlcBadge").textContent = `O: ${fmt(lastCandle.open)} H: ${fmt(lastCandle.high)} L: ${fmt(lastCandle.low)} C: ${fmt(lastCandle.close)}`;
  }
  drawChart();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

document.getElementById("refreshBtn").addEventListener("click", () => refreshOnce().catch((error) => setFeedStatus(error.message)));
document.getElementById("diagramBtn").addEventListener("click", drawDiagram);
document.getElementById("liveBtn").addEventListener("click", toggleLive);
document.getElementById("tradePlanBtn").addEventListener("click", toggleTradePlan);
document.getElementById("symbolSelect").addEventListener("change", startStream);
document.getElementById("timeframeSelect").addEventListener("change", startStream);
chartCanvas.addEventListener("mousemove", updateHover);
chartCanvas.addEventListener("mouseleave", clearHover);
window.addEventListener("resize", () => {
  drawChart();
  drawDiagram();
});

startStream();
