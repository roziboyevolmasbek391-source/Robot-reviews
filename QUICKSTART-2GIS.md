# 🚀 2GIS Variant B - Quick Start

**Holati**: ✅ Variant B (Session-based) o'rnatildi  
**Sessiya File**: `storage/2gis.json` ✓ Mavjud  

---

## 1️⃣ Session Tekshirish (5 sekund)

```bash
npm run sync:dgis-session-check
```

**Output misol:**
```
✅ Session file MAVJUD

📊 Session Details:
   - Cookies: 8
   - Origins: 3
✅ Session fresh (2 kun eski)
```

---

## 2️⃣ Sharhlarni Yig'ish (ASOSIY)

```bash
npm run sync:dgis
```

**Nima qiladi:**
- ✅ 2GIS account-da tanlangan firmalarning sharhlarini yig'adi
- ✅ Yangi sharhlarni bazaga saqlaydi
- ✅ Duplikatlarni skip qiladi
- ✅ Negativ sharhlar uchun Telegram alert yuboradiI

**Kutishni kerak bo'lgan vaqt**: 2-5 minut (firmalar soni va sharhlar qaniqligiga qarab)

---

## 3️⃣ Session Expire Bo'lsa (7 kundan so'ng)

```bash
npm run sync:dgis-session-save
```

**Nima qiladi:**
1. Browser ochiladi
2. 2GIS accountga login qiling
3. Firms ro'yxatini ko'ring (reviews section)
4. Terminal-da ENTER bosing
5. ✅ Session saqlanadi

---

## 📊 Netijalarni Tekshirish

### Database-dan

```bash
npm run prisma:studio
# Keyin: Review → source = 'DGIS' filter qilib ko'ring
```

### Logs-dan

```bash
npm run prisma:studio
# ReviewSyncLog-ga o'tib, eng so'nggi sync-ni ko'ring
```

---

## 📝 Qisqa Ma'lumot

| Buyruq | Maqsad |
|--------|--------|
| `npm run sync:dgis` | Sharhlarni yig' (ASOSIY) |
| `npm run sync:dgis-session-check` | Session sog'ligini tekshir |
| `npm run sync:dgis-session-save` | Yeni session saqlash (expire bo'lsa) |

---

## ⚠️ Xatolar

| Error | Yechim |
|-------|--------|
| "Session file not found" | `npm run sync:dgis-session-save` → login qil |
| "Session expired" | `npm run sync:dgis-session-save` → qayta login |
| 0 reviews found | DevTools bilan HTML selector check qil |

---

## 🔐 Muhim

- ❌ `storage/2gis.json` ni GITHUB-GA PUSH QILMANG
- ✅ `.gitignore` da `storage/2gis.json` qo'shilgan (yapon) ✓
- ⏰ Har 7 kundan session yangilash

---

**📖 Full docs**: `SETUP-2GIS-VARIANT-B.md`  
**Created**: 2026-06-17
