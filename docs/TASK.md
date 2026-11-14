# CV. MABEL SOLUSI MANDIRI

**Alamat:** Jl. Raden Rangga Kencana No. 53 Kec. Bojongloa Kidul 40237 - Kota Bandung  
**Website:** [https://mabel.co.id](https://mabel.co.id) | **E-mail:** info@mabel.co.id

---

## Tes Rekrutmen Software Developer

### Prototype Manajemen Kunjungan

Test ini mengukur kemampuan kandidat membangun prototype yang menghubungkan frontend dan backend: merancang API, mengolah data dan filter, menangani kondisi UI, serta menulis pengujian dasar.

Soal ini terinspirasi dari alur kerja aplikasi operasional kunjungan, tetapi menggunakan nama, skenario, dan data fiktif. Kandidat tidak perlu dan tidak diperbolehkan menggunakan kode, data, desain, API, kredensial, atau resource internal MabelHub.

- **Waktu yang diberikan:** Batas pengumpulan 2 hari setelah soal ini diberikan.
- **Format:** Dikerjakan mandiri, Anda boleh memilih stack yang dikuasai.
- **Pengumpulan:** Commit ke GitHub masing-masing (jangan kirim repo _private_), lalu kirimkan tautan repositori melalui email ke: `mabelsolusi.recruitment@gmail.com`.

---

### Apa yang Harus Dilakukan oleh Anda:

**A. Membangun Prototype**  
Buatlah prototype aplikasi web bernama **Visit Flow** untuk membantu tim lapangan mencatat dan memantau kunjungan ke berbagai entitas. Aplikasi harus memiliki frontend dan backend yang saling terhubung. Gunakan data _seed_ buatan sendiri. Jika menggunakan AI, sertakan di `README` berapa persentasenya (%) dan fungsi (`func`) apa saja yang menggunakan AI.

**B. Penjelasan Tech Stack**  
Jelaskan juga mengapa memilih _library_ dan _Tech Stack_ yang digunakan.

> **Nilai Tambah (Point +):** Jika Anda menambahkan nama Sales ketika melakukan kunjungan (terapkan juga di fitur yang harus dibuat).

**C. Fitur yang Harus Dibuat**

1. **Daftar rencana kunjungan**
   - Tampilkan nama entitas, segmen, wilayah, tanggal kunjungan, dan status.
   - Status yang tersedia: `NOT_VISITED` dan `VISITED`.
   - Sediakan pencarian berdasarkan nama entitas.

2. **Filter**
   - Filter berdasarkan segmen: `B2G` atau `B2B`.
   - Filter berdasarkan status kunjungan.
   - Filter tanggal mulai dan tanggal akhir.
   - Beberapa filter harus dapat digunakan sekaligus.
   - Jika tidak ada hasil, tampilkan _empty state_ yang jelas.

3. **Tambah rencana kunjungan**
   - Pengguna dapat memilih entitas, tanggal, dan segmen.
   - Validasi input yang wajib diisi dan tampilkan pesan kesalahan yang mudah dipahami.

4. **Catat hasil kunjungan**
   - Pengguna dapat menandai rencana sebagai `VISITED` atau `NOT_VISITED`.
   - Perubahan harus disimpan melalui backend dan terlihat di frontend.

5. **API dan data entitas**
   - Daftar entitas utama dapat berasal dari _master data_.
   - Jika _master data_ tidak menyediakan pilihan yang relevan, API boleh menyediakan entitas dari riwayat kunjungan sebagai alternatif.
   - Hindari pilihan entitas duplikat. Jika terdapat nama serupa, gunakan jenis entitas untuk membedakannya.

---

### Kode Etik & Ketentuan Teknis

1. Filter harus diterapkan pada data yang benar, bukan hanya mengubah tampilan secara visual.
2. Filter tanggal mencakup tanggal awal dan akhir yang dipilih.
3. Data daftar dan jumlah ringkasan (jika ditampilkan) harus konsisten.
4. Berikan indikator _loading_, pesan _error_, dan _empty state_.
5. Data harus berasal dari API backend. Penyimpanan sementara di memori atau database lokal diperbolehkan, tetapi jelaskan batasannya di `README`.

---

### Kontrak API Minimum

Anda boleh menyesuaikan desain API, tetapi implementasi harus menyediakan fungsi yang setara dengan spesifikasi berikut:

#### 1. Mengambil daftar aktivitas yang cocok dengan filter

```http
GET /api/activities?segment=B2G&status=VISITED&from=2026-03-01&to=2026-03-31&search=melati
```

#### 2. Membuat rencana kunjungan baru

```http
POST /api/activities
Content-Type: application/json
```

**Contoh body:**

```json
{
  "entityId": "ent-001",
  "segment": "B2G",
  "visitDate": "2026-03-15"
}
```

#### 3. Memperbarui status kunjungan

```http
PATCH /api/activities/:id
Content-Type: application/json
```

**Contoh body:**

```json
{
  "status": "VISITED"
}
```

#### 4. Mengambil pilihan entitas

_(Dengan dukungan fallback dari riwayat bila master data tidak memiliki pilihan yang relevan)_

```http
GET /api/entities?segment=B2G&search=melati
```

**Contoh data fiktif:**

```json
[
  {
    "id": "ent-001",
    "name": "Kantor Layanan Melati",
    "type": "Instansi",
    "segment": "B2G",
    "region": "Bandung"
  },
  {
    "id": "ent-002",
    "name": "Toko Sinar Jaya",
    "type": "Perusahaan",
    "segment": "B2B",
    "region": "Jakarta"
  }
]
```

---

### Yang Dikumpulkan:

- _Source code_ prototype.
- `README` yang berisi cara menjalankan frontend dan backend, keputusan teknis, serta batasan yang diketahui.
- Data _seed_ fiktif.
- Minimal beberapa pengujian (_testing_) untuk aturan bisnis atau API.
- Petunjuk akun demo, karena aplikasi harus menggunakan login ber-autentikasi (_Auth_) dan _endpoint_ tidak bisa dimanipulasi di URL.

**Yang Tidak Diperlukan:** _Deployment public_.

---

_Selamat mengerjakan dan good luck!_
