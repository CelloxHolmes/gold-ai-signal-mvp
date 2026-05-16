# Gold AI Signal MVP

Realtime-ish gold trading dashboard MVP with a Node.js proxy, candlestick chart, EMA/RSI scoring, forecast line, signal log, and strategy diagram.

## Run locally

```bash
npm start
```

Open:

```text
http://127.0.0.1:5177
```

## Features

- Pulls 1-minute market candles from Yahoo Finance chart data.
- Streams updates to the browser with Server-Sent Events every 10 seconds.
- Calculates EMA 20, EMA 50, RSI, volatility, signal confidence, entry, TP, and SL.
- Draws candlestick chart and strategy diagram on canvas.
- Keeps a live signal log for recent updates.

## Notes

The default symbol is `GC=F` for COMEX Gold Futures. This MVP is for education and prototyping only. Market data can be delayed, unavailable outside trading hours, or subject to provider changes. It is not investment advice.
