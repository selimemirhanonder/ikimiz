import { QUESTIONS, LEVELS, scoreCouple } from "./questions.js";
import { createStore } from "./store.js";

const N = QUESTIONS.length;
const $app = document.getElementById("app");
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SESSION_KEY = "ikimiz-session";

let store;
let unsubRoom = null;
let unsubAns = null;

const S = {
  code: null,
  room: null,
  answers: {},
  loadedMine: false,
  self: [],
  guess: [],
  introSeen: false,
  error: "",
  busy: false,
  stats: null,
  statsFor: null,
  lastKey: "",
};

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const roomLink = (code) => `${location.origin}${location.pathname}?oda=${code}`;

function venn(score = 50, w = 150, h = 96) {
  // Kesişim puana göre büyür: 0 → çemberler sadece değiyor, 100 → tamamen üst üste
  const r = h / 2 - 4;
  const d = 2 * r * (1 - Math.max(0, Math.min(100, score)) / 100) * 0.92 + 2 * r * 0.08;
  const cx = w / 2;
  return `<svg class="venn" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <circle cx="${cx - d / 2}" cy="${h / 2}" r="${r}" fill="var(--a)" fill-opacity=".82"/>
    <circle cx="${cx + d / 2}" cy="${h / 2}" r="${r}" fill="var(--b)" fill-opacity=".82" style="mix-blend-mode:multiply"/>
  </svg>`;
}

const brand = () => `<div class="brand">${venn(55, 34, 22)}<span>İkimiz</span></div>`;

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

function saveSession() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: S.code, introSeen: S.introSeen })); } catch (_) {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* Oyuncu durumu                                                       */
/* ------------------------------------------------------------------ */
function players() {
  const p = S.room?.players || {};
  const me = p[store.uid] ? { uid: store.uid, ...p[store.uid] } : null;
  const otherId = Object.keys(p).find((k) => k !== store.uid);
  const other = otherId ? { uid: otherId, ...p[otherId] } : null;
  return { me, other };
}

function progressOf(ans) {
  if (!ans) return 0;
  return (ans.self?.filter((x) => x != null).length || 0) + (ans.guess?.filter((x) => x != null).length || 0);
}

function currentScreen() {
  if (!S.code) return "home";
  if (!S.room) return "loading";
  const { me, other } = players();
  if (!me) return "home";
  if (!other) return "lobby";
  if (!S.loadedMine) return "loading";
  const selfDone = S.self.length === N && S.self.every((x) => x != null);
  const guessDone = S.guess.length === N && S.guess.every((x) => x != null);
  if (!selfDone) return "self";
  if (!guessDone) return S.introSeen ? "guess" : "intro";
  const theirs = S.answers[other.uid];
  if (!theirs?.selfDone || !theirs?.guessDone) return "waiting";
  return "result";
}

/* ------------------------------------------------------------------ */
/* Oda bağlantısı                                                      */
/* ------------------------------------------------------------------ */
function attach(code) {
  detach();
  S.code = code;
  S.loadedMine = false;
  S.self = [];
  S.guess = [];
  saveSession();
  unsubRoom = store.watchRoom(code, (room) => {
    S.room = room;
    if (!room) { S.error = "Bu oda bulunamadı."; leave(false); return; }
    render();
  });
  unsubAns = store.watchAnswers(code, (answers) => {
    S.answers = answers || {};
    if (!S.loadedMine) {
      const mine = S.answers[store.uid];
      S.self = mine?.self ? [...mine.self] : [];
      S.guess = mine?.guess ? [...mine.guess] : [];
      S.loadedMine = true;
    }
    render();
  });
}

function detach() {
  unsubRoom?.(); unsubAns?.();
  unsubRoom = unsubAns = null;
}

function leave(clearError = true) {
  detach();
  Object.assign(S, { code: null, room: null, answers: {}, loadedMine: false, self: [], guess: [], introSeen: false, stats: null, statsFor: null });
  if (clearError) S.error = "";
  clearSession();
  history.replaceState(null, "", location.pathname);
  render();
}

async function onCreate(name) {
  S.busy = true; S.error = ""; render();
  try {
    let code;
    for (let i = 0; i < 6; i++) {
      code = newCode();
      try { await store.createRoom(code, name); break; }
      catch (e) { if (e.message !== "taken" || i === 5) throw e; }
    }
    rememberName(name);
    attach(code);
  } catch (e) {
    console.error(e);
    S.error = "Oda kurulamadı. İnternet bağlantını kontrol edip tekrar dene.";
  } finally { S.busy = false; render(); }
}

async function onJoin(name, code) {
  S.busy = true; S.error = ""; render();
  try {
    await store.joinRoom(code, name);
    rememberName(name);
    attach(code);
  } catch (e) {
    console.error(e);
    S.error = e.message === "notfound" ? `“${code}” kodlu bir oda yok. Kodu partnerinden tekrar iste.`
      : e.message === "full" ? "Bu odada zaten iki kişi var."
      : "Odaya girilemedi. İnternet bağlantını kontrol edip tekrar dene.";
  } finally { S.busy = false; render(); }
}

function rememberName(n) { try { localStorage.setItem("ikimiz-name", n); } catch (_) {} }
function savedName() { try { return localStorage.getItem("ikimiz-name") || ""; } catch (_) { return ""; } }

async function answer(phase, idx, value) {
  const arr = phase === "self" ? S.self : S.guess;
  arr[idx] = value;
  const done = arr.length === N && arr.every((x) => x != null);
  const payload = phase === "self" ? { self: S.self, selfDone: done } : { guess: S.guess, guessDone: done };
  render();
  try { await store.saveAnswers(S.code, payload); }
  catch (e) { console.error(e); toast("Cevap kaydedilemedi, bağlantını kontrol et."); }
}

function goBack(phase) {
  const arr = phase === "self" ? S.self : S.guess;
  const idx = arr.findIndex((x) => x == null);
  const cur = idx === -1 ? arr.length : idx;
  if (cur > 0) { arr.length = cur - 1; render(); }
  else if (phase === "guess") { S.introSeen = false; saveSession(); render(); }
}

/* ------------------------------------------------------------------ */
/* Ekranlar                                                            */
/* ------------------------------------------------------------------ */
function viewHome() {
  const params = new URLSearchParams(location.search);
  const preCode = (params.get("oda") || "").toUpperCase().slice(0, 5);
  const demo = store.mode === "demo"
    ? `<p class="note"><b>Deneme modu.</b> Firebase ayarı yapılmadı. Aynı tarayıcıda ikinci bir sekme açıp kendinle oynayarak deneyebilirsin.</p>` : "";
  return `
    ${brand()}
    <div class="hero">
      ${venn(48, 140, 90)}
      <h1>Birbirinizi ne kadar tanıyorsunuz?</h1>
      <p class="muted">Partnerinle aynı anda gir. Önce kendin için, sonra onun için cevapla. Sonunda 100 üzerinden puanınızı ve diğer çiftlerle farkınızı gör.</p>
    </div>
    ${demo}
    <form class="stack" id="f">
      <label class="field">Adın
        <input type="text" id="name" maxlength="20" autocomplete="given-name" placeholder="Örn. Elif" value="${esc(savedName())}" required>
      </label>
      ${preCode ? `
        <input type="hidden" id="code" value="${esc(preCode)}">
        <button class="btn" type="submit" data-act="join" ${S.busy ? "disabled" : ""}>${esc(preCode)} odasına katıl</button>
        <button class="btn link" type="button" id="clearcode">Yeni oda kur</button>
      ` : `
        <button class="btn" type="submit" data-act="create" ${S.busy ? "disabled" : ""}>Oda kur</button>
        <div class="divider">ya da partnerinin kodu ile</div>
        <div class="row">
          <input type="text" class="code" id="code" maxlength="5" placeholder="KOD" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button class="btn ghost" type="submit" data-act="join" ${S.busy ? "disabled" : ""}>Katıl</button>
        </div>
      `}
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}
    </form>
    <ul class="how">
      <li><b>1</b><span>${N} soru, ısınmadan derine doğru.</span></li>
      <li><b>2</b><span>Önce kendin için cevaplarsın, sonra partnerin için tahmin edersin.</span></li>
      <li><b>3</b><span>Tahminlerin, onun kendi cevaplarıyla karşılaştırılır.</span></li>
    </ul>`;
}

function bindHome() {
  const f = document.getElementById("f");
  let act = "create";
  f.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", () => (act = b.dataset.act)));
  document.getElementById("clearcode")?.addEventListener("click", () => { history.replaceState(null, "", location.pathname); render(true); });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    const code = (document.getElementById("code")?.value || "").trim().toUpperCase();
    if (!name) { S.error = "Önce adını yaz."; render(true); return; }
    if (act === "join") {
      if (code.length !== 5) { S.error = "Oda kodu 5 karakter olmalı."; render(true); return; }
      onJoin(name, code);
    } else onCreate(name);
  });
}

function viewLobby() {
  const { me } = players();
  return `
    ${brand()}
    <div class="center">
      <div>
        <p class="eyebrow">Oda hazır</p>
        <h2>Partnerini bekliyoruz</h2>
      </div>
      <div class="codebox">
        <span class="muted">Bu kodu partnerine gönder</span>
        <span class="code-big">${esc(S.code)}</span>
        <div class="row">
          <button class="btn" id="share">Linki paylaş</button>
          <button class="btn ghost" id="copy">Kopyala</button>
        </div>
      </div>
      <div class="players">
        <div class="player pa"><span class="name">${esc(me.name)}</span><span class="status">Hazır</span></div>
        <div class="player pb"><span class="name">Partnerin</span><span class="status"><span class="pulse"></span>Bekleniyor</span></div>
      </div>
    </div>
    <button class="btn link" id="leave">Odadan çık</button>`;
}

function bindLobby() {
  const link = roomLink(S.code);
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (_) { toast(text); }
  };
  document.getElementById("copy").onclick = () => copy(S.code, "Kod kopyalandı");
  document.getElementById("share").onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "İkimiz", text: "Birbirimizi ne kadar tanıyoruz? Odaya gel:", url: link }); return; } catch (_) { return; }
    }
    copy(link, "Link kopyalandı");
  };
  document.getElementById("leave").onclick = () => leave();
}

function viewQuestion(phase) {
  const { other } = players();
  const arr = phase === "self" ? S.self : S.guess;
  let idx = arr.findIndex((x) => x == null);
  if (idx === -1) idx = arr.length;
  if (idx >= N) idx = N - 1;
  const q = QUESTIONS[idx];
  const step = (phase === "self" ? 0 : N) + idx + 1;
  const total = N * 2;
  const theirProgress = progressOf(S.answers[other.uid]);
  const picked = arr[idx];
  return `
    <div class="mode-${phase} qhead">
      <div class="qmeta">
        <span class="chip ${phase}">${phase === "self" ? "1. bölüm · Kendin için" : `2. bölüm · ${esc(other.name)} için`}</span>
        <span class="muted">${idx + 1} / ${N}</span>
      </div>
      <div class="bar"><i style="width:${(step / total) * 100}%;background:var(--accent)"></i></div>
      <div class="levels">${Object.entries(LEVELS).map(([lv, name]) => `<span class="${Number(lv) === q.level ? "on" : ""}">${name}</span>`).join("")}</div>
    </div>
    <div class="mode-${phase} question" data-key="${phase}-${idx}">
      ${phase === "guess" ? `<p class="about b">${esc(other.name)} hakkında</p>` : `<p class="about a">Senin hakkında</p>`}
      <h2>${esc(phase === "self" ? q.self : q.other)}</h2>
    </div>
    <div class="mode-${phase} options" data-key="${phase}-${idx}">
      ${q.options.map((o, i) => `<button class="opt ${picked === i ? "picked" : ""}" data-i="${i}"><span class="dot"></span><span>${esc(o)}</span></button>`).join("")}
    </div>
    <div class="qfoot">
      ${step > 1 ? `<button class="btn link" id="back">← Geri</button>` : "<span></span>"}
      <span>${esc(other.name)}: ${theirProgress} / ${total}</span>
    </div>`;
}

function bindQuestion(phase) {
  const arr = phase === "self" ? S.self : S.guess;
  let idx = arr.findIndex((x) => x == null);
  if (idx === -1) idx = arr.length;
  let locked = false;
  document.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    document.querySelectorAll(".opt").forEach((x) => x.classList.remove("picked"));
    b.classList.add("picked");
    setTimeout(() => answer(phase, idx, Number(b.dataset.i)), 220);
  }));
  document.getElementById("back")?.addEventListener("click", () => goBack(phase));
}

function viewIntro() {
  const { other } = players();
  return `
    ${brand()}
    <div class="center">
      ${venn(30)}
      <p class="eyebrow">1. bölüm bitti</p>
      <h2>Şimdi <span class="b">${esc(other.name)}</span> için cevapla</h2>
      <p class="muted">Aynı ${N} soru geliyor. Bu sefer ${esc(other.name)} kendisi için ne seçti, onu tahmin et. O da şu an seni tahmin ediyor.</p>
      <button class="btn" id="go">Başla</button>
      <button class="btn link" id="back">← Son cevabımı değiştir</button>
    </div>`;
}

function bindIntro() {
  document.getElementById("go").onclick = () => { S.introSeen = true; saveSession(); render(); };
  document.getElementById("back").onclick = () => { S.self.length = N - 1; render(); };
}

function viewWaiting() {
  const { other } = players();
  const p = progressOf(S.answers[other.uid]);
  return `
    ${brand()}
    <div class="center">
      ${venn(Math.min(95, (p / (N * 2)) * 100))}
      <p class="eyebrow">Sen bitirdin</p>
      <h2><span class="b">${esc(other.name)}</span> hâlâ cevaplıyor</h2>
      <div class="bar"><i style="width:${(p / (N * 2)) * 100}%;background:var(--b)"></i></div>
      <p class="muted"><span class="pulse"></span>${p} / ${N * 2} cevap. Sonuç ikiniz de bitirince açılacak.</p>
    </div>`;
}

function verdict(score) {
  if (score >= 85) return "Neredeyse birbirinizin aklını okuyorsunuz.";
  if (score >= 70) return "Birbirinizi gerçekten iyi tanıyorsunuz.";
  if (score >= 55) return "Sağlam bir temel var, keşfedilecek çok şey de.";
  if (score >= 40) return "Yarı yoldasınız. Daha çok soru sorma zamanı.";
  return "Birbirinizi tanımak için önünüzde uzun ve güzel bir yol var.";
}

function viewResult() {
  const { me, other } = players();
  const mine = { self: S.self, guess: S.guess };
  const theirs = S.answers[other.uid];
  const r = scoreCouple(mine, theirs);

  if (S.statsFor !== S.code) {
    S.statsFor = S.code;
    (async () => {
      try {
        await store.saveResult(S.code, r.score);
        S.stats = await store.getStats();
      } catch (e) { console.error(e); S.stats = { error: true }; }
      render();
    })();
  }

  let compare = `<p class="muted">Diğer çiftlerle karşılaştırılıyor…</p>`;
  if (S.stats?.error) compare = `<p class="muted">Karşılaştırma şu an yüklenemedi.</p>`;
  else if (S.stats) {
    const { n, avg } = S.stats;
    // Bu çiftin puanı ortalamaya dahil; onu çıkarıp diğerlerine bakıyoruz
    const others = n - 1;
    if (others < 1) {
      compare = `<strong>Henüz kıyaslanacak başka çift yok.</strong><span class="muted">İlk oynayan siz oldunuz. Puanınız gelecek çiftler için ölçü olacak.</span>`;
    } else {
      const othersAvg = (avg * n - r.score) / others;
      const diff = Math.round(r.score - othersAvg);
      const line = diff === 0 ? `Diğer çiftlerin ortalamasıyla aynı.`
        : `Diğer çiftlerin ortalamasına göre <span class="${diff > 0 ? "up" : "down"}">%${Math.abs(diff)} daha ${diff > 0 ? "fazla" : "az"}</span>.`;
      compare = `<strong>${line}</strong><span class="muted">${others} çiftin ortalaması %${Math.round(othersAvg)}.</span>`;
    }
  }

  const items = QUESTIONS.map((q, i) => {
    const p = r.per[i];
    return `<li>
      <span class="q">${esc(q.self)}</span>
      <div class="pair">
        <div class="line ${p.aKnowsB ? "hit" : "miss"}"><span class="mark">${p.aKnowsB ? "✓" : "✗"}</span>
          <span><span class="who a">Sen</span> → ${esc(other.name)}: “${esc(q.options[S.guess[i]])}”${p.aKnowsB ? "" : ` <span class="muted">(doğrusu: ${esc(q.options[theirs.self[i]])})</span>`}</span></div>
        <div class="line ${p.bKnowsA ? "hit" : "miss"}"><span class="mark">${p.bKnowsA ? "✓" : "✗"}</span>
          <span><span class="who b">${esc(other.name)}</span> → sen: “${esc(q.options[theirs.guess[i]])}”${p.bKnowsA ? "" : ` <span class="muted">(doğrusu: ${esc(q.options[S.self[i]])})</span>`}</span></div>
      </div>
    </li>`;
  }).join("");

  return `
    ${brand()}
    <div class="result-hero">
      ${venn(r.score, 300, 170)}
      <p class="eyebrow">${esc(me.name)} &amp; ${esc(other.name)}</p>
      <div class="score-num">%${r.score}</div>
      <p class="verdict">birbirinizi tanıyorsunuz</p>
      <p class="muted">${verdict(r.score)}</p>
    </div>
    <div class="compare">${compare}</div>
    <div class="split">
      <div style="background:var(--a-soft)"><span class="num a">%${r.aScore}</span><span class="lbl">Sen, ${esc(other.name)} hakkında</span></div>
      <div style="background:var(--b-soft)"><span class="num b">%${r.bScore}</span><span class="lbl">${esc(other.name)}, senin hakkında</span></div>
    </div>
    <section class="block">
      <h3>Seviyelere göre</h3>
      <div class="lvl-bars">
        ${Object.entries(LEVELS).map(([lv, name]) => `<div class="lv"><span>${name}</span><div class="bar"><i style="width:${r.byLevel[lv]}%"></i></div><span>%${r.byLevel[lv]}</span></div>`).join("")}
      </div>
    </section>
    <section class="block">
      <h3>Soru soru</h3>
      <ul class="qlist">${items}</ul>
    </section>
    <button class="btn" id="again">Yeni oyun</button>`;
}

function bindResult() {
  document.getElementById("again").onclick = () => leave();
}

/* ------------------------------------------------------------------ */
/* Çizim                                                               */
/* ------------------------------------------------------------------ */
function render(force = false) {
  const screen = currentScreen();
  let html = "";
  let key = screen;
  switch (screen) {
    case "home": html = viewHome(); break;
    case "lobby": html = viewLobby(); break;
    case "self":
    case "guess": {
      html = viewQuestion(screen);
      const arr = screen === "self" ? S.self : S.guess;
      const i = arr.findIndex((x) => x == null);
      key = `${screen}-${i === -1 ? arr.length : i}`;
      break;
    }
    case "intro": html = viewIntro(); break;
    case "waiting": html = viewWaiting(); break;
    case "result": html = viewResult(); break;
    default: html = `<p class="loading">Yükleniyor…</p>`;
  }

  // Ana sayfada yazılan adı/kodu kaybetme
  if (screen === "home" && !force && S.lastKey === "home") {
    const btns = $app.querySelectorAll("button[data-act]");
    btns.forEach((b) => (b.disabled = S.busy));
    const err = $app.querySelector(".error");
    if (S.error && !err) $app.querySelector("form").insertAdjacentHTML("beforeend", `<p class="error">${esc(S.error)}</p>`);
    else if (err) err.textContent = S.error;
    if (!S.error && err) err.remove();
    return;
  }

  const changed = key !== S.lastKey;
  S.lastKey = key;
  $app.innerHTML = html;
  if (changed) {
    $app.querySelectorAll(".question, .options, .center, .hero, .result-hero").forEach((el) => el.classList.add("enter"));
    window.scrollTo({ top: 0 });
  }

  if (screen === "home") bindHome();
  else if (screen === "lobby") bindLobby();
  else if (screen === "self" || screen === "guess") bindQuestion(screen);
  else if (screen === "intro") bindIntro();
  else if (screen === "result") bindResult();
}

/* ------------------------------------------------------------------ */
/* Başlat                                                              */
/* ------------------------------------------------------------------ */
(async function boot() {
  try {
    store = await createStore();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<p class="error">Sunucuya bağlanılamadı. Firebase ayarlarını ve internet bağlantını kontrol et.</p>`;
    return;
  }
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) {}
  if (session?.code) {
    S.introSeen = !!session.introSeen;
    attach(session.code);
  }
  render(true);
})();
