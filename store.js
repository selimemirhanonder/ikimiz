// Veri katmanı. İki uygulama aynı arayüzü sunar:
//   createRoom(code, name) · joinRoom(code, name) · watchRoom(code, cb)
//   saveAnswers(code, data) · watchAnswers(code, cb) · saveResult(code, score) · getStats()
// Firebase ayarı varsa gerçek zamanlı Firestore, yoksa aynı tarayıcıdaki sekmeler arası deneme modu.

import { firebaseConfig } from "./firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2";

export async function createStore() {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) return firebaseStore();
  return localStore();
}

/* ------------------------------------------------------------------ */
/* Firebase                                                           */
/* ------------------------------------------------------------------ */
async function firebaseStore() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const cred = a.currentUser ? { user: a.currentUser } : await auth.signInAnonymously(a);
  const uid = cred.user.uid;
  const db = fs.getFirestore(app);
  const roomRef = (code) => fs.doc(db, "rooms", code);

  return {
    mode: "firebase",
    uid,
    async createRoom(code, name) {
      const ref = roomRef(code);
      const snap = await fs.getDoc(ref);
      if (snap.exists()) throw new Error("taken");
      await fs.setDoc(ref, {
        createdAt: fs.serverTimestamp(),
        players: { [uid]: { name, joinedAt: Date.now() } },
      });
    },
    async joinRoom(code, name) {
      const ref = roomRef(code);
      await fs.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("notfound");
        const players = snap.data().players || {};
        if (!players[uid] && Object.keys(players).length >= 2) throw new Error("full");
        if (!players[uid]) tx.update(ref, { [`players.${uid}`]: { name, joinedAt: Date.now() } });
      });
    },
    watchRoom(code, cb) {
      return fs.onSnapshot(roomRef(code), (s) => cb(s.exists() ? s.data() : null), () => cb(null));
    },
    async saveAnswers(code, data) {
      await fs.setDoc(fs.doc(db, "rooms", code, "answers", uid), data, { merge: true });
    },
    watchAnswers(code, cb) {
      return fs.onSnapshot(fs.collection(db, "rooms", code, "answers"), (qs) => {
        const out = {};
        qs.forEach((d) => (out[d.id] = d.data()));
        cb(out);
      });
    },
    async saveResult(code, score) {
      const ref = fs.doc(db, "results", code);
      try {
        const snap = await fs.getDoc(ref);
        if (!snap.exists()) await fs.setDoc(ref, { score, createdAt: fs.serverTimestamp() });
      } catch (_) {
        /* partner aynı anda yazdıysa sorun değil, puan zaten aynı */
      }
    },
    async getStats() {
      const agg = await fs.getAggregateFromServer(fs.collection(db, "results"), {
        avg: fs.average("score"),
        n: fs.count(),
      });
      const d = agg.data();
      return { avg: d.avg ?? 0, n: d.n ?? 0 };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Deneme modu: localStorage + sekmeler arası bildirim                 */
/* ------------------------------------------------------------------ */
function localStore() {
  const KEY = "ikimiz-demo-db";
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { rooms: {}, answers: {}, results: {} }; }
    catch (_) { return { rooms: {}, answers: {}, results: {} }; }
  };
  const listeners = new Set();
  const write = (db) => {
    localStorage.setItem(KEY, JSON.stringify(db));
    listeners.forEach((fn) => fn());
  };
  window.addEventListener("storage", (e) => e.key === KEY && listeners.forEach((fn) => fn()));
  const listen = (fn) => { listeners.add(fn); fn(); return () => listeners.delete(fn); };

  // Her sekme ayrı bir oyuncu
  let uid = sessionStorage.getItem("ikimiz-demo-uid");
  if (!uid) { uid = "u" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("ikimiz-demo-uid", uid); }

  return {
    mode: "demo",
    uid,
    async createRoom(code, name) {
      const db = read();
      if (db.rooms[code]) throw new Error("taken");
      db.rooms[code] = { createdAt: Date.now(), players: { [uid]: { name, joinedAt: Date.now() } } };
      write(db);
    },
    async joinRoom(code, name) {
      const db = read();
      const room = db.rooms[code];
      if (!room) throw new Error("notfound");
      if (!room.players[uid] && Object.keys(room.players).length >= 2) throw new Error("full");
      room.players[uid] = room.players[uid] || { name, joinedAt: Date.now() };
      write(db);
    },
    watchRoom(code, cb) {
      let last = "";
      return listen(() => {
        const v = read().rooms[code] || null;
        const s = JSON.stringify(v);
        if (s !== last) { last = s; cb(v); }
      });
    },
    async saveAnswers(code, data) {
      const db = read();
      db.answers[code] = db.answers[code] || {};
      db.answers[code][uid] = { ...(db.answers[code][uid] || {}), ...data };
      write(db);
    },
    watchAnswers(code, cb) {
      let last = "";
      return listen(() => {
        const v = read().answers[code] || {};
        const s = JSON.stringify(v);
        if (s !== last) { last = s; cb(v); }
      });
    },
    async saveResult(code, score) {
      const db = read();
      if (!db.results[code]) { db.results[code] = { score, createdAt: Date.now() }; write(db); }
    },
    async getStats() {
      const scores = Object.values(read().results).map((r) => r.score);
      return { n: scores.length, avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
    },
  };
}
