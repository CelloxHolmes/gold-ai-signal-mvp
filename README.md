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
- Supports selectable timeframes: 1m, 5m, 15m, 30m, 1h, and 1D.
- Streams updates to the browser with Server-Sent Events every 10 seconds.
- Uses AI Hybrid v2 scoring with EMA trend, RSI, MACD histogram, Bollinger breakout/squeeze, ATR volatility, and market regime filters.
- Calculates signal confidence, entry, ATR-based TP/SL, risk/reward, and separate buy/sell scores.
- Draws candlestick chart, Bollinger Bands, MACD panel, and strategy diagram on canvas.
- Shows a TradingView-style crosshair, OHLC hover readout, tooltip, and current price line.
- Adds a toggleable Trade Plan overlay for Entry, Take Profit, Stop Loss, and signal time.
- Keeps a live signal log for recent updates.

## Presentation video

The demo presentation is available as MP4 and WebM:

```text
presentation/gold-ai-signal-demo.mp4
presentation/gold-ai-signal-demo.webm
```

The source presentation page is:

```text
presentation/gold-ai-signal-presentation.html
```

## Gold Oracle Facebook assets

Ready-to-upload Facebook brand assets are in:

```text
marketing/gold-oracle/
```

Includes profile image, cover image, demo video, and launch copy.

## Notes

The default symbol is `GC=F` for COMEX Gold Futures. This MVP is for education and prototyping only. Market data can be delayed, unavailable outside trading hours, or subject to provider changes. It is not investment advice.
