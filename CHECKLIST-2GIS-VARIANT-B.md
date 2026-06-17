# ✅ 2GIS Variant B - IMPLEMENTATION CHECKLIST

**Data**: 2026-06-17  
**Status**: 🟢 COMPLETE  

---

## 📦 Ko'rilgan Fayllar

### ✅ ASOSIY SKRIPTLAR

| File | Status | Maqsad |
|------|--------|--------|
| `sync-dgis.js` | ✅ Qayta yozildi | Asosiy sync script (Variant B) |
| `storage/2gis.json` | ✅ Mavjud | Playwright session (cookies + tokens) |
| `scripts/save-2gis-session.js` | ✅ Yaratildi | Session saqlash uchun browser script |
| `scripts/check-2gis-session.js` | ✅ Yaratildi | Session tekshirish uchun CLI tool |

### ✅ DOKUMENTATSIYA

| File | Status | Ichida |
|------|--------|--------|
| `SETUP-2GIS-VARIANT-B.md` | ✅ Yaratildi | To'liq setup qo'llanma (Ruscha + Do's/Don'ts) |
| `QUICKSTART-2GIS.md` | ✅ Yaratildi | 3-step quick start |
| `.gitignore` | ✅ Yangilandi | `storage/2gis.json` qo'shildi (security) |
| `package.json` | ✅ Yangilandi | npm scripts qo'shildi |

---

## 🔧 ASOSIY XUSUSIYATLAR

### `sync-dgis.js` ichida

```javascript
✅ parseDgisDate()           // Ruscha sana parsing
✅ scrapeDgisReviewsWithSession()  // Authenticated session scraping
✅ main()                    // Har bir filial uchun sync
✅ Error handling            // Session expire, 401, network errors
✅ Telegram alerts           // Negativ sharhlar uchun
✅ Duplicate checking        // Bazada bor-yo'q tekshirish
✅ Sync logging              // Database-ga log saqlash
```

### Qilinadigan Narsalar

```
1. Session file-dan browser cookies + localStorage o'qadi
2. account.2gis.ru/firms/{firmId}/feedbacks-ga autentifikatsiya bilan o'tadi
3. DOM-ni scroll qilib, sharhlarni yig'adi
4. Ruscha sanalarni parse qiladi (сегодня, вчера, 3 дня назад, 14 января 2025)
5. Author, rating, text, date-ni extract qiladi
6. Bazada bor-yo'q tekshiradi (unique: source + externalReviewId)
7. Yangi sharhni saqlaydi + review's AI analysis
8. Negativ (1-2 ⭐) sharhlar uchun Telegram alert yuboraadi
```

---

## 📊 WORKFLOW

```
npm run sync:dgis-session-check  ← Session sogi'limi?
        ↓
npm run sync:dgis              ← Sharhlarni yig'
        ↓
Database: Review + ReviewSyncLog  ← Tekshir
        ↓
Telegram Alert (agar negativ bo'lsa)
```

---

## ⚠️ MUHIM NARSALAR

### ✅ QILA OLADIGAN

- ✅ **Login qoldi sessiya file**: `npm run sync:dgis-session-save`
- ✅ **Session expired?**: Yangi login qilip, qayta saqlang
- ✅ **HTML struktura o'zgardi?**: DevTools-dan selector topib sync-dgis.js da o'zgart
- ✅ **Sharhlar ko'p?**: Scroll loop-ni `10` dan `20` ga o'zgart

### ❌ QI'LMANG

- ❌ `storage/2gis.json` ni GITHUB-GA PUSH QILMANG (cookies + tokens!)
- ❌ Session file-ni delete qilmang (qayta login qilishga tushadi)
- ❌ Selector'larni random o'zgartirlang (page-ni inspect qilib test qiling)
- ❌ `sync-dgis.js` ni production-da test qilmay run qilmang (dry-run qiling avval)

---

## 🔍 TEKSHIRISH UCHUN

### 1. Session Status
```bash
npm run sync:dgis-session-check
```

**Kutilgan output:**
```
✅ Session file MAVJUD
✅ Session fresh
🔑 Authentication Cookies: 3/3
```

### 2. Sync Jarayoni
```bash
npm run sync:dgis
```

**Kutilgan output:**
```
🚀 2GIS AUTHENTICATED SESSION SYNC (Variant B)
Processing Branch: "Mazzali Tashkent"
  -> ✅ Successfully extracted 23 reviews
  -> Results: 5 new, 18 duplicates
✅ 2GIS Sync Complete!
```

### 3. Database Check
```bash
npm run prisma:studio
# Review → source = 'DGIS' filter
```

**Ko'rish kerak**: DGIS sharhlar yangi qo'shilgan

### 4. Logs Check
```bash
npm run prisma:studio
# ReviewSyncLog → eng so'nggi sync
```

**Ko'rish kerak**: status = 'COMPLETED', syncedReviews soni

---

## 📅 MAINTENANCE

| Har | Amal | Buyruq |
|-----|------|--------|
| **Har kun** | Sync | `npm run sync:dgis` |
| **Har hafta** | Check logs | Prisma Studio-dan ReviewSyncLog ko'r |
| **Har 7 kun** | Session refresh (safety) | `npm run sync:dgis-session-save` |
| **Agar session expire** | Login qayta qilish | `npm run sync:dgis-session-save` |

---

## 🎯 Session File Structure

`storage/2gis.json`:
```json
{
  "cookies": [
    { "name": "spid", "value": "..." },
    { "name": "dg_session_id", "value": "..." },
    { "name": "dg_session_token", "value": "..." },
    ...
  ],
  "localStorage": [...],
  "sessionStorage": [...]
}
```

**Qachon expire?**
- `dg_session_token` expires at: Unix timestamp (odatda ~90 kun)

---

## 🛡️ Security Notes

- ✅ Session file `.gitignore` da (PUSHED BO'LMADI)
- ✅ Cookies secure flag bilan saqlandi
- ✅ No hardcoded credentials
- ✅ Token'lar environment-ga ko'rsatilmadi (logs-da)
- ⚠️ **Faraz**: server secure (https, firewall configured)

---

## 📚 File Locations

```
robot-otziv/
├── sync-dgis.js                  ← ASOSIY (Playwright + Session)
├── storage/
│   └── 2gis.json                 ← Session cookies (GIT IGNORED)
├── scripts/
│   ├── save-2gis-session.js      ← Session saver
│   └── check-2gis-session.js     ← Session checker
├── SETUP-2GIS-VARIANT-B.md       ← Full docs (Ruscha)
├── QUICKSTART-2GIS.md            ← Quick start (3 step)
└── .gitignore                    ← storage/2gis.json qo'shildi
```

---

## 🚨 Troubleshooting

**Q: "Session file not found"**  
A: `npm run sync:dgis-session-save` → login qiling

**Q: "Session expired"**  
A: Yangi login: `npm run sync:dgis-session-save`

**Q: "0 reviews found"**  
A: DevTools (F12) → Elements → inspect `[data-review]` selector

**Q: Sharhlar saqlanmadi**  
A: Prisma Studio check: `npm run prisma:studio`

**Q: Telegram alert yo'q**  
A: Check: `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` database-da

---

## ✨ DONE!

✅ Variant B fully implemented  
✅ Session-based authentication  
✅ Haqiqiy 2GIS sharhlar  
✅ Do's & Don'ts qo'llanmasi  
✅ Security (tokens not in git)  
✅ 3-step quick start  
✅ Troubleshooting guide  

**Qo'llash:** `npm run sync:dgis`

---

**Last Updated**: 2026-06-17 / 11:15  
**Variant**: B (Authenticated Session)  
**Ready**: YES ✅
