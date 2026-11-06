# İkimiz — Birbirinizi ne kadar tanıyorsunuz?

Çiftler için gerçek zamanlı tanışıklık oyunu. İki kişi ayrı telefonlardan aynı odaya girer, önce kendileri için 15 soruyu cevaplar, sonra partnerleri için tahmin eder. Tahminler partnerin kendi cevaplarıyla karşılaştırılır, 100 üzerinden puan çıkar ve diğer çiftlerin ortalamasıyla kıyaslanır.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Sayfa iskeleti |
| `style.css` | Tasarım (açık ve koyu tema) |
| `app.js` | Oyun akışı ve ekranlar |
| `questions.js` | 15 soru, şıklar ve puanlama. Soruları buradan değiştirebilirsin |
| `store.js` | Veri katmanı (Firebase ya da deneme modu) |
| `firebase-config.js` | Firebase bilgilerini yapıştıracağın yer |
| `firestore.rules` | Veritabanı güvenlik kuralları |

## Önce dene (kurulum gerekmez)

`firebase-config.js` boşken site **deneme modunda** çalışır. Bilgisayarda:

```bash
cd ikimiz
python3 -m http.server 8000
```

Tarayıcıda `http://localhost:8000` aç, oda kur, aynı tarayıcıda ikinci sekmede linki aç ve iki kişi gibi oyna. Deneme modunda veriler sadece o tarayıcıda durur.

## Herkese açmak için (yaklaşık 10 dakika, ücretsiz)

### 1. Firebase projesi
1. https://console.firebase.google.com adresinde **Proje ekle**.
2. **Build > Authentication > Sign-in method** bölümünde **Anonymous** (Anonim) girişi aç.
3. **Build > Firestore Database > Create database**. Production modunu seç, bölge olarak `eur3` veya `europe-west` uygun.
4. Firestore'da **Rules** sekmesine `firestore.rules` dosyasının içeriğini yapıştır, **Publish**.
5. **Proje ayarları (dişli) > Genel > Uygulamalarınız > Web (`</>`)** ile bir web uygulaması ekle. Çıkan `firebaseConfig` değerlerini `firebase-config.js` dosyasına yapıştır.

### 2. Yayınla
En kolayı **Netlify Drop**: https://app.netlify.com/drop adresine `ikimiz` klasörünü sürükle bırak. Birkaç saniyede bir link verir. (Vercel veya Firebase Hosting de olur.)

### 3. Alan adını Firebase'e tanıt
Firebase'de **Authentication > Settings > Authorized domains** listesine Netlify'ın verdiği alan adını ekle (ör. `ikimiz.netlify.app`). Yoksa anonim giriş çalışmaz.

## Nasıl çalışıyor

- **Oda:** 5 karakterli kod (`rooms/{kod}`), en fazla 2 kişi. Link `?oda=KOD` ile paylaşılır.
- **Cevaplar:** `rooms/{kod}/answers/{kullanıcı}` içinde `self` (kendi cevapları) ve `guess` (partner için tahminleri). Her cevap anında kaydedilir, partnerin ilerlemesi canlı görünür. Sayfa yenilenirse kalınan yerden devam eder.
- **Puan:** Sen → partnerin tahminlerin + partnerin → sen tahminleri. Toplam doğru / 30 × 100. Ayrıca her kişinin kendi isabeti ve seviye (Isınma, Orta, Derin) bazında yüzde gösterilir.
- **Kıyaslama:** Her bitmiş oyun `results/{kod}` olarak bir kez kaydedilir. Sonuç ekranı diğer tüm çiftlerin ortalamasını çekip farkı puan olarak gösterir: *"Diğer çiftlerin ortalamasına göre %15 daha az."*

## Bilmen gerekenler

- Puan tarayıcıda hesaplanıyor. Teknik bilgisi olan biri kendi sonucunu elle yazabilir; kurallar puanı 0–100 arası tam sayıyla ve oda başına bir kayıtla sınırlıyor. Rekabet ciddileşirse puanı bir Cloud Function'a taşımak gerekir.
- Partnerinin kendi cevapları tarayıcıya geliyor (karşılaştırma için gerekli). Geliştirici araçlarına bakan biri tahmin etmeden önce görebilir. Eğlence amaçlı bir oyunda kabul edilebilir.
- Soruları değiştirirsen eski sonuçlarla kıyaslama anlamını yitirir. Büyük değişiklikte `results` koleksiyonunu temizlemek mantıklı.
