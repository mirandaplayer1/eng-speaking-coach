(function () {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const cls = s => s == null ? "n" : s >= 80 ? "g" : s >= 60 ? "m" : "b";
const col = s => s >= 80 ? "var(--good)" : s >= 60 ? "var(--mid)" : "var(--bad)";
const catOf = id => CATS.find(c => c.id === id);
const ytSearch = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
const IC = {
  spk: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  slow: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="11" fill="rgb(0 0 0/.45)"/><path d="M10 8l6 4-6 4z"/></svg>'
};

let S = { tab: "practice", cat: CATS[0].id, kind: "sent", vcat: "mine" };
let stats = load("stats", { ph: {}, items: {}, days: {} });
let myVids = load("my-videos", []);
let prefs = load("prefs", { rate: 1, demo: false });
let ses = null; // {items, i, state, result, sel}

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

/* ---------- TTS ---------- */
let voice = null;
function pickVoice() { const vs = speechSynthesis.getVoices(); voice = vs.find(v => /Samantha|Ava|Allison/.test(v.name) && /en-US/.test(v.lang)) || vs.find(v => v.lang === "en-US") || null; }
try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch (e) {}
function say(t, slow) {
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "en-US"; if (voice) u.voice = voice; u.rate = (slow ? .7 : 1) * prefs.rate; speechSynthesis.speak(u); } catch (e) { toast("這台裝置不能播放示範語音"); }
}

/* ---------- 題目 ---------- */
function weakest() {
  const arr = Object.entries(stats.ph).filter(([, v]) => v.n >= 2).map(([p, v]) => ({ p, avg: v.s / v.n })).sort((a, b) => a.avg - b.avg);
  return arr;
}
function itemsFor(cat, kind) {
  if (kind === "scene") return SCENES.map(t => ({ t, cat: null }));
  if (cat === "weak") {
    const w = weakest().slice(0, 3).map(x => TIPS[x.p] && TIPS[x.p].cat).filter(Boolean);
    const cats = [...new Set(w)];
    if (!cats.length) return itemsFor(CATS[0].id, kind);
    return cats.flatMap(c => itemsFor(c, kind).slice(0, kind === "word" ? 4 : 2));
  }
  const c = catOf(cat);
  return kind === "word" ? c.words.map(t => ({ t, cat: c.id, word: true })) : c.sentences.map(([t, ipa]) => ({ t, ipa, cat: c.id }));
}

/* ---------- 主畫面 ---------- */
function circles(list, sel, attr) {
  return `<div class="circles">${list.map(c => `<button class="circ" data-${attr}="${c.id}" aria-pressed="${c.id === sel}"><i style="background:${c.color}">${esc(c.name)}</i>${esc(c.zh)}</button>`).join("")}</div>`;
}
function vPractice() {
  const hasWeak = weakest().length > 0;
  const list = (hasWeak ? [{ id: "weak", name: "弱", zh: "我的弱點", color: "#1c1c26" }] : []).concat(CATS);
  if (S.cat === "weak" && !hasWeak) S.cat = CATS[0].id;
  const c = S.cat === "weak" ? { zh: "我的弱點", color: "#1c1c26", what: "從你分數最低的音挑題目：" + weakest().slice(0, 3).map(x => "/" + x.p + "/").join("、") } : catOf(S.cat);
  const items = itemsFor(S.cat, S.kind);
  const kinds = [["sent", "句子"], ["word", "單字"], ["scene", "我的情境"]];
  return `<h1>練習</h1>${circles(list, S.cat, "cat")}
  <div class="chips">${kinds.map(([k, n]) => `<button class="chip" data-kind="${k}" aria-pressed="${k === S.kind}">${n}</button>`).join("")}</div>
  <div class="hero"><div class="bar" style="background:${S.kind === "scene" ? "var(--blue)" : c.color}"></div>
    <h3>${S.kind === "scene" ? "創業者會用到的句子" : esc(c.zh)}</h3>
    <p>${S.kind === "scene" ? "自我介紹、約會議、點咖啡。重音和語調也會被評分。" : esc(c.what)}</p>
    <button class="big" data-start="0">${IC.mic.replace("<svg", '<svg width="22" height="22" fill="none" stroke="#fff" stroke-width="2.2"')}開始 ${items.length} 題</button>
  </div>
  <h2>題目</h2>
  <div class="list">${items.map((it, i) => { const s = stats.items[it.t]; return `<button class="item" data-start="${i}"><span>${esc(it.t)}</span><em class="badge ${cls(s)}">${s ?? "—"}</em></button>`; }).join("")}</div>`;
}
function vVideos() {
  const list = [{ id: "mine", name: "+", zh: "My videos", color: "var(--blue)" }].concat(CATS);
  let body;
  if (S.vcat === "mine") {
    body = `<div class="add"><input id="vurl" inputmode="url" placeholder="貼上 YouTube 連結" autocomplete="off"><button class="small" id="vadd">加入</button></div>
    ${myVids.length ? `<div class="list">${myVids.map((v, i) => `<div><div class="frame" data-play="${i}">${v.playing ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?playsinline=1&autoplay=1&cc_load_policy=1&cc_lang_pref=en" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : `<img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;inset:0;display:grid;place-items:center">${IC.play.replace("<svg", '<svg width="56" height="56"')}</span>`}</div><div style="display:flex;justify-content:space-between;align-items:center"><span class="mute">${esc(v.note || "我的影片")}</span><button class="del" data-del="${i}">移除</button></div></div>`).join("")}</div>`
      : `<div class="hint" style="text-align:center">還沒有影片。貼上一個有英文字幕的 YouTube 連結，就能在這裡邊看邊跟讀。</div>`}`;
  } else {
    const c = catOf(S.vcat);
    body = `<p class="mute" style="margin-top:0">${esc(c.what)}</p><div class="list">${c.videos.map(([t, q]) => `<a class="vcard" href="${ytSearch(q)}" target="_blank" rel="noopener"><span class="thumb" style="background:${c.color}"><b style="font:900 22px Nunito">${esc(c.name)}</b></span><span><b>${esc(t)}</b><small>在 YouTube 搜尋 ›</small></span></a>`).join("")}</div>
    <p class="mute">找到好的影片，複製連結貼到 My videos 收藏。</p>
    <button class="big secondary" data-gocat="${c.id}" style="margin-top:8px">練這類發音</button>`;
  }
  return `<h1>影片</h1>${circles(list, S.vcat, "vcat")}${body}`;
}
function vStats() {
  const days = Object.keys(stats.days).length, today = stats.days[new Date().toISOString().slice(0, 10)] || 0;
  const scored = Object.values(stats.items); const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const w = weakest().slice(0, 8);
  return `<h1>紀錄</h1>
  <div class="statbig"><div><b>${today}</b><span>今天練習</span></div><div><b>${days}</b><span>練習天數</span></div><div><b>${avg ?? "—"}</b><span>平均分數</span></div></div>
  <h2>最弱的音</h2>
  ${w.length ? `<div class="list">${w.map(x => { const a = Math.round(x.avg), t = TIPS[x.p]; return `<button class="pbar" data-weak="${esc(t && t.cat || "")}"><b>/${esc(x.p)}/</b><i><span style="width:${a}%;background:${col(a)}"></span></i><em style="color:${col(a)}">${a}</em><small>${esc(t ? t.n : "")}${t && t.cat ? "　點我練習 ›" : ""}</small></button>`; }).join("")}</div>`
    : `<div class="hint">練幾題之後，這裡會列出你分數最低的音素。</div>`}
  <p class="mute" style="margin-top:16px">紀錄只存在這台 iPhone 的 Safari 裡。</p>`;
}
function vSettings() {
  const c = Azure.getCreds() || {};
  const regions = [["eastasia", "East Asia（香港）"], ["southeastasia", "Southeast Asia（新加坡）"], ["japaneast", "Japan East"], ["westus2", "West US 2"], ["eastus", "East US"], ["westeurope", "West Europe"]];
  return `<h1>設定</h1>
  <div class="hero">
    <h3 style="font-size:20px">Azure 語音金鑰</h3>
    <p>發音評分用 Azure Speech。金鑰只存在這台手機，不會上傳到任何地方。</p>
    <div class="field"><label for="key">Key</label><input id="key" type="password" autocomplete="off" value="${esc(c.key || "")}" placeholder="貼上 KEY 1"></div>
    <div class="field"><label for="region">Region</label><select id="region">${regions.map(([v, n]) => `<option value="${v}"${(c.region || "eastasia") === v ? " selected" : ""}>${n}</option>`).join("")}</select></div>
    <button class="big" id="savekey">儲存並測試</button>
    <p id="keymsg" style="margin:10px 0 0"></p>
  </div>
  <h2>還沒有金鑰？</h2>
  <ol class="steps"><li>到 portal.azure.com 登入，搜尋「Speech」並建立</li><li>定價層選 Free F0，區域選 East Asia</li><li>建好後點「Keys and Endpoint」，複製 KEY 1 和 Location</li></ol>
  <p class="mute">Free F0 每月 5 小時音訊免費，每天練 10 分鐘大約剛好。</p>
  <h2>其他</h2>
  <div class="field"><label for="rate">示範語速</label><select id="rate">${[[.8, "慢"], [1, "正常"], [1.15, "快"]].map(([v, n]) => `<option value="${v}"${prefs.rate == v ? " selected" : ""}>${n}</option>`).join("")}</select></div>
  <label class="item" style="cursor:pointer"><span>示範模式（不用金鑰，看假的評分結果）</span><input type="checkbox" id="demo" style="width:24px;height:24px"${prefs.demo ? " checked" : ""}></label>
  <button class="big secondary" id="reset" style="margin-top:14px">清除練習紀錄</button>`;
}
function render() {
  $("#app").innerHTML = { practice: vPractice, videos: vVideos, stats: vStats, settings: vSettings }[S.tab]();
  document.querySelectorAll(".tabs button").forEach(b => b.toggleAttribute("aria-current", false) || (b.dataset.tab === S.tab && b.setAttribute("aria-current", "page")));
}

/* ---------- 練習畫面 ---------- */
function start(i) {
  ses = { items: itemsFor(S.cat, S.kind), i, state: "idle", result: null, sel: null };
  $("#sheet").hidden = false; $("#tabs").hidden = true; drawSheet();
}
function close() { Azure.cancel(); ses = null; $("#sheet").hidden = true; $("#tabs").hidden = false; render(); }
function drawSheet() {
  const it = ses.items[ses.i], c = it.cat ? catOf(it.cat) : null, st = ses.state;
  const prog = ses.items.map((x, k) => `<i class="${k < ses.i ? "done" : k === ses.i ? "on" : ""}"></i>`).join("");
  let body;
  if (st === "result") body = resultView(ses.result, it);
  else body = `<div class="cat-l" style="color:${c ? c.color : "var(--blue)"}">${esc(c ? c.zh : "我的情境")}</div>
    <div class="target${it.word ? " word" : ""}">${esc(it.t)}</div>${it.ipa ? `<p class="ipa"${it.word ? ' style="text-align:center"' : ""}>${esc(it.ipa)}</p>` : ""}
    <div class="listen"${it.word ? ' style="justify-content:center"' : ""}><button class="pill" data-say="0">${IC.spk}聽示範</button><button class="pill" data-say="1">${IC.slow}慢速</button></div>
    ${st === "idle" ? `<div class="hint">先聽一次，再按下面的麥克風唸出來。唸完停一下，會自動結束並評分。</div>` : ""}
    ${st === "error" ? `<div class="fix"><h4>${esc(ses.err.message)}</h4>${ses.err.code === "no_key" || ses.err.code === "bad_key" ? `<div class="row"><button class="pill" data-gotab="settings">去設定</button><button class="pill" data-demo="1">先用示範模式</button></div>` : ""}</div>` : ""}`;
  const micCls = st === "listening" ? "on" : st === "processing" ? "wait" : "";
  const status = { listening: "正在聽…唸完停一下", processing: "評分中…", result: "", idle: "", error: "" }[st];
  $("#sheet").innerHTML = `<div class="sh-top"><button class="x" data-close aria-label="關閉">×</button><div class="prog">${prog}</div></div>
  <div class="sh-body">${body}</div>
  <div class="sh-bot"><button class="side" data-say="0" aria-label="聽示範">${IC.spk}</button>
    <div><button class="mic ${micCls}" id="rec" aria-label="${st === "listening" ? "停止" : "錄音"}">${IC.mic}</button><div class="status">${status || (st === "result" ? "再錄一次" : "")}</div></div>
    <button class="side" id="nextq" aria-label="下一題">${IC.next}</button></div>`;
}
function resultView(r, it) {
  const s = r.scores, R = 42, L = 2 * Math.PI * R;
  const ring = `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="50" cy="50" r="${R}" fill="none" stroke="${col(s.pron)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${L * s.pron / 100} ${L}"/></svg><b style="color:${col(s.pron)}">${s.pron}</b></div>`;
  const subs = [["準確", s.acc], ["流暢", s.flu], ["完整", s.comp], ["語調", s.pros]].filter(x => x[1] != null).map(([n, v]) => `<div><span>${n}</span><b style="color:${col(v)}">${v}</b></div>`).join("");
  const sel = ses.sel ?? r.words.reduce((m, w, k) => (w.score < r.words[m].score ? k : m), 0);
  const words = r.words.map((w, k) => `<button class="wd ${cls(w.err === "Omission" ? 0 : w.score)}${k === sel ? " sel" : ""}" data-w="${k}">${esc(w.w)}</button>`).join("");
  const w = r.words[sel];
  let detail = "";
  if (w) {
    const phs = w.phon.map(p => `<span class="ph ${cls(p.score)}">${esc(p.p)}<small>${p.score}</small></span>`).join("");
    const bad = w.phon.filter(p => p.score < 70).sort((a, b) => a.score - b.score).slice(0, 2);
    const fixes = bad.map(p => {
      const t = TIPS[p.p], like = p.nbest.find(n => n.p !== p.p && n.score > p.score);
      const cat = t && t.cat ? catOf(t.cat) : null, vq = cat && cat.videos[0];
      return `<div class="fix"><h4>/${esc(p.p)}/ ${esc(t ? t.n : "")} 只有 ${p.score} 分${like ? `，聽起來像 /${esc(like.p)}/${ZHUYIN[like.p] ? "（" + esc(ZHUYIN[like.p]) + "）" : ""}` : ""}</h4><p>${esc(t ? t.how : "放慢速度，跟著示範把這個音單獨唸三次，再放回單字裡。")}</p>
      <div class="row"><button class="pill" data-sayw="${esc(w.w)}">${IC.spk}聽「${esc(w.w)}」</button>${vq ? `<a class="pill" style="text-decoration:none;color:inherit" href="${ytSearch(vq[1])}" target="_blank" rel="noopener">看教學影片 ›</a>` : ""}</div></div>`;
    }).join("");
    const errNote = w.err === "Omission" ? "這個字沒有被唸出來（漏掉了）。" : w.err === "Insertion" ? "多唸了這個字。" : w.prosody && w.prosody.Break && w.prosody.Break.ErrorTypes && w.prosody.Break.ErrorTypes.includes("UnexpectedBreak") ? "這個字前面停頓太久。" : "";
    detail = `<h2 style="margin-top:14px">${esc(w.w)} <span class="badge ${cls(w.score)}">${w.score}</span></h2>${errNote ? `<p class="mute">${errNote}</p>` : ""}<div class="phrow">${phs}</div>${fixes || `<div class="fix good-box"><h4>這個字每個音都過關</h4><p>點其他紅色或黃色的字看細節。</p></div>`}`;
  }
  const prosNote = s.pros != null && s.pros < 70 ? `<div class="fix" style="border-left-color:var(--mid)"><h4>語調 ${s.pros} 分：太平了</h4><p>${esc(TIPS["ə"].how)} 重音節拉長、音高一點，其他音節輕輕帶過。</p></div>` : "";
  return `${r.demo ? `<span class="demo">示範結果，不是你的聲音</span>` : ""}<div class="res-top">${ring}<div class="subs">${subs}</div></div>
  <div class="words">${words}</div><p class="mute" style="margin:0">點任一個字看每個音的分數</p>${detail}${prosNote}
  ${r.heard && !r.demo ? `<p class="heard">Azure 聽到：${esc(r.heard)}</p>` : ""}`;
}
function record(r) {
  const day = new Date().toISOString().slice(0, 10);
  stats.days[day] = (stats.days[day] || 0) + 1;
  stats.items[r.reference] = r.scores.pron;
  r.words.forEach(w => w.phon.forEach(p => { const o = stats.ph[p.p] || (stats.ph[p.p] = { s: 0, n: 0 }); o.s += p.score; o.n++; }));
  store("stats", stats);
}
function doRecord() {
  if (ses.state === "listening") { Azure.cancel(); ses.state = "idle"; return drawSheet(); }
  if (ses.state === "processing") return;
  try { speechSynthesis.cancel(); } catch (e) {}
  const ref = ses.items[ses.i].t;
  ses.sel = null;
  if (prefs.demo && !(Azure.getCreds() || {}).key) {
    ses.state = "processing"; drawSheet();
    return setTimeout(() => Azure.mock(ref).then(r => { ses.result = r; ses.state = "result"; drawSheet(); }), 700);
  }
  ses.state = "listening"; drawSheet();
  Azure.assess(ref, st => { if (ses) { ses.state = st; drawSheet(); } })
    .then(r => { if (!ses) return; record(r); ses.result = r; ses.state = "result"; drawSheet(); })
    .catch(e => { if (!ses) return; ses.err = e; ses.state = "error"; drawSheet(); });
}

/* ---------- 事件 ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button,[data-play]"); if (!t) return;
  const d = t.dataset;
  if (d.tab) { S.tab = d.tab; render(); scrollTo(0, 0); return; }
  if (d.cat) { S.cat = d.cat; render(); return; }
  if (d.kind) { S.kind = d.kind; render(); return; }
  if (d.start != null) return start(+d.start);
  if (d.vcat) { S.vcat = d.vcat; render(); return; }
  if (d.gocat) { S.tab = "practice"; S.cat = d.gocat; S.kind = "sent"; render(); return; }
  if (d.weak != null) { if (d.weak) { S.tab = "practice"; S.cat = d.weak; render(); } return; }
  if (d.play != null) { myVids.forEach((v, i) => v.playing = i === +d.play); render(); return; }
  if (d.del != null) { myVids.splice(+d.del, 1); store("my-videos", myVids.map(({ playing, ...v }) => v)); render(); return; }
  if (t.id === "vadd") {
    const u = $("#vurl").value.trim(), m = u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
    if (!m) return toast("看不懂這個連結，請貼 YouTube 影片網址");
    myVids.unshift({ id: m[1], note: "加入於 " + new Date().toLocaleDateString("zh-TW") }); store("my-videos", myVids.map(({ playing, ...v }) => v)); render(); return;
  }
  if (t.id === "savekey") {
    const key = $("#key").value.trim(), region = $("#region").value, msg = $("#keymsg");
    if (!key) { Azure.setCreds(null); msg.textContent = "已清除金鑰"; msg.className = ""; return; }
    Azure.setCreds({ key, region }); msg.textContent = "測試中…"; msg.className = "mute";
    fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key } })
      .then(r => { if (r.ok) { msg.textContent = "可以用了！回到「練習」開始吧。"; msg.className = "ok"; } else { msg.textContent = "金鑰或區域不對（" + r.status + "）"; msg.className = "err"; } })
      .catch(() => { msg.textContent = "已儲存。無法在這裡測試，直接去練習試試看。"; msg.className = "mute"; });
    return;
  }
  if (t.id === "reset") { if (t.dataset.sure) { stats = { ph: {}, items: {}, days: {} }; store("stats", stats); toast("已清除"); render(); } else { t.dataset.sure = 1; t.textContent = "再按一次確認清除"; } return; }
  if (!ses) return;
  if ("close" in d) return close();
  if (d.say != null) return say(ses.items[ses.i].t, d.say === "1");
  if (d.sayw) return say(d.sayw, true);
  if (d.w != null) { ses.sel = +d.w; drawSheet(); return; }
  if (d.gotab) { close(); S.tab = d.gotab; render(); return; }
  if (d.demo) { prefs.demo = true; store("prefs", prefs); ses.state = "idle"; doRecord(); return; }
  if (t.id === "rec") return doRecord();
  if (t.id === "nextq") { Azure.cancel(); if (ses.i + 1 >= ses.items.length) { toast("這組練完了"); return close(); } ses.i++; ses.state = "idle"; ses.result = null; drawSheet(); return; }
});
document.addEventListener("change", e => {
  if (e.target.id === "rate") { prefs.rate = +e.target.value; store("prefs", prefs); }
  if (e.target.id === "demo") { prefs.demo = e.target.checked; store("prefs", prefs); }
});
document.addEventListener("keydown", e => { if (e.target.id === "vurl" && e.key === "Enter") $("#vadd").click(); });

if (!(Azure.getCreds() || {}).key && !prefs.demo) S.tab = "settings";
render();
})();
