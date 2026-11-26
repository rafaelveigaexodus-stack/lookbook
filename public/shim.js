/* Lookbook mobile: substitui os recursos do Claude por armazenamento no aparelho (IndexedDB) e IA pelo servidor */
(() => {
  const CFG = window.LOOKBOOK_CONFIG || {};
  const API = (CFG.apiBase || "").replace(/\/$/, "");
  const err = (code, message) => Object.assign(new Error(message || code), {code});

  /* ---------- banco local ---------- */
  const DB_NAME = "lookbook", STORE = "pecas";
  let dbp;
  const openDb = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(err("unavailable", "IndexedDB indisponível"));
  }));
  const tx = async (mode, fn) => {
    const db = await openDb();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
      let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(err(t.error && t.error.name === "QuotaExceededError" ? "quota_exceeded" : "unavailable", t.error && t.error.message));
    });
  };
  const listeners = new Set();
  async function emit(){
    const db = await openDb();
    const docs = await new Promise((res, rej) => {
      const out = [], c = db.transaction(STORE).objectStore(STORE).openCursor();
      c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); const v = cur.value, id = cur.key; out.push({id, data: () => v}); cur.continue(); };
      c.onerror = () => rej(c.error);
    });
    const snap = {docs, metadata:{fromCache:false}};
    listeners.forEach(([ok]) => { try { ok(snap); } catch (e) { console.error(e); } });
  }
  const dbApi = {
    collection: () => ({
      doc: id => ({
        set: async body => { await tx("readwrite", st => st.put(JSON.parse(JSON.stringify(body)), id)); emit(); },
        delete: async () => { await tx("readwrite", st => st.delete(id)); emit(); },
      }),
      onSnapshot(ok, bad){ const l = [ok, bad]; listeners.add(l); emit().catch(e => bad && bad(err("unavailable", String(e)))); return () => listeners.delete(l); },
    }),
  };
  /* pede ao navegador para não apagar os dados do app */
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}

  /* ---------- IA pelo servidor ---------- */
  const toB64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = rej; f.readAsDataURL(blob); });
  const sample = {
    limits: async () => ({images:{maxCount: 4}}),
    async json(prompt, opts = {}){
      const images = await Promise.all((opts.images || []).slice(0, 4).map(async b => ({media_type: b.type || "image/jpeg", data: await toB64(b)})));
      let r;
      try {
        r = await fetch(API + "/api/ai", {
          method: "POST", signal: opts.signal,
          headers: {"Content-Type": "application/json", "X-App-Code": CFG.appCode || ""},
          body: JSON.stringify({prompt, images, tier: opts.modelTier || "default"}),
        });
      } catch (e){ throw err(e && e.name === "AbortError" ? "cancelled" : "unavailable"); }
      let body = null; try { body = await r.json(); } catch {}
      if (!r.ok) throw err((body && body.code) || (r.status === 429 ? "rate_limited" : "unavailable"));
      if (!body || body.result === undefined) throw err("invalid_json");
      return body.result;
    },
  };

  /* ---------- salvar imagem ---------- */
  const downloads = {
    async save({filename, data}){
      const file = new File([data], filename, {type: data.type || "image/jpeg"});
      if (navigator.canShare && navigator.canShare({files:[file]})){
        try { await navigator.share({files:[file], title: "Meu look"}); return; }
        catch (e){ if (e && e.name === "AbortError") throw err("declined"); }
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = filename;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
  };

  const caps = {db: dbApi, user: {id: async () => "local"}, sample, downloads};
  window.claude = {use: async name => { if (caps[name]) return caps[name]; throw err("not_declared"); }};

  if ("serviceWorker" in navigator && location.protocol === "https:" && !window.Capacitor)
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
