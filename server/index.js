// server/index.js
import dns from "node:dns";
dns.setDefaultResultOrder?.("ipv4first"); // prefer IPv4 to avoid some ISP/VPN stalls

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";

// ---------- env ----------
dotenv.config();
const API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const PORT = process.env.PORT || 8787;
const isProd = process.env.NODE_ENV === "production";

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---------- rate limiter (disabled in dev) ----------
const apiLimiter = rateLimit({
  windowMs: 15_000, // 15s window
  max: 3, // 3 req / 15s per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error:
        "Client-limited: Too many requests from this IP. Wait a few seconds.",
    });
  },
  // Skip the limiter in development / localhost
  skip: (req, _res) => !isProd || req.ip === "::1" || req.ip === "127.0.0.1",
});
app.use("/api/", apiLimiter);

// ---------- OpenAI client with strict timeouts ----------
const openai = new OpenAI({
  apiKey: API_KEY,
  timeout: 12_000, // SDK hard timeout (12s)
  maxRetries: 0, // we do one manual quick retry below
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Abort early & retry once on transient errors (429/timeout/reset)
async function createChatCompletion(payload) {
  const ac = new AbortController();
  const t = setTimeout(
    () => ac.abort(new Error("Abort: upstream timeout")),
    10_000
  ); // < SDK timeout

  try {
    return await openai.chat.completions.create(payload, { signal: ac.signal });
  } catch (err) {
    const status = err?.status || err?.response?.status;
    const transient =
      status === 429 ||
      err?.code === "ETIMEDOUT" ||
      err?.code === "ECONNRESET" ||
      err?.name === "AbortError";
    if (!transient) throw err;
    await sleep(300 + Math.floor(Math.random() * 200)); // tiny jitter
    return await openai.chat.completions.create(payload); // one quick retry (no signal)
  } finally {
    clearTimeout(t);
  }
}

// keep only last N exchanges to reduce tokens
function trimMessages(messages, pairs = 3) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-(pairs * 2));
}

// health: confirm server sees the key
app.get("/api/health", (_req, res) => {
  const preview = API_KEY
    ? `${API_KEY.slice(0, 4)}...${API_KEY.slice(-4)}`
    : null;
  res.json({
    ok: true,
    hasKey: !!API_KEY,
    keyPreview: preview,
    port: PORT,
    prod: isProd,
  });
});

// tiny diag: quick ping to OpenAI with 1 token
app.get("/api/diag", async (_req, res) => {
  if (!API_KEY)
    return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });
  const started = Date.now();
  try {
    const c = await createChatCompletion({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    res.json({
      ok: true,
      ms: Date.now() - started,
      content: c.choices?.[0]?.message?.content ?? "",
    });
  } catch (e) {
    res.status(502).json({
      ok: false,
      ms: Date.now() - started,
      error: e.message || String(e),
    });
  }
});

// main chat (non-streaming; Day 4 will stream)
app.post("/api/chat", async (req, res) => {
  try {
    if (!API_KEY)
      return res
        .status(500)
        .json({ error: "Missing OPENAI_API_KEY on server" });

    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "gpt-4o-mini",
      temperature = 0.7,
    } = req.body || {};

    const chat = [];
    if (system && system.trim()) chat.push({ role: "system", content: system });
    for (const m of trimMessages(messages, 3)) {
      if (m?.role && m?.content)
        chat.push({ role: m.role, content: m.content });
    }

    const completion = await createChatCompletion({
      model,
      temperature,
      max_tokens: 96, // small reply → faster and fewer token-limit hits
      messages: chat,
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    res.json({ reply });
  } catch (err) {
    console.error("[chat] error:", err);
    const status = err?.status || err?.response?.status || 502;
    const raw =
      err?.response?.data?.error?.message || err.message || "Upstream error";
    const friendly =
      status === 429
        ? "OpenAI-limited: Rate limit or quota exceeded."
        : /abort|timeout/i.test(raw)
        ? "Network/timeout: Upstream took too long. Try again."
        : raw;
    res.status(status).json({ error: friendly });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`, {
    hasKey: !!API_KEY,
    prod: isProd,
  });
});
