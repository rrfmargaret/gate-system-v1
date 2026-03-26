# 🚧 Gate In/Out System

Sistem pencatatan kendaraan masuk & keluar berbasis web.  
Built by **rrfmargaret** — Security Division.

---

## 📁 Struktur Repo

```
gate-system/
├── public/
│   ├── index.html          ← Landing page (pilih Post 7 / Post 1)
│   ├── post7-entry.html    ← Form entry kendaraan (PC — Post 7)
│   └── post1-exit.html     ← Form exit kendaraan (Android — Post 1)
├── docs/
│   └── Code.gs             ← Google Apps Script backend
├── vercel.json             ← Konfigurasi Vercel
├── netlify.toml            ← Konfigurasi Netlify
└── README.md
```

---

## 🚀 Deploy ke Vercel (Direkomendasikan)

### 1. Upload repo ke GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/gate-system.git
git push -u origin main
```

### 2. Import ke Vercel
1. Buka [vercel.com](https://vercel.com) → **Add New Project**
2. Klik **Import** pada repo `gate-system`
3. Pada bagian **Build & Output Settings**:
   - Build Command: _(kosongkan)_
   - Output Directory: `public`
4. Klik **Deploy**
5. Selesai! URL otomatis tersedia, contoh: `https://gate-system.vercel.app`

### URL yang tersedia setelah deploy:
| URL | Halaman |
|-----|---------|
| `/` | Landing page |
| `/post7-entry` atau `/post7` | Post 7 — Entry |
| `/post1-exit` atau `/post1` | Post 1 — Exit |

---

## 🌐 Deploy ke Netlify (Alternatif)

1. Buka [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project**
2. Pilih repo `gate-system` dari GitHub
3. Pada **Build settings**:
   - Build command: _(kosongkan)_
   - Publish directory: `public`
4. Klik **Deploy site**

---

## ⚙️ Setup Google Sheets Backend

### 1. Buat Google Sheet
1. Buka [sheets.google.com](https://sheets.google.com) → buat spreadsheet baru
2. Beri nama: **Gate In/Out Log**
3. Salin **Sheet ID** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID_INI]/edit
   ```

### 2. Setup Apps Script
1. Di Google Sheet → **Extensions → Apps Script**
2. Hapus kode default, paste seluruh isi `docs/Code.gs`
3. Ganti baris ini:
   ```javascript
   var SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
   ```
   dengan Sheet ID dari langkah 1.
4. Simpan → beri nama project: **Gate System**

### 3. Deploy Apps Script sebagai Web App
1. Klik **Deploy → New deployment**
2. Klik ⚙️ → pilih **Web app**
3. Isi:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy** → izinkan akses
5. Salin **Web App URL** yang muncul

### 4. Pasang URL ke kedua file HTML
Di `public/post7-entry.html` dan `public/post1-exit.html`, cari baris:
```javascript
const SHEET_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
```
Ganti dengan URL dari langkah 3. Kemudian **commit & push** — Vercel/Netlify otomatis redeploy.

---

## 📱 Penggunaan

| Post | Perangkat | Akses |
|------|-----------|-------|
| **Post 7 (Entry)** | PC / Windows | `https://your-domain.vercel.app/post7` |
| **Post 1 (Exit)** | Android Chrome | `https://your-domain.vercel.app/post1` |

### Fitur utama:
- ✅ Input plat manual + scan kamera (OCR)
- ✅ Autofill data kendaraan reguler dari riwayat
- ✅ Annotation dokumen bermasalah (SIM/STNK/KIR Expired/Tilang) + approval
- ✅ Shipment status: Loading / Unloading
- ✅ Mode bulk exit manual (beda jam per kendaraan)
- ✅ Sinkronisasi real-time ke Google Sheets
- ✅ Offline fallback ke localStorage
- ✅ Dark / Light mode toggle
- ✅ Responsive — PC dan Android

---

## 🔄 Update Setelah Perubahan

Cukup push ke GitHub — Vercel/Netlify otomatis redeploy dalam ~30 detik:
```bash
git add .
git commit -m "Update form"
git push
```

---

## 🛠 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Data tidak masuk ke Sheets | Cek `SHEET_URL` sudah diisi & Apps Script di-deploy ulang |
| Post 1 tidak bisa cari plat dari Post 7 | Pastikan kedua device terhubung internet & SHEET_URL sama |
| Kamera tidak bisa dibuka | Vercel/Netlify sudah HTTPS — izinkan akses kamera di browser |
| Durasi `NaN` | Data lama — akan hilang sendiri setelah hari berganti |

---

*Built by rrfmargaret · Security Division*
