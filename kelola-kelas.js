// ================================================
// KELOLA KELAS & SISWA (termasuk import via Excel)
// ================================================
import { db, auth } from "./firebase-init.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  writeBatch,
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ===== ELEMEN HTML =====
const namaKelasInput = document.getElementById("namaKelasInput");
const mapelKelasInput = document.getElementById("mapelKelasInput");
const tambahKelasBtn = document.getElementById("tambahKelasBtn");
const kelasStatus = document.getElementById("kelasStatus");
const kelasSelect = document.getElementById("kelasSelect");

const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
const excelFileInput = document.getElementById("excelFileInput");
const importSiswaBtn = document.getElementById("importSiswaBtn");
const importStatus = document.getElementById("importStatus");

const siswaTableBody = document.getElementById("siswaTableBody");

let currentUid = null;

// ===== PANTAU LOGIN, LALU MUAT DATA KELAS =====
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
    muatDaftarKelas();
  } else {
    currentUid = null;
  }
});

// ================================================
// TAMBAH KELAS
// ================================================
tambahKelasBtn.addEventListener("click", async () => {
  const nama = namaKelasInput.value.trim();
  const mapel = mapelKelasInput.value.trim();

  if (!nama) {
    kelasStatus.textContent = "Nama kelas wajib diisi.";
    return;
  }
  if (!currentUid) {
    kelasStatus.textContent = "Kamu belum login.";
    return;
  }

  try {
    const kelasRef = collection(db, "users", currentUid, "kelas");
    await addDoc(kelasRef, { nama, mapel, dibuat: new Date().toISOString() });
    kelasStatus.textContent = `Kelas "${nama}" berhasil ditambahkan.`;
    namaKelasInput.value = "";
    mapelKelasInput.value = "";
    muatDaftarKelas();
  } catch (err) {
    console.error(err);
    kelasStatus.textContent = "Gagal menambahkan kelas: " + err.message;
  }
});

// ================================================
// MUAT DAFTAR KELAS KE DROPDOWN
// ================================================
async function muatDaftarKelas() {
  if (!currentUid) return;
  const kelasRef = collection(db, "users", currentUid, "kelas");
  const snapshot = await getDocs(query(kelasRef, orderBy("nama")));

  kelasSelect.innerHTML = '<option value="">-- Pilih kelas --</option>';
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = `${data.nama}${data.mapel ? " (" + data.mapel + ")" : ""}`;
    kelasSelect.appendChild(opt);
  });
}

// Saat kelas dipilih, tampilkan daftar siswanya
kelasSelect.addEventListener("change", () => {
  if (kelasSelect.value) {
    muatDaftarSiswa(kelasSelect.value);
  } else {
    siswaTableBody.innerHTML = "";
  }
});

// ================================================
// DOWNLOAD TEMPLATE EXCEL
// ================================================
downloadTemplateBtn.addEventListener("click", () => {
  const data = [
    ["Nama", "NIS"],
    ["Contoh: Ahmad Fauzi", "12345"],
    ["Contoh: Siti Aminah", "12346"]
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
  XLSX.writeFile(wb, "template-siswa.xlsx");
});

// ================================================
// IMPORT SISWA DARI EXCEL
// ================================================
importSiswaBtn.addEventListener("click", async () => {
  const kelasId = kelasSelect.value;
  const file = excelFileInput.files[0];

  if (!kelasId) {
    importStatus.textContent = "Pilih kelas tujuan dulu.";
    return;
  }
  if (!file) {
    importStatus.textContent = "Pilih file Excel dulu.";
    return;
  }
  if (!currentUid) {
    importStatus.textContent = "Kamu belum login.";
    return;
  }

  importStatus.textContent = "Membaca file...";

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet); // [{Nama: "...", NIS: "..."}, ...]

      if (rows.length === 0) {
        importStatus.textContent = "File Excel kosong atau format kolom salah.";
        return;
      }

      const siswaRef = collection(db, "users", currentUid, "kelas", kelasId, "siswa");
      const batch = writeBatch(db);
      let jumlahValid = 0;

      rows.forEach((row) => {
        const nama = row["Nama"] || row["nama"];
        const nis = row["NIS"] || row["nis"];
        if (!nama) return; // lewati baris tanpa nama

        const newDocRef = doc(siswaRef); // generate ID otomatis
        batch.set(newDocRef, {
          nama: String(nama).trim(),
          nis: nis ? String(nis).trim() : ""
        });
        jumlahValid++;
      });

      await batch.commit();
      importStatus.textContent = `Berhasil import ${jumlahValid} siswa.`;
      excelFileInput.value = "";
      muatDaftarSiswa(kelasId);
    } catch (err) {
      console.error(err);
      importStatus.textContent = "Gagal import: " + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
});

// ================================================
// MUAT & TAMPILKAN DAFTAR SISWA PER KELAS
// ================================================
async function muatDaftarSiswa(kelasId) {
  if (!currentUid) return;
  const siswaRef = collection(db, "users", currentUid, "kelas", kelasId, "siswa");
  const snapshot = await getDocs(query(siswaRef, orderBy("nama")));

  siswaTableBody.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${data.nama}</td><td>${data.nis || "-"}</td>`;
    siswaTableBody.appendChild(tr);
  });
}
