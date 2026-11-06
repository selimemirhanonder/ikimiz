// Sorular: "self" kişinin kendisi için, "other" partneri hakkında tahmin ederken gösterilir.
// level: 1 = Isınma, 2 = Orta, 3 = Derin

export const LEVELS = {
  1: "Isınma",
  2: "Orta",
  3: "Derin",
};

export const QUESTIONS = [
  // ---- Isınma ----
  {
    level: 1,
    self: "En sevdiğin renk hangisi?",
    other: "En sevdiği renk hangisi?",
    options: ["Kırmızı", "Mavi", "Yeşil", "Mor", "Siyah", "Beyaz"],
  },
  {
    level: 1,
    self: "Sabah uyanınca ilk ne içersin?",
    other: "Sabah uyanınca ilk ne içer?",
    options: ["Çay", "Kahve", "Su", "Hiçbir şey, direkt güne başlarım"],
  },
  {
    level: 1,
    self: "Hayalindeki tatil hangisi?",
    other: "Hayalindeki tatil hangisi?",
    options: ["Deniz, kum, güneş", "Dağ ve doğa", "Yeni bir şehri gezmek", "Evde dinlenmek"],
  },
  {
    level: 1,
    self: "En çok hangi mutfağı seversin?",
    other: "En çok hangi mutfağı sever?",
    options: ["Türk mutfağı", "İtalyan", "Uzak Doğu", "Burger ve fast food"],
  },
  {
    level: 1,
    self: "Boş bir akşamın olsa ne yaparsın?",
    other: "Boş bir akşamı olsa ne yapar?",
    options: ["Dizi ya da film", "Arkadaşlarla dışarı çıkmak", "Kitap ya da bir hobi", "Spor"],
  },
  // ---- Orta ----
  {
    level: 2,
    self: "Stresli olduğunda en çok neye ihtiyaç duyarsın?",
    other: "Stresli olduğunda en çok neye ihtiyaç duyar?",
    options: ["Konuşmaya, dinlenmeye", "Yalnız kalmaya", "Uyumaya ya da bir şeyler yemeye", "Kendini işe veya spora vermeye"],
  },
  {
    level: 2,
    self: "Sevildiğini en çok ne hissettirir?",
    other: "Sevildiğini en çok ne hissettirir?",
    options: ["Güzel sözler", "Küçük hediyeler", "Birlikte geçirilen zaman", "Sarılmak, dokunmak", "Yükünü hafifletmek"],
  },
  {
    level: 2,
    self: "En büyük korkun hangisine daha yakın?",
    other: "En büyük korkusu hangisine daha yakın?",
    options: ["Yalnız kalmak", "Başarısız olmak", "Sağlığını kaybetmek", "Kontrolü kaybetmek"],
  },
  {
    level: 2,
    self: "Bir tartışmadan sonra genelde ne yaparsın?",
    other: "Bir tartışmadan sonra genelde ne yapar?",
    options: ["Hemen konuşup çözmek ister", "Önce biraz sakinleşmesi gerekir", "Karşı taraftan ilk adımı bekler", "Hiçbir şey olmamış gibi devam eder"],
  },
  {
    level: 2,
    self: "Büyük bir para kazansan ilk ne yaparsın?",
    other: "Büyük bir para kazansa ilk ne yapar?",
    options: ["Ev alır", "Dünyayı gezer", "Yatırım yapar", "Ailesine ve sevdiklerine harcar"],
  },
  // ---- Derin ----
  {
    level: 3,
    self: "Hayatta en çok neye önem veriyorsun?",
    other: "Hayatta en çok neye önem veriyor?",
    options: ["Aile", "Özgürlük", "Başarı", "Huzur"],
  },
  {
    level: 3,
    self: "En çok hangi yönünün fark edilmesini istersin?",
    other: "En çok hangi yönünün fark edilmesini ister?",
    options: ["Zekâsının", "Emeğinin", "Görünüşünün", "İyi kalpliliğinin"],
  },
  {
    level: 3,
    self: "İçinde taşıdığın pişmanlık en çok hangisine benziyor?",
    other: "İçinde taşıdığı pişmanlık en çok hangisine benziyor?",
    options: ["Söyleyemediği sözler", "Kaçırdığı fırsatlar", "Kırdığı insanlar", "Pek pişmanlığı yok"],
  },
  {
    level: 3,
    self: "Kendini en çok ne zaman değerli hissedersin?",
    other: "Kendini en çok ne zaman değerli hisseder?",
    options: ["Gerçekten dinlendiğinde", "Ona sürpriz yapıldığında", "Zor anında biri yanında olduğunda", "Beklemediği bir iltifat aldığında"],
  },
  {
    level: 3,
    self: "10 yıl sonra kendini en çok nerede görmek istersin?",
    other: "10 yıl sonra kendini en çok nerede görmek ister?",
    options: ["Kariyerinin zirvesinde", "Kalabalık, sıcak bir ailenin içinde", "Sakin bir kasabada", "Dünyayı dolaşırken"],
  },
];

/**
 * Puanlama: A'nın tahminleri B'nin kendi cevaplarıyla, B'nin tahminleri A'nın kendi cevaplarıyla karşılaştırılır.
 * Çiftin puanı = toplam doğru / toplam soru (iki taraf) × 100.
 */
export function scoreCouple(a, b) {
  const n = QUESTIONS.length;
  const per = QUESTIONS.map((q, i) => ({
    aKnowsB: a.guess[i] === b.self[i],
    bKnowsA: b.guess[i] === a.self[i],
  }));
  const aHits = per.filter((p) => p.aKnowsB).length;
  const bHits = per.filter((p) => p.bKnowsA).length;
  const byLevel = {};
  for (const lv of Object.keys(LEVELS)) {
    const idx = QUESTIONS.map((q, i) => (q.level === Number(lv) ? i : -1)).filter((i) => i >= 0);
    const hits = idx.reduce((s, i) => s + per[i].aKnowsB + per[i].bKnowsA, 0);
    byLevel[lv] = Math.round((hits / (idx.length * 2)) * 100);
  }
  return {
    score: Math.round(((aHits + bHits) / (n * 2)) * 100),
    aScore: Math.round((aHits / n) * 100),
    bScore: Math.round((bHits / n) * 100),
    per,
    byLevel,
  };
}
