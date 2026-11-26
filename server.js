// Lookbook: serve o app (PWA) e repassa os pedidos de IA para a API da Anthropic.
// A chave fica só aqui no servidor (variável ANTHROPIC_API_KEY no Render), nunca no app.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT) || 3000;
// Haiku 5.5: o modelo mais barato (cerca de 1 centavo de real por análise com fotos). Troque por AI_MODEL no Render se quiser outro.
const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const EFFORT = process.env.AI_EFFORT || "low";
const APP_CODE = process.env.APP_CODE || "";            // se definido, o app precisa mandar o mesmo código
const PER_IP_HOUR = Number(process.env.LIMIT_PER_IP_HOUR) || 60;
const PER_DAY = Number(process.env.LIMIT_PER_DAY) || 300; // teto diário total, protege o seu gasto
const MAX_BODY = 12 * 1024 * 1024;

const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".apk": "application/vnd.android.package-archive" };

const hits = new Map(); let day = "", dayCount = 0;
function allow(ip){
  const now = Date.now(), d = new Date().toISOString().slice(0, 10);
  if (d !== day){ day = d; dayCount = 0; }
  if (dayCount >= PER_DAY) return false;
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= PER_IP_HOUR){ hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list); dayCount++;
  if (hits.size > 5000) hits.clear();
  return true;
}

function send(res, status, obj){
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > MAX_BODY){ reject(Object.assign(new Error("grande demais"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function parseJson(text){
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(t.slice(a, b + 1)); } catch {}
  return undefined;
}
const IMG = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function handleAi(req, res){
  if (APP_CODE && req.headers["x-app-code"] !== APP_CODE) return send(res, 403, { code: "not_granted" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (!allow(ip)) return send(res, 429, { code: "rate_limited" });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e){ return send(res, e.status || 400, { code: "invalid_argument" }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 60000) : "";
  if (!prompt) return send(res, 400, { code: "invalid_argument" });
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4)
    .filter(i => i && IMG.has(i.media_type) && typeof i.data === "string")
    .map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } }));
  try {
    // fallback automático no servidor só existe para os modelos Opus/Sonnet/Fable
    const withFallback = !MODEL.startsWith("claude-haiku");
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      output_config: { effort: EFFORT },
      system: "Você é o assistente de moda do app Lookbook. Responda sempre e somente com um único objeto JSON válido, sem texto antes ou depois e sem blocos de código.",
      messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }],
    });
    if (msg.stop_reason === "refusal") return send(res, 422, { code: "image_rejected" });
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    const result = parseJson(text);
    if (result === undefined) return send(res, 502, { code: "invalid_json" });
    return send(res, 200, { result });
  } catch (e){
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { code: "rate_limited" });
    if (e instanceof Anthropic.BadRequestError){ console.error("400:", e.message); return send(res, 400, { code: images.length ? "image_rejected" : "invalid_argument" }); }
    if (e instanceof Anthropic.AuthenticationError){ console.error("chave da API inválida ou ausente"); return send(res, 503, { code: "unavailable" }); }
    if (e instanceof Anthropic.APIError){ console.error(`API ${e.status}:`, e.message); return send(res, 503, { code: "unavailable" }); }
    console.error(e); return send(res, 500, { code: "unavailable" });
  }
}

async function serveStatic(req, res){
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC + path.sep)){ res.writeHead(403); return res.end(); }
  try {
    const data = await fs.readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" || p === "/sw.js" || p === "/config.js" ? "no-cache" : "public, max-age=86400" });
    res.end(data);
  } catch { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Não encontrado"); }
}

http.createServer((req, res) => {
  if (req.method === "OPTIONS"){
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Code", "Access-Control-Max-Age": "86400" });
    return res.end();
  }
  if (req.url.startsWith("/api/ai") && req.method === "POST") return handleAi(req, res);
  if (req.url.startsWith("/api/health")) return send(res, 200, { ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY) });
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`Lookbook ouvindo na porta ${PORT}`));
