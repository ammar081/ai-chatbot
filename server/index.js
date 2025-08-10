// server/index.js
import dns from "node:dns";
dns.setDefaultResultOrder?.("ipv4first");

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || "").trim();
const hasSupabase = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE);

const PORT = process.env.PORT || 8787;
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// dev-friendly limiter
const apiLimiter = rateLimit({
  windowMs: 15_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res
      .status(429)
      .json({
        error:
          "Client-limited: Too many requests from this IP. Wait a few seconds.",
      }),
  skip: (req) => !isProd || req.ip === "::1" || req.ip === "127.0.0.1",
});
app.use("/api/", apiLimiter);

// simple timing log
app.use((req, res, next) => {
  const t = Date.now();
  res.on("finish", () =>
    console.log(
      `[${req.method}] ${req.originalUrl} -> ${res.statusCode} in ${
        Date.now() - t
      }ms`
    )
  );
  next();
});

// --------- Supabase (server-side only) ----------
const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    })
  : null;

// Create conversation
app.post("/api/conversations", async (req, res) => {
  if (!hasSupabase)
    return res.status(501).json({ error: "Supabase not configured" });
  const { title = "Chat", metadata = {} } = req.body || {};
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title, metadata })
    .select("id")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ id: data.id });
});

// Get messages for a conversation
app.get("/api/conversations/:id/messages", async (req, res) => {
  if (!hasSupabase)
    return res.status(501).json({ error: "Supabase not configured" });
  const { id } = req.params;
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ messages: data });
});

// Append messages [{role, content}]
app.post("/api/conversations/:id/messages", async (req, res) => {
  if (!hasSupabase)
    return res.status(501).json({ error: "Supabase not configured" });
  const { id } = req.params;
  const { messages = [] } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0)
    return res.json({ ok: true, inserted: 0 });
  const rows = messages
    .filter((m) => m?.role && m?.content)
    .map((m) => ({ conversation_id: id, role: m.role, content: m.content }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, inserted: rows.length });
});

// --------- Gemini (Day 4 streaming preserved) ----------
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
async function generateWithRetry({
  modelId,
  system,
  contents,
  temperature = 0.7,
  maxOutputTokens = 96,
}) {
  const model = genAI.getGenerativeModel({
    model: modelId,
    ...(system?.trim() ? { systemInstruction: system } : {}),
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
    if (!/timeout|exhausted|quota|429|reset|temporar/.test(msg)) throw err;
    await sleep(300 + Math.floor(Math.random() * 200));
    return await call();
  }
}

// health/diag
app.get("/api/health", (_req, res) => {
  const preview = GEMINI_API_KEY
    ? `${GEMINI_API_KEY.slice(0, 4)}...${GEMINI_API_KEY.slice(-4)}`
    : null;
  res.json({
    ok: true,
    hasGeminiKey: !!GEMINI_API_KEY,
    hasSupabase,
    port: PORT,
    prod: isProd,
    keyPreview: preview,
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

// non-streaming (fallback)
app.post("/api/chat", async (req, res) => {
  try {
    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "gemini-1.5-flash",
      temperature = 0.7,
    } = req.body || {};
    const contents = toGeminiContents(trimMessages(messages, 3));
    const r = await generateWithRetry({
      modelId: model,
      system,
      contents,
      temperature,
      maxOutputTokens: 96,
    });
    res.json({ reply: r.response?.text?.() ?? "" });
  } catch (err) {
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

// streaming
app.post("/api/chat/stream", async (req, res) => {
  try {
    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "gemini-1.5-flash",
      temperature = 0.7,
    } = req.body || {};
    const contents = toGeminiContents(trimMessages(messages, 3));
    const gModel = genAI.getGenerativeModel({
      model,
      ...(system?.trim() ? { systemInstruction: system } : {}),
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    let clientClosed = false;
    req.on("close", () => {
      clientClosed = true;
    });

    const result = await gModel.generateContentStream({
      contents,
      generationConfig: { temperature, maxOutputTokens: 400 },
    });
    const firstChunkTimer = setTimeout(() => {
      if (!clientClosed) res.write("...");
    }, 4000);
    for await (const chunk of result.stream) {
      if (clientClosed) break;
      const delta = chunk?.text?.();
      if (delta) res.write(delta);
    }
    clearTimeout(firstChunkTimer);
    res.end();
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message || err?.message || "Upstream error";
    try {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    } catch {}
    res.end(`Error: ${msg}`);
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`, {
    hasSupabase,
  });
});
