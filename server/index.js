// server/index.js
import dns from "node:dns";
dns.setDefaultResultOrder?.("ipv4first"); // prefer IPv4 to avoid some VPN/ISP stalls

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------- env ----------
dotenv.config();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const PORT = process.env.PORT || 8787;
const isProd = process.env.NODE_ENV === "production";

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- rate limiter (disabled in dev/localhost) ----------
const apiLimiter = rateLimit({
  windowMs: 15_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({
        error:
          "Client-limited: Too many requests from this IP. Wait a few seconds.",
      });
  },
  skip: (req, _res) => !isProd || req.ip === "::1" || req.ip === "127.0.0.1",
});
app.use("/api/", apiLimiter);

// ---------- Gemini client ----------
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function trimMessages(messages, pairs = 3) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-(pairs * 2));
}

function toGeminiContents(messages = []) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content ?? "" }],
  }));
}

// Non-streaming wrapper with hard timeout + tiny retry
async function generateWithRetry({
  modelId,
  system,
  contents,
  temperature = 0.7,
  maxOutputTokens = 96,
}) {
  const model = genAI.getGenerativeModel({
    model: modelId,
    ...(system && system.trim() ? { systemInstruction: system } : {}),
  });
  const timeout = (ms) =>
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("Timeout: upstream too slow")), ms)
    );
  const call = () =>
    model.generateContent({
      contents,
      generationConfig: { temperature, maxOutputTokens },
    });
  try {
    return await Promise.race([call(), timeout(10_000)]);
  } catch (err) {
    const msg = (err?.message || "").toLowerCase();
    const transient = /timeout|exhausted|quota|429|reset|temporar/i.test(msg);
    if (!transient) throw err;
    await sleep(300 + Math.floor(Math.random() * 200));
    return await call();
  }
}

// ---------- Health / Diag ----------
app.get("/api/health", (_req, res) => {
  const preview = GEMINI_API_KEY
    ? `${GEMINI_API_KEY.slice(0, 4)}...${GEMINI_API_KEY.slice(-4)}`
    : null;
  res.json({
    ok: true,
    hasKey: !!GEMINI_API_KEY,
    keyPreview: preview,
    port: PORT,
    prod: isProd,
  });
});

app.get("/api/diag", async (_req, res) => {
  if (!GEMINI_API_KEY)
    return res.status(500).json({ ok: false, error: "Missing GEMINI_API_KEY" });
  const started = Date.now();
  try {
    const r = await generateWithRetry({
      modelId: "gemini-1.5-flash",
      system: "",
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      temperature: 0,
      maxOutputTokens: 1,
    });
    res.json({
      ok: true,
      ms: Date.now() - started,
      content: r.response?.text?.() ?? "",
    });
  } catch (e) {
    res
      .status(502)
      .json({
        ok: false,
        ms: Date.now() - started,
        error: e.message || String(e),
      });
  }
});

// ---------- Non-streaming chat (kept for fallback) ----------
app.post("/api/chat", async (req, res) => {
  try {
    if (!GEMINI_API_KEY)
      return res
        .status(500)
        .json({ error: "Missing GEMINI_API_KEY on server" });

    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "gemini-1.5-flash",
      temperature = 0.7,
    } = req.body || {};

    const trimmed = trimMessages(messages, 3);
    const contents = toGeminiContents(trimmed);

    const r = await generateWithRetry({
      modelId: model,
      system,
      contents,
      temperature,
      maxOutputTokens: 96,
    });

    const reply = r.response?.text?.() ?? "";
    res.json({ reply });
  } catch (err) {
    console.error("[chat] error:", err);
    const raw =
      err?.response?.data?.error?.message || err?.message || "Upstream error";
    const friendly = /quota|exhausted|429/i.test(raw)
      ? "Gemini-limited: Rate limit or quota exceeded."
      : /timeout/i.test(raw)
      ? "Network/timeout: Upstream took too long. Try again."
      : raw;
    res.status(502).json({ error: friendly });
  }
});

// ---------- Streaming chat ----------
app.post("/api/chat/stream", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Server error: Missing GEMINI_API_KEY");
    }

    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "gemini-1.5-flash",
      temperature = 0.7,
    } = req.body || {};

    // Prepare upstream call
    const trimmed = trimMessages(messages, 3);
    const contents = toGeminiContents(trimmed);
    const gModel = genAI.getGenerativeModel({
      model,
      ...(system && system.trim() ? { systemInstruction: system } : {}),
    });

    // Streaming response headers (raw text chunks; easy to read on the client)
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // helpful if behind nginx

    let clientClosed = false;
    req.on("close", () => {
      clientClosed = true;
    });

    // Start streaming from Gemini
    const result = await gModel.generateContentStream({
      contents,
      generationConfig: { temperature, maxOutputTokens: 400 },
    });

    // Safety timer in case nothing arrives
    const firstChunkTimer = setTimeout(() => {
      if (!clientClosed) {
        res.write("..."); // keep-alive nudge
      }
    }, 4000);

    for await (const chunk of result.stream) {
      if (clientClosed) break;
      const delta = chunk?.text?.();
      if (delta) res.write(delta);
    }
    clearTimeout(firstChunkTimer);
    res.end();
  } catch (err) {
    console.error("[chat/stream] error:", err);
    const msg =
      err?.response?.data?.error?.message || err?.message || "Upstream error";
    // Return a short error as plain text so client can surface it
    try {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    } catch {}
    res.end(`Error: ${msg}`);
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`, {
    hasKey: !!GEMINI_API_KEY,
    prod: isProd,
  });
});
