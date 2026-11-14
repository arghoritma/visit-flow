# PRD — Visit Flow

**Prototype Manajemen Kunjungan** · CV. Mabel Solusi Mandiri (tes rekrutmen
Software Developer) · Nama, skenario, dan data dalam dokumen ini fiktif.

---

## 1. Latar Belakang & Tujuan

Tim lapangan (Sales) perlu mencatat dan memantau rencana kunjungan ke
berbagai entitas (instansi/perusahaan). Visit Flow adalah prototype web
app yang menghubungkan frontend dan backend untuk:

- Mendaftarkan rencana kunjungan ke sebuah entitas pada tanggal tertentu.
- Mencari dan memfilter rencana kunjungan secara akurat (filter diterapkan
  pada data, bukan hanya di tampilan).
- Mencatat hasil kunjungan (`VISITED` / `NOT_VISITED`).
- Menyediakan data entitas untuk dipilih saat membuat rencana, dengan
  fallback ke riwayat kunjungan bila master data tidak relevan.

## 2. Target Pengguna

- **Sales / Tim Lapangan** — login, membuat rencana kunjungan, mencatat
  hasil, melihat daftar kunjungannya.
- Satu role (`user`) sudah memadai untuk prototype ini; peran `admin` dari
  boilerplate tidak dipakai kecuali dibutuhkan untuk melihat semua data
  lintas sales (opsional, bukan syarat wajib tes).

## 3. Lingkup (Scope)

### 3.1 Masuk lingkup (in scope)

1. **Daftar rencana kunjungan** — nama entitas, segmen, wilayah, tanggal
   kunjungan, status, **nama Sales** (nilai tambah).
2. **Pencarian** berdasarkan nama entitas (server-side, case-insensitive,
   substring).
3. **Filter** (dapat dikombinasikan, diterapkan di query backend):
   - Segmen: `B2G` atau `B2B`.
   - Status: `NOT_VISITED` atau `VISITED`.
   - Rentang tanggal `from`–`to` (inklusif kedua ujung).
4. **Empty state** yang jelas ketika hasil filter kosong.
5. **Tambah rencana kunjungan** — pilih entitas, tanggal, segmen, nama
   Sales; validasi field wajib dengan pesan kesalahan yang jelas.
6. **Catat hasil kunjungan** — toggle status `VISITED` ⇄ `NOT_VISITED`,
   tersimpan di backend dan tercermin di frontend tanpa reload penuh.
7. **API & data entitas** — daftar entitas dari master data; jika tidak
   ada pilihan relevan untuk suatu pencarian/segmen, sertakan entitas yang
   pernah muncul di riwayat kunjungan (fallback), tanpa duplikat (bedakan
   via `type` ketika nama serupa).
8. **Auth** — hanya pengguna yang login dapat mengakses halaman dan API
   `/api/activities*`, `/api/entities*`. Akun demo disediakan di README.
9. **Loading, error, empty state** pada semua layar yang memuat data dari
   API.
10. **Testing dasar** — aturan bisnis filter dan status, serta validasi
    input, diuji otomatis (`bun test`).

### 3.2 Luar lingkup (out of scope)

- Deployment publik.
- Multi-tenant / multi-perusahaan.
- Manajemen entitas penuh (create/update/delete entitas) — entitas berasal
  dari seed/master data; tidak ada CRUD entitas di UI (kecuali ditambahkan
  sebagai perluasan opsional).
- Laporan/analitik lanjutan, ekspor data, notifikasi.
- Role-based access control granular (hanya memanfaatkan auth bawaan
  boilerplate: `user`/`admin`).

## 4. Alur Pengguna Utama

1. Sales login (`/login`, akun demo).
2. Masuk ke halaman **Kunjungan** (`/visits` atau sejenis) → melihat daftar
   rencana kunjungan beserta status.
3. Mencari entitas by nama, dan/atau memfilter segmen/status/tanggal —
   daftar + jumlah hasil konsisten dengan filter aktif.
4. Jika hasil kosong → tampil empty state dengan petunjuk (misal: ubah
   filter).
5. Klik **Tambah Kunjungan** → modal/form: pilih entitas (dropdown dengan
   search, tanpa duplikat), isi tanggal, pilih segmen (auto-terisi dari
   entitas atau dapat disesuaikan), isi nama Sales → submit.
   - Jika field wajib kosong/tidak valid → pesan error per field.
   - Sukses → entri baru muncul di daftar dengan status default
     `NOT_VISITED`.
6. Pada salah satu entri, Sales menandai kunjungan selesai → toggle status
   ke `VISITED` (atau kembali ke `NOT_VISITED` jika salah tandai) →
   tersimpan via `PATCH`, UI update tanpa reload.

## 5. Kontrak API

Mengikuti kontrak minimum pada `docs/TASK.md`, diselaraskan dengan pola
boilerplate (Hono route per namespace, auth middleware, TypeBox
validation, respons JSON konsisten).

Semua endpoint di bawah memerlukan sesi login (`requireAuth`); diakses
sebagai halaman Inertia + fetch internal, bukan dapat dimanipulasi bebas
lewat URL publik.

### 5.1 `GET /api/activities`

Query params (semua opsional, dapat dikombinasikan):

| Param | Tipe | Keterangan |
|---|---|---|
| `segment` | `B2G` \| `B2B` | filter persis |
| `status` | `NOT_VISITED` \| `VISITED` | filter persis |
| `from` | `YYYY-MM-DD` | batas awal `visitDate`, inklusif |
| `to` | `YYYY-MM-DD` | batas akhir `visitDate`, inklusif |
| `search` | string | substring pada nama entitas, case-insensitive |
| `page`, `perPage` | integer | opsional, default sesuai `Paginated<T>` bawaan |

Respons `200`:

```json
{
  "data": [
    {
      "id": "act-001",
      "entityId": "ent-001",
      "entityName": "Kantor Layanan Melati",
      "entityType": "Instansi",
      "segment": "B2G",
      "region": "Bandung",
      "visitDate": "2026-03-15",
      "status": "NOT_VISITED",
      "salesName": "Dewi Anggraini",
      "createdAt": "2026-03-01T04:00:00.000Z"
    }
  ],
  "meta": { "currentPage": 1, "perPage": 20, "lastPage": 1, "total": 1 }
}
```

Jika tidak ada hasil: `data: []`, `meta.total: 0` → frontend menampilkan
empty state.

### 5.2 `POST /api/activities`

Body:

```json
{
  "entityId": "ent-001",
  "segment": "B2G",
  "visitDate": "2026-03-15",
  "salesName": "Dewi Anggraini"
}
```

Validasi (TypeBox, pola `validateJson` + `ValidationFailed` → 422):

- `entityId`: wajib, harus merujuk entitas yang ada.
- `segment`: wajib, salah satu `B2G` | `B2B`.
- `visitDate`: wajib, format `YYYY-MM-DD` valid.
- `salesName`: wajib, 2–80 karakter (nilai tambah — diwajibkan di
  prototype ini agar fitur tersebut nyata dipakai).

Respons `201` dengan objek activity lengkap (status awal
`NOT_VISITED`). Respons `422` dengan daftar error per field bila validasi
gagal.

### 5.3 `PATCH /api/activities/:id`

Body:

```json
{ "status": "VISITED" }
```

- `status` wajib, salah satu `NOT_VISITED` | `VISITED`.
- `404` jika `id` tidak ditemukan atau bukan milik sesi yang berwenang.
- `200` dengan objek activity yang sudah diperbarui.

### 5.4 `GET /api/entities`

Query params: `segment` (opsional), `search` (opsional, substring nama).

Sumber data (urutan fallback):

1. Master data entitas (tabel `entities`, hasil seed).
2. Bila kombinasi `segment`+`search` tidak menghasilkan baris relevan di
   master data, tambahkan entitas unik yang muncul di riwayat `activities`
   yang cocok dengan filter yang sama (mis. entitas lama yang sudah tidak
   ada di master tapi pernah dikunjungi).

Deduplikasi: unik berdasarkan `(name, type)`; jika dua entitas punya nama
sama tapi `type` berbeda, keduanya tetap ditampilkan dan dibedakan lewat
`type` di label (`"Melati — Instansi"` vs `"Melati — Perusahaan"`).

Respons `200`:

```json
[
  { "id": "ent-001", "name": "Kantor Layanan Melati", "type": "Instansi", "segment": "B2G", "region": "Bandung" }
]
```

## 6. Aturan Bisnis & Non-Fungsional

1. Filter diterapkan pada query SQL (`WHERE` berparameter), tidak pernah
   hanya memfilter array di client.
2. Filter tanggal inklusif pada kedua batas.
3. Jumlah (`meta.total`) dan isi `data` list selalu konsisten (diambil
   dari query yang sama, tidak dihitung terpisah dari sumber berbeda).
4. Setiap pemanggilan API di frontend memiliki tiga state eksplisit:
   loading, error, dan (untuk list) empty.
5. Penyimpanan: `bun:sqlite` on-disk per `DATABASE_PATH` (default
   boilerplate), bukan in-memory — namun untuk keperluan tes, file DB tidak
   disertakan; hanya migrasi + seed script. Batasan: single-writer SQLite,
   cocok untuk prototype, tidak untuk concurrency tinggi produksi.
6. Auth: sesi cookie (`requireAuth` dari `services/auth.ts`); endpoint API
   menolak permintaan tanpa sesi valid dengan `401`, terlepas dari
   parameter apa pun di URL.
7. Semua field tanggal disimpan dan dipertukarkan sebagai `YYYY-MM-DD`
   (tanpa waktu) untuk `visitDate`; timestamp lain (`createdAt`) tetap ISO
   8601 UTC seperti konvensi boilerplate (`strftime('%Y-%m-%dT%H:%M:%fZ')`).

## 7. Tech Stack (ringkas — detail & alasan di README)

Mewarisi boilerplate "Panceg" yang sudah ada di repo ini:

- **Bun + Hono** — backend/API, konsisten dengan middleware auth yang
  sudah ada.
- **bun:sqlite, zero-ORM** — tabel baru lewat migrasi bernomor, query
  lewat `src/server/repo/`.
- **Inertia v3 + Svelte 5** — halaman baru terintegrasi ke SSR/page
  registry yang sudah berjalan, tanpa membangun SPA/router terpisah.
- **Tailwind v4** — UI baru memakai token & komponen existing
  (`Field.svelte`, `Layout.svelte`, dsb.), bukan desain paralel.
- **TypeBox** — validasi payload `POST`/`PATCH` activities.

Alasan memilih untuk *tidak* membuat stack baru: tes menilai kemampuan
menghubungkan FE↔BE, mengelola filter, dan validasi — boilerplate yang
ada sudah menyediakan pondasi auth, migrasi, dan Inertia yang solid,
sehingga upaya difokuskan ke domain Visit Flow, bukan re-plumbing
infrastruktur.

## 8. Yang Dikumpulkan (mapping ke deliverable tes)

| Syarat tes | Pemenuhan |
|---|---|
| Source code prototype | Repo ini (fitur Visit Flow di atas boilerplate) |
| README cara jalan FE+BE, keputusan teknis, batasan | `README.md` (root) |
| Data seed fiktif | `scripts/seed.ts` diperluas / script baru untuk entities+activities |
| Testing dasar | `tests/activities.test.ts` (atau sejenis) |
| Akun demo + auth, endpoint tak bisa dimanipulasi via URL | README bagian "Demo Account"; `requireAuth` pada semua route `/api/activities*`, `/api/entities*` |

## 9. Risiko & Batasan Diketahui

- SQLite single-file: tidak untuk beban tulis tinggi/multi-instance.
- Tidak ada pemisahan data per-Sales (semua user melihat semua kunjungan)
  kecuali diperluas — disebutkan sebagai batasan di README jika tidak
  diimplementasikan.
- Fallback entitas dari riwayat kunjungan bersifat heuristik sederhana
  (match segmen+search di tabel activities/entities gabungan), bukan
  full-text search.
</content>
