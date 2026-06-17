# 2GIS Variant B: Autentifikatsiya Sessiyasi Bilan Sharhlarni Yig'ish

**Yaratildi:** 17-Jun 2026  
**Versiya:** Variant B (Authenticated Session)  
**Status:** 🟢 Faol - `storage/2gis.json` mavjud

---

## 📋 Asosiy Tushuncha

Bu variant 2GIS shaxsiy kabinetidan orqali haqiqiy sharhlarni yig'adi:
- URL: `https://account.2gis.ru/firms/{firmId}/feedbacks`
- **Sessiya faylidan**: `storage/2gis.json` (Playwright's `storageState`)
- **Ne kerak**: API key yoki public scraping
- **Qiymati**: Ko'proq ma'lumot, tezroq yuklanish, cheklash yo'q

---

## 🔑 Sessiya Fayli

### Fayl Joylashuvi
```
robot-otziv/storage/2gis.json
```

### Faylning Tuzilishi
```json
{
  "cookies": [...],
  "localStorage": [...],
  "sessionStorage": [...]
}
```

### Fayl Bor-Yo'qligini Tekshirish
```bash
ls -lah storage/2gis.json
```

**✅ Mavjud bo'lsa**: "Variant B ready to go!" degani  
**❌ Yo'q bo'lsa**: Quyidagi "Authentifikatsiyani Yangilash" bo'limiga o'ting

---

## 🔄 Authentifikatsiyani Yangilash / Sessiya Saqlash

### Agar Sessiya Expire Bo'lsa

```bash
# 1. Browser bilan 2GIS accountga kiring
#    https://account.2gis.ru
#    Login qilib, "Firms" bo'limiga o'ting

# 2. DevTools DevTools orqali storage export qiling
#    (Chrome/Firefox: F12 → Application → Cookies & LocalStorage)

# 3. Playwright bilan sessiya saqlash skriptini ishga tushiring
node scripts/save-2gis-session.js

# Yoki qo'lda: storage/2gis.json faylini qayta ishlang
```

### Sessiya Qachon Expire Bo'ladi?

- **Standart**: 90 kun
- **Ishlatmasa**: 7 kun o'zgarishsiz
- **Sign out bo'lsa**: Darhol invalid

---

## ⚙️ Konfiguratsiya

### .env (Opsional)

```env
# Agar SETUP-2GIS-VARIANT-B.md dagi default path o'zgarmoqchi bo'lsangiz:
DGIS_SESSION_FILE=./storage/2gis.json

# Variant B faqat: sessiyadan foydalanish (har doim true)
DGIS_USE_SESSION=true
```

**Muhim**: `.env` da shu qiymatlarni o'zgartirishning zarurati yo'q. Default path ishlaydi.

---

## 🚀 Sync Jarayoni

### Asosiy Buyruq

```bash
node sync-dgis.js
```

### Qanday Ishlaydi?

1. **Sessiya Tekshirish**
   - `storage/2gis.json` faylini o'qiydi
   - Agar topilmasa: ❌ Error va exit

2. **Har Bir Filial Uchun**
   - `https://account.2gis.ru/firms/{firmId}/feedbacks` ga o'tadi
   - Sessiya cookies bilan autentifikatsiya
   - Sahifani scroll qilib, sharhlarni yig'adi

3. **Sharhlarni Parse Qilish**
   - Author ismi
   - Yulduzchalar (rating)
   - Sharh matni
   - Sana (Ruscha format)

4. **Duplikat Tekshirish**
   - Bazada bor-yo'qligini tekshiradi
   - Faqat yangi sharhlar saqlanadi

5. **Telegramga Alert**
   - Agar sharh 1-2 yulduzchali bo'lsa, ogohlantirish yuboradi

### Output Misol

```
==================================================
🚀 2GIS AUTHENTICATED SESSION SYNC (Variant B)
==================================================
Loaded 5 active branches.

--------------------------------------------------
Processing Branch: "Mazzali Tashkent"
  -> 2GIS Firm ID: 70000001234567
  -> Opening authenticated account: https://account.2gis.ru/firms/70000001234567/feedbacks
  -> ✅ Successfully extracted 23 reviews from account
  -> Results: 5 new, 18 duplicates
  -> Updated sync log

--------------------------------------------------
Processing Branch: "Mazzali Samarkand"
  ...

==================================================
✅ 2GIS Sync Complete!
==================================================
```

---

## ⚠️ Xatolar Va Yechimlar

### ❌ Error: "Session file not found at storage/2gis.json"

**Sabab**: Sessiya faylining yo'qligi  
**Yechim**:
```bash
# 1. storage folder bor-yo'qligini tekshir
ls storage/

# 2. 2GIS accountga yangi sessiya bilan login qil
# 3. Sessiya fayl excel qil
```

### ❌ Error: "Session expired or invalid"

**Sabab**: Cookie yoki session token expire bo'lgan  
**Yechim**:
```bash
# 1. https://account.2gis.ru ga kir
# 2. storage/2gis.json fayl yangilangan bo'ldi
# 3. sync-dgis.js qayta ishga tushir
```

### ❌ Error: "Status 401"

**Sabab**: Authentifikatsiya failed  
**Yechim**:
```bash
# 1. Browser console qil
# 2. Storage tab-dan cookies'ni copy qil
# 3. storage/2gis.json ga paste qil
# 4. Qayta sync
```

### ⚠️ Warning: "selector not found"

**Sabab**: 2GIS HTML struktura o'zgardi  
**Yechim**:
- DevTools bilan page inspect qil
- New selector topib `scrapeDgisReviewsWithSession` da o'zgart

---

## 📊 Sharhlarni Tekshirish

### Bazadan to'g'ri saved bo'lganligini tekshir

```sql
SELECT * FROM "Review" 
WHERE source = 'DGIS' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

### Sync Log Ko'rish

```sql
SELECT * FROM "ReviewSyncLog" 
WHERE source = 'DGIS' 
ORDER BY "startedAt" DESC 
LIMIT 5;
```

---

## 📝 Do's & Don'ts

### ✅ QI'L

- ✅ **Har 7 kunga sessiya yangilasyon**  
  → Token'lar expire bo'ladi
  
- ✅ **Sync logs ko'rish**  
  → Qancha sharh yangi/duplicate bo'lganligini bilish

- ✅ **Error messages o'qish**  
  → "Session expired" bo'lsa yangi session saqlang

- ✅ **Telegram alerts tekshirish**  
  → Negativ sharhlar o'z vaqtida keladi

### ❌ QI'LMANG

- ❌ **storage/2gis.json ni o'chirlang**  
  → Sync ishlamay qoladi. Yana login qilishga tushadi.

- ❌ **storage/2gis.json ni GitHub-ga push qilmang**  
  → Security risk! `.gitignore` ga qo'shing:
  ```
  storage/2gis.json
  ```

- ❌ **Session file-ni har safar o'zgartirlang**  
  → Faqat expire bo'lsa yangilang

- ❌ **sync-dgis.js ni modify qilmang**  
  → Selector'lar o'zgarsa, DevTools bilan inspect qilip yangilang

- ❌ **`externalReviewId` ni copy-paste qilmang**  
  → Database unique constraint bo'ladi

- ❌ **Telegram token'ni logs-ga yozrmang**  
  → Dezavantaj xavf!

---

## 🔧 Selector'lar (Agar O'zgarsa)

Agar 2GIS HTML structure o'zgarga, quyidagi selector'larni yangilang:

```javascript
// scrapeDgisReviewsWithSession() funksiyada:

// Author selector
const authorEl = item.querySelector('[data-author-name], .author-name, [class*="author"]');

// Rating selector
const ratingEl = item.querySelector('[data-rating], [class*="rating"]');

// Text selector
const textEl = item.querySelector('[data-text], .feedback-text, [class*="text"]');

// Date selector
const dateEl = item.querySelector('[data-date], time, [class*="date"]');
```

**DevTools bilan topish**:
1. `F12` qil (DevTools)
2. Bitta sharh-ni inspect qil
3. HTML source-da selector topib, sync-dgis.js da o'zgart

---

## 📅 Maintenance Schedule

| Har | Qismi |
|-----|-------|
| **Har kun** | `node sync-dgis.js` → yeni sharhlarni yig' |
| **Har hafta** | Sync logs ko'r, error ko'r |
| **Har oy** | Telegram alerts soni ko'r, reyting trend |
| **Har 6 oy** | Session yangilash (safety) |
| **Agar sessiya expire** | Browser-dan login qil, storage/2gis.json yangilang |

---

## 📞 Support

Agar muammo bo'lsa:

1. **Console output o'qiy** → Error message aniq?
2. **DevTools inspect qil** → Selector to'g'rimi?
3. **Session updated qil** → Cookie expired?
4. **Database check qil** → Review saved bo'ldimi?

---

**Last Updated**: 2026-06-17  
**Variant**: B (Authenticated Session)  
**Status**: ✅ Production Ready
