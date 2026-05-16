const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 5177);
const PUBLIC_DIR = path.join(__dirname, "public");
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const DEFAULT_SYMBOL = "GC=F";
const DEFAULT_TIMEFRAME = "1m";
const INTERVAL_MS = 10000;
const TIMEFRAMES = {
  "1m": { interval: "1m", range: "1d", label: "1 Minute" },
  "5m": { interval: "5m", range: "5d", label: "5 Minutes" },
  "15m": { interval: "15m", range: "5d", label: "15 Minutes" },
  "30m": { interval: "30m", range: "1mo", label: "30 Minutes" },
  "1h": { interval: "60m", range: "3mo", label: "1 Hour" },
  "1d": { interval: "1d", range: "1y", label: "1 Day" },
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function normalizeSymbol(rawSymbol) {
  const symbol = String(rawSymbol || DEFAULT_SYMBOL).trim().toUpperCase();
  return /^[A-Z0-9=.\-^]+$/.test(symbol) ? symbol : DEFAULT_SYMBOL;
}

function normalizeTimeframe(rawTimeframe) {
  const timeframe = String(rawTimeframe || DEFAULT_TIMEFRAME).trim();
  return TIMEFRAMES[timeframe] ? timeframe : DEFAULT_TIMEFRAME;
}

async function fetchGoldCandles(symbol = DEFAULT_SYMBOL, timeframe = DEFAULT_TIMEFRAME) {
  const timeframeConfig = TIMEFRAMES[normalizeTimeframe(timeframe)];
  const params = new URLSearchParams({
    interval: timeframeConfig.interval,
    range: timeframeConfig.range,
    includePrePost: "false",
  });
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "gold-ai-signal-mvp/0.2",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Market data request failed with ${response.status}`);
  }

  const data = await response.json();
  const result = data.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];

  if (!result || !quote || timestamps.length === 0) {
    throw new Error("Market data response did not contain candles");
  }

  const candles = timestamps
    .map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toISOString(),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index] || 0,
    }))
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value)),
    )
    .slice(-140);

  if (candles.length < 30) {
    throw new Error("Not enough valid market candles");
  }

  return {
    source: "Yahoo Finance chart API",
    symbol: result.meta?.symbol || symbol,
    exchange: result.meta?.fullExchangeName || result.meta?.exchangeName || "Market",
    currency: result.meta?.currency || "USD",
    regularMarketPrice: result.meta?.regularMarketPrice || candles[candles.length - 1].close,
    marketState: result.meta?.marketState || "UNKNOWN",
    timeframe,
    timeframeLabel: timeframeConfig.label,
    interval: timeframeConfig.interval,
    range: timeframeConfig.range,
    fetchedAt: new Date().toISOString(),
    candles,
  };
}

function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = path
    .normalize(decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  const timeframe = normalizeTimeframe(url.searchParams.get("timeframe"));

  try {
    sendJson(res, 200, await fetchGoldCandles(symbol, timeframe));
  } catch (error) {
    sendJson(res, 502, {
      error: "MARKET_DATA_UNAVAILABLE",
      message: error.message,
      fetchedAt: new Date().toISOString(),
    });
  }
}

function handleStream(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  const timeframe = normalizeTimeframe(url.searchParams.get("timeframe"));
  let closed = false;

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  const send = async () => {
    if (closed) return;
    try {
      const payload = await fetchGoldCandles(symbol, timeframe);
      res.write(`event: price\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message, fetchedAt: new Date().toISOString() })}\n\n`);
    }
  };

  send();
  const timer = setInterval(send, INTERVAL_MS);

  req.on("close", () => {
    closed = true;
    clearInterval(timer);
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (pathname === "/api/gold") {
    handleApi(req, res);
    return;
  }

  if (pathname === "/api/gold/stream") {
    handleStream(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Gold AI Signal MVP running at http://${HOST}:${PORT}`);
});
