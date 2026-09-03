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
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ===== ELEMEN HTML =====
const kelasListEl = document.getElementById("kelasList");
const showTambahKelasBtn = document.getElementById("showTambahKelasBtn");
const tambahKelasForm = document.getElementById("tambahKelasForm");
const namaKelasInput = document.getElementById("namaKelasInput");
const mapelKelasInput = document.getElementById("mapelKelasInput");
const tambahKelasBtn = document.getElementById("tambahKelasBtn");
const batalKelasBtn = document.getElementById("batalKelasBtn");
const kelasStatus = document.getElementById("kelasStatus");

const emptyState = document.getElementById("emptyState");
const kelasDetail = document.getElementById("kelasDetail");
const kelasNamaEl = document.getElementById("kelasNama");
const kelasMetaEl = document.getElementById("kelasMeta");

const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
const excelFileInput = document.getElementById("excelFileInput");
const fileNameDisplay = document.getElementById("fileNameDisplay");
const importSiswaBtn = document.getElementById("importSiswaBtn");
const importStatus = document.getElementById("importStatus");

const siswaTableBody = document.getElementById("siswaTableBody");
const siswaEmpty = document.getElementById("siswaEmpty");

let currentUid = null;
let currentKelasId = null;
let currentKelasData = null;

// ===== PANTAU LOGIN =====
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
    muatDaftarKelas();
  } else {
    currentUid = null;
  }
});

// ================================================
// TOGGLE FORM TAMBAH KELAS
// ================================================
showTambahKelasBtn.addEventListener("click", () => {
  tambahKelasForm.hidden = false;
  showTambahKelasBtn.hidden = true;
  namaKelasInput.focus();
});

batalKelasBtn.addEventListener("click", () => {
  tambahKelasForm.hidden = true;
  showTambahKelasBtn.hidden = false;
  namaKelasInput.value = "";
  mapelKelasInput.value = "";
  kelasStatus.textContent = "";
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
    kelasStatus.textContent = "Kamu belum masuk.";
    return;
  }

  try {
    const kelasRef = collection(db, "users", currentUid, "kelas");
    await addDoc(kelasRef, { nama, mapel, dibuat: new Date().toISOString() });
    namaKelasInput.value = "";
    mapelKelasInput.value = "";
    kelasStatus.textContent = "";
    tambahKelasForm.hidden = true;
    showTambahKelasBtn.hidden = false;
    muatDaftarKelas();
  } catch (err) {
    console.error(err);
    kelasStatus.textContent = "Gagal menyimpan: " + err.message;
  }
});

// ================================================
// MUAT DAFTAR KELAS KE SIDEBAR
// ================================================
async function muatDaftarKelas() {
  if (!currentUid) return;
  const kelasRef = collection(db, "users", currentUid, "kelas");
  const snapshot = await getDocs(query(kelasRef, orderBy("nama")));

  kelasListEl.innerHTML = "";

  if (snapshot.empty) {
    return;
  }

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "kelas-item" + (docSnap.id === currentKelasId ? " active" : "");
    btn.innerHTML = `
      <span class="kelas-item-nama">${escapeHtml(data.nama)}</span>
      ${data.mapel ? `<span class="kelas-item-mapel">${escapeHtml(data.mapel)}</span>` : ""}
    `;
    btn.addEventListener("click", () => pilihKelas(docSnap.id, data));
    li.appendChild(btn);
    kelasListEl.appendChild(li);
  });
}

// ================================================
// PILIH KELAS
// ================================================
function pilihKelas(kelasId, data) {
  currentKelasId = kelasId;
  currentKelasData = data;

  // update highlight di sidebar
  [...kelasListEl.querySelectorAll(".kelas-item")].forEach((el) => el.classList.remove("active"));
  const idx = [...kelasListEl.children].findIndex((li) => li.textContent.includes(data.nama));

  emptyState.hidden = true;
  kelasDetail.hidden = false;

  kelasNamaEl.textContent = data.nama;
  kelasMetaEl.textContent = data.mapel ? data.mapel : "";

  importStatus.textContent = "";
  excelFileInput.value = "";
  fileNameDisplay.textContent = "Pilih file Excel…";

  muatDaftarKelas(); // refresh supaya highlight active benar
  muatDaftarSiswa(kelasId);
}

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

// ===== Tampilkan nama file yang dipilih =====
excelFileInput.addEventListener("change", () => {
  fileNameDisplay.textContent = excelFileInput.files[0]
    ? excelFileInput.files[0].name
    : "Pilih file Excel…";
});

// ================================================
// IMPORT SISWA DARI EXCEL
// ================================================
importSiswaBtn.addEventListener("click", async () => {
  const file = excelFileInput.files[0];

  if (!currentKelasId) {
    importStatus.textContent = "Pilih kelas dulu.";
    return;
  }
  if (!file) {
    importStatus.textContent = "Pilih file Excel dulu.";
    return;
  }

  importStatus.textContent = "Membaca file…";

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        importStatus.textContent = "File Excel kosong atau format kolom tidak sesuai.";
        return;
      }

      const siswaRef = collection(db, "users", currentUid, "kelas", currentKelasId, "siswa");
      const batch = writeBatch(db);
      let jumlahValid = 0;

      rows.forEach((row) => {
        const nama = row["Nama"] || row["nama"];
        const nis = row["NIS"] || row["nis"];
        if (!nama) return;

        const newDocRef = doc(siswaRef);
        batch.set(newDocRef, {
          nama: String(nama).trim(),
          nis: nis ? String(nis).trim() : ""
        });
        jumlahValid++;
      });

      await batch.commit();
      importStatus.textContent = `${jumlahValid} siswa berhasil diimpor.`;
      excelFileInput.value = "";
      fileNameDisplay.textContent = "Pilih file Excel…";
      muatDaftarSiswa(currentKelasId);
    } catch (err) {
      console.error(err);
      importStatus.textContent = "Gagal impor: " + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
});

// ================================================
// MUAT & TAMPILKAN DAFTAR SISWA
// ================================================
async function muatDaftarSiswa(kelasId) {
  if (!currentUid) return;
  const siswaRef = collection(db, "users", currentUid, "kelas", kelasId, "siswa");
  const snapshot = await getDocs(query(siswaRef, orderBy("nama")));

  siswaTableBody.innerHTML = "";

  if (snapshot.empty) {
    siswaEmpty.hidden = false;
    document.getElementById("siswaTable").hidden = true;
    return;
  }

  siswaEmpty.hidden = true;
  document.getElementById("siswaTable").hidden = false;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(data.nama)}</td><td>${escapeHtml(data.nis || "-")}</td>`;
    siswaTableBody.appendChild(tr);
  });
}

// ================================================
// UTIL
// ================================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
