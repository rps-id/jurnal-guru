// ================================================
// JURNAL GURU — APP LOGIC
// ================================================
import { db, auth } from "./firebase-init.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let uid = null;
let kelasCache = [];       // semua kelas milik guru
let siswaCache = [];       // siswa di kelas aktif
let activeKelasId = null;

const JENIS_LABEL = {
  tugas: "Tugas",
  ulangan_harian: "Ulangan Harian",
  uts: "UTS",
  uas: "UAS"
};

// ================================================
// UTIL
// ================================================
function el(id) { return document.getElementById(id); }
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function showLoading(v) { el("loadingOverlay").classList.toggle("open", v); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function openModal(html) {
  el("modalBox").innerHTML = html;
  el("modalOverlay").classList.add("open");
}
function closeModal() { el("modalOverlay").classList.remove("open"); }
el("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

// ================================================
// NAVIGASI SIDEBAR
// ================================================
document.querySelectorAll(".sidebar-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    el(btn.dataset.page).classList.add("active");
  });
});

// ================================================
// AUTH
// ================================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    muatKelas();
  } else {
    uid = null;
  }
});

// ================================================
// FIRESTORE PATH HELPERS
// ================================================
const kelasCol = () => collection(db, "users", uid, "kelas");
const siswaCol = (kelasId) => collection(db, "users", uid, "kelas", kelasId, "siswa");
const pertemuanCol = (kelasId) => collection(db, "users", uid, "kelas", kelasId, "pertemuan");
const nilaiCol = (kelasId) => collection(db, "users", uid, "kelas", kelasId, "nilai");
const catatanCol = (kelasId, siswaId) => collection(db, "users", uid, "kelas", kelasId, "siswa", siswaId, "catatan");

// ================================================
// KELAS: MUAT & RENDER
// ================================================
async function muatKelas() {
  showLoading(true);
  const snap = await getDocs(query(kelasCol(), orderBy("nama")));
  showLoading(false);
  kelasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // isi selector kelas aktif
  const sel = el("kelasAktifSelect");
  const prevVal = activeKelasId;
  sel.innerHTML = '<option value="">— Pilih kelas —</option>' +
    kelasCache.map((k) => `<option value="${k.id}">${esc(k.nama)}${k.mapel ? " · " + esc(k.mapel) : ""}</option>`).join("");
  if (prevVal && kelasCache.some((k) => k.id === prevVal)) {
    sel.value = prevVal;
  } else if (kelasCache.length > 0) {
    sel.value = kelasCache[0].id;
  }
  activeKelasId = sel.value || null;

  renderTabelKelas();
  await onKelasAktifChange();
}

function renderTabelKelas() {
  const tbody = el("tbodyKelas");
  if (kelasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Belum ada kelas. Klik "+ Tambah Kelas" untuk mulai.</td></tr>';
    return;
  }
  tbody.innerHTML = kelasCache.map((k) => `
    <tr>
      <td><strong>${esc(k.nama)}</strong></td>
      <td>${esc(k.mapel || "-")}</td>
      <td>${k.jumlahSiswa ?? "-"}</td>
      <td>
        <button class="btn btn-sm btn-outline" data-edit-kelas="${k.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-hapus-kelas="${k.id}">Hapus</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-kelas]").forEach((b) =>
    b.addEventListener("click", () => showKelasForm(b.dataset.editKelas)));
  tbody.querySelectorAll("[data-hapus-kelas]").forEach((b) =>
    b.addEventListener("click", () => hapusKelas(b.dataset.hapusKelas)));
}

el("kelasAktifSelect").addEventListener("change", () => {
  activeKelasId = el("kelasAktifSelect").value || null;
  onKelasAktifChange();
});

async function onKelasAktifChange() {
  const kelas = kelasCache.find((k) => k.id === activeKelasId);
  const label = kelas ? `— ${kelas.nama}${kelas.mapel ? " · " + kelas.mapel : ""}` : "";
  ["siswaKelasLabel", "absensiKelasLabel", "nilaiKelasLabel", "catatanKelasLabel"].forEach((id) => {
    el(id).textContent = label;
  });

  if (!activeKelasId) {
    siswaCache = [];
    renderTabelSiswa();
    renderTabelAbsensiInput();
    renderTabelNilaiInput();
    renderCatatanSiswaSelect();
    el("tbodyRiwayatAbsensi").innerHTML = '<tr><td colspan="7" class="empty-row">Pilih kelas terlebih dahulu.</td></tr>';
    el("tbodyRiwayatNilai").innerHTML = '<tr><td colspan="5" class="empty-row">Pilih kelas terlebih dahulu.</td></tr>';
    return;
  }

  showLoading(true);
  const snap = await getDocs(query(siswaCol(activeKelasId), orderBy("nama")));
  showLoading(false);
  siswaCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  renderTabelSiswa();
  renderTabelAbsensiInput();
  renderTabelNilaiInput();
  renderCatatanSiswaSelect();
  muatRiwayatAbsensi();
  muatRiwayatNilai();

  el("absensiTanggal").value = todayStr();
  el("nilaiTanggal").value = todayStr();
}

// ================================================
// KELAS: TAMBAH / EDIT / HAPUS
// ================================================
el("btnTambahKelas").addEventListener("click", () => showKelasForm());

function showKelasForm(editId = null) {
  const d = editId ? kelasCache.find((k) => k.id === editId) : { nama: "", mapel: "" };
  openModal(`
    <h3>${editId ? "Edit" : "Tambah"} Kelas</h3>
    <form id="formKelas">
      <div class="form-group"><label>Nama Kelas</label><input type="text" id="fKelasNama" value="${esc(d.nama)}" required></div>
      <div class="form-group"><label>Mata Pelajaran</label><input type="text" id="fKelasMapel" value="${esc(d.mapel || "")}"></div>
      <button type="submit" class="btn" style="width:100%;">Simpan</button>
    </form>
  `);
  el("formKelas").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nama = el("fKelasNama").value.trim();
    const mapel = el("fKelasMapel").value.trim();
    if (!nama) return;
    showLoading(true);
    if (editId) {
      await updateDoc(doc(db, "users", uid, "kelas", editId), { nama, mapel });
    } else {
      await addDoc(kelasCol(), { nama, mapel, dibuat: new Date().toISOString() });
    }
    showLoading(false);
    closeModal();
    muatKelas();
  });
}

async function hapusKelas(kelasId) {
  const k = kelasCache.find((x) => x.id === kelasId);
  if (!confirm(`Hapus kelas "${k?.nama}"? Semua data siswa, absensi, nilai, dan catatan di kelas ini akan ikut terhapus.`)) return;
  showLoading(true);
  const siswaSnap = await getDocs(siswaCol(kelasId));
  for (const s of siswaSnap.docs) {
    const catSnap = await getDocs(catatanCol(kelasId, s.id));
    for (const c of catSnap.docs) await deleteDoc(c.ref);
    await deleteDoc(s.ref);
  }
  const pertemuanSnap = await getDocs(pertemuanCol(kelasId));
  for (const p of pertemuanSnap.docs) await deleteDoc(p.ref);
  const nilaiSnap = await getDocs(nilaiCol(kelasId));
  for (const n of nilaiSnap.docs) await deleteDoc(n.ref);
  await deleteDoc(doc(db, "users", uid, "kelas", kelasId));
  showLoading(false);
  if (activeKelasId === kelasId) activeKelasId = null;
  muatKelas();
}

// ================================================
// SISWA: RENDER, TAMBAH MANUAL, IMPORT EXCEL
// ================================================
function renderTabelSiswa() {
  const tbody = el("tbodySiswa");
  if (!activeKelasId) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Pilih kelas terlebih dahulu.</td></tr>';
    return;
  }
  if (siswaCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Belum ada siswa. Upload Excel atau unduh template di atas.</td></tr>';
    return;
  }
  tbody.innerHTML = siswaCache.map((s) => `
    <tr>
      <td>${esc(s.nama)}</td>
      <td>${esc(s.nis || "-")}</td>
      <td><button class="btn btn-sm btn-danger" data-hapus-siswa="${s.id}">Hapus</button></td>
    </tr>
  `).join("");
  tbody.querySelectorAll("[data-hapus-siswa]").forEach((b) =>
    b.addEventListener("click", () => hapusSiswa(b.dataset.hapusSiswa)));
}

async function hapusSiswa(siswaId) {
  if (!confirm("Hapus siswa ini beserta seluruh catatannya?")) return;
  showLoading(true);
  const catSnap = await getDocs(catatanCol(activeKelasId, siswaId));
  for (const c of catSnap.docs) await deleteDoc(c.ref);
  await deleteDoc(doc(db, "users", uid, "kelas", activeKelasId, "siswa", siswaId));
  showLoading(false);
  onKelasAktifChange();
}

el("btnDownloadTemplate").addEventListener("click", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nama", "NIS"],
    ["Contoh: Ahmad Fauzi", "12345"],
    ["Contoh: Siti Aminah", "12346"]
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
  XLSX.writeFile(wb, "template-siswa.xlsx");
});

let tempImportSiswa = [];

el("fileSiswaExcel").addEventListener("change", (e) => {
  if (!activeKelasId) { alert("Pilih kelas dulu sebelum upload."); e.target.value = ""; return; }
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    tempImportSiswa = [];
    const tbody = document.querySelector("#tablePreviewSiswa tbody");
    tbody.innerHTML = "";
    rows.forEach((row, i) => {
      const nama = row["Nama"] || row["nama"];
      const nis = row["NIS"] || row["nis"];
      const valid = !!nama;
      tempImportSiswa.push({ nama: nama ? String(nama).trim() : "", nis: nis ? String(nis).trim() : "", valid });
      tbody.innerHTML += `<tr>
        <td>${i + 1}</td><td>${esc(nama || "-")}</td><td>${esc(nis || "-")}</td>
        <td><span class="status-badge ${valid ? "success" : "danger"}">${valid ? "Valid" : "Nama kosong"}</span></td>
      </tr>`;
    });
    el("previewSiswaBox").hidden = false;
  };
  reader.readAsArrayBuffer(file);
});

el("btnConfirmImportSiswa").addEventListener("click", async () => {
  const valids = tempImportSiswa.filter((s) => s.valid);
  if (valids.length === 0) return alert("Tidak ada data valid untuk disimpan.");
  showLoading(true);
  const batch = writeBatch(db);
  valids.forEach((s) => {
    const ref = doc(siswaCol(activeKelasId));
    batch.set(ref, { nama: s.nama, nis: s.nis });
  });
  await batch.commit();
  showLoading(false);
  el("previewSiswaBox").hidden = true;
  el("fileSiswaExcel").value = "";
  onKelasAktifChange();
});

el("btnCancelImportSiswa").addEventListener("click", () => {
  el("previewSiswaBox").hidden = true;
  el("fileSiswaExcel").value = "";
});

// ================================================
// ABSENSI
// ================================================
function renderTabelAbsensiInput() {
  const tbody = el("tbodyAbsensi");
  if (!activeKelasId || siswaCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Pilih kelas dengan siswa terlebih dahulu.</td></tr>';
    return;
  }
  tbody.innerHTML = siswaCache.map((s) => `
    <tr>
      <td>${esc(s.nama)}</td>
      <td>${esc(s.nis || "-")}</td>
      <td>
        <select data-absensi-siswa="${s.id}">
          <option value="hadir">Hadir</option>
          <option value="sakit">Sakit</option>
          <option value="izin">Izin</option>
          <option value="alpa">Alpa</option>
        </select>
      </td>
    </tr>
  `).join("");
}

el("absensiTanggal").addEventListener("change", muatAbsensiUntukTanggal);

async function muatAbsensiUntukTanggal() {
  if (!activeKelasId) return;
  const tgl = el("absensiTanggal").value;
  if (!tgl) return;
  showLoading(true);
  const snap = await getDoc(doc(pertemuanCol(activeKelasId), tgl));
  showLoading(false);
  const data = snap.exists() ? snap.data() : null;
  el("absensiMateri").value = data?.materi || "";
  document.querySelectorAll("[data-absensi-siswa]").forEach((sel) => {
    const id = sel.dataset.absensiSiswa;
    sel.value = data?.absensi?.[id] || "hadir";
  });
}

el("btnSimpanAbsensi").addEventListener("click", async () => {
  if (!activeKelasId) return;
  const tgl = el("absensiTanggal").value;
  if (!tgl) { el("absensiStatus").textContent = "Pilih tanggal dulu."; return; }
  if (siswaCache.length === 0) { el("absensiStatus").textContent = "Belum ada siswa di kelas ini."; return; }

  const absensi = {};
  document.querySelectorAll("[data-absensi-siswa]").forEach((sel) => {
    absensi[sel.dataset.absensiSiswa] = sel.value;
  });

  showLoading(true);
  await setDoc(doc(pertemuanCol(activeKelasId), tgl), {
    tanggal: tgl,
    materi: el("absensiMateri").value.trim(),
    absensi
  });
  showLoading(false);
  el("absensiStatus").textContent = "Absensi tersimpan.";
  muatRiwayatAbsensi();
});

async function muatRiwayatAbsensi() {
  if (!activeKelasId) return;
  showLoading(true);
  const snap = await getDocs(query(pertemuanCol(activeKelasId), orderBy("tanggal", "desc")));
  showLoading(false);
  const tbody = el("tbodyRiwayatAbsensi");
  if (snap.empty) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Belum ada data absensi.</td></tr>';
    return;
  }
  tbody.innerHTML = snap.docs.map((d) => {
    const data = d.data();
    const rekap = { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
    Object.values(data.absensi || {}).forEach((v) => { if (rekap[v] !== undefined) rekap[v]++; });
    return `
      <tr>
        <td>${data.tanggal}</td>
        <td>${esc(data.materi || "-")}</td>
        <td>${rekap.hadir}</td>
        <td>${rekap.sakit}</td>
        <td>${rekap.izin}</td>
        <td>${rekap.alpa}</td>
        <td>
          <button class="btn btn-sm btn-outline" data-lihat-absensi="${data.tanggal}">Buka</button>
          <button class="btn btn-sm btn-danger" data-hapus-absensi="${data.tanggal}">Hapus</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-lihat-absensi]").forEach((b) =>
    b.addEventListener("click", () => { el("absensiTanggal").value = b.dataset.lihatAbsensi; muatAbsensiUntukTanggal(); }));
  tbody.querySelectorAll("[data-hapus-absensi]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus data absensi tanggal ini?")) return;
      showLoading(true);
      await deleteDoc(doc(pertemuanCol(activeKelasId), b.dataset.hapusAbsensi));
      showLoading(false);
      muatRiwayatAbsensi();
    }));
}

// ================================================
// NILAI
// ================================================
let editingNilaiId = null;

function renderTabelNilaiInput() {
  const tbody = el("tbodyNilaiInput");
  if (!activeKelasId || siswaCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Pilih kelas dengan siswa terlebih dahulu.</td></tr>';
    return;
  }
  tbody.innerHTML = siswaCache.map((s) => `
    <tr>
      <td>${esc(s.nama)}</td>
      <td>${esc(s.nis || "-")}</td>
      <td><input type="number" min="0" max="100" data-nilai-siswa="${s.id}" placeholder="-"></td>
    </tr>
  `).join("");
}

el("btnSimpanNilai").addEventListener("click", async () => {
  if (!activeKelasId) return;
  const nama = el("nilaiNama").value.trim();
  const jenis = el("nilaiJenis").value;
  const tanggal = el("nilaiTanggal").value;
  if (!nama || !tanggal) { el("nilaiStatus").textContent = "Nama penilaian dan tanggal wajib diisi."; return; }

  const nilaiMap = {};
  document.querySelectorAll("[data-nilai-siswa]").forEach((inp) => {
    if (inp.value !== "") nilaiMap[inp.dataset.nilaiSiswa] = Number(inp.value);
  });
  if (Object.keys(nilaiMap).length === 0) { el("nilaiStatus").textContent = "Isi minimal satu nilai siswa."; return; }

  showLoading(true);
  const payload = { jenis, nama, tanggal, nilai: nilaiMap };
  if (editingNilaiId) {
    await updateDoc(doc(nilaiCol(activeKelasId), editingNilaiId), payload);
  } else {
    await addDoc(nilaiCol(activeKelasId), payload);
  }
  showLoading(false);
  el("nilaiStatus").textContent = "Nilai tersimpan.";
  batalEditNilai();
  muatRiwayatNilai();
});

function batalEditNilai() {
  editingNilaiId = null;
  el("btnBatalEditNilai").hidden = true;
  el("nilaiNama").value = "";
  document.querySelectorAll("[data-nilai-siswa]").forEach((i) => (i.value = ""));
  el("nilaiTanggal").value = todayStr();
}
el("btnBatalEditNilai").addEventListener("click", batalEditNilai);

el("filterRiwayatJenis").addEventListener("change", muatRiwayatNilai);

async function muatRiwayatNilai() {
  if (!activeKelasId) return;
  showLoading(true);
  const snap = await getDocs(query(nilaiCol(activeKelasId), orderBy("tanggal", "desc")));
  showLoading(false);
  const filterJenis = el("filterRiwayatJenis").value;
  let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (filterJenis) list = list.filter((n) => n.jenis === filterJenis);

  const tbody = el("tbodyRiwayatNilai");
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Belum ada data nilai.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((n) => {
    const nilaiValues = Object.values(n.nilai || {});
    const avg = nilaiValues.length ? (nilaiValues.reduce((a, b) => a + b, 0) / nilaiValues.length).toFixed(1) : "-";
    return `
      <tr>
        <td>${esc(n.nama)}</td>
        <td><span class="status-badge muted">${JENIS_LABEL[n.jenis] || n.jenis}</span></td>
        <td>${n.tanggal}</td>
        <td>${avg}</td>
        <td>
          <button class="btn btn-sm btn-outline" data-edit-nilai="${n.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-hapus-nilai="${n.id}">Hapus</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-edit-nilai]").forEach((b) =>
    b.addEventListener("click", () => editNilai(b.dataset.editNilai, list)));
  tbody.querySelectorAll("[data-hapus-nilai]").forEach((b) =>
    b.addEventListener("click", () => hapusNilai(b.dataset.hapusNilai)));
}

function editNilai(nilaiId, list) {
  const n = list.find((x) => x.id === nilaiId);
  if (!n) return;
  editingNilaiId = nilaiId;
  el("nilaiJenis").value = n.jenis;
  el("nilaiNama").value = n.nama;
  el("nilaiTanggal").value = n.tanggal;
  document.querySelectorAll("[data-nilai-siswa]").forEach((inp) => {
    const id = inp.dataset.nilaiSiswa;
    inp.value = n.nilai?.[id] ?? "";
  });
  el("btnBatalEditNilai").hidden = false;
  el("page-nilai").scrollIntoView({ behavior: "smooth" });
}

async function hapusNilai(nilaiId) {
  if (!confirm("Hapus data penilaian ini?")) return;
  showLoading(true);
  await deleteDoc(doc(nilaiCol(activeKelasId), nilaiId));
  showLoading(false);
  if (editingNilaiId === nilaiId) batalEditNilai();
  muatRiwayatNilai();
}

// ================================================
// CATATAN
// ================================================
function renderCatatanSiswaSelect() {
  const sel = el("catatanSiswaSelect");
  sel.innerHTML = '<option value="">— Pilih siswa —</option>' +
    siswaCache.map((s) => `<option value="${s.id}">${esc(s.nama)}</option>`).join("");
  el("catatanForm").hidden = true;
  el("catatanEmptyHint").hidden = false;
}

el("catatanSiswaSelect").addEventListener("change", async () => {
  const siswaId = el("catatanSiswaSelect").value;
  if (!siswaId) {
    el("catatanForm").hidden = true;
    el("catatanEmptyHint").hidden = false;
    return;
  }
  el("catatanForm").hidden = false;
  el("catatanEmptyHint").hidden = true;
  el("catatanTanggal").value = todayStr();
  el("catatanIsi").value = "";
  el("catatanStatus").textContent = "";
  muatCatatan(siswaId);
});

async function muatCatatan(siswaId) {
  showLoading(true);
  const snap = await getDocs(query(catatanCol(activeKelasId, siswaId), orderBy("tanggal", "desc")));
  showLoading(false);
  const tbody = el("tbodyCatatan");
  if (snap.empty) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-row">Belum ada catatan.</td></tr>';
    return;
  }
  tbody.innerHTML = snap.docs.map((d) => {
    const data = d.data();
    return `
      <tr>
        <td>${data.tanggal}</td>
        <td>${esc(data.isi)}</td>
        <td><button class="btn btn-sm btn-danger" data-hapus-catatan="${d.id}">Hapus</button></td>
      </tr>
    `;
  }).join("");
  tbody.querySelectorAll("[data-hapus-catatan]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Hapus catatan ini?")) return;
      showLoading(true);
      await deleteDoc(doc(catatanCol(activeKelasId, siswaId), b.dataset.hapusCatatan));
      showLoading(false);
      muatCatatan(siswaId);
    }));
}

el("btnTambahCatatan").addEventListener("click", async () => {
  const siswaId = el("catatanSiswaSelect").value;
  const tanggal = el("catatanTanggal").value;
  const isi = el("catatanIsi").value.trim();
  if (!siswaId) return;
  if (!tanggal || !isi) { el("catatanStatus").textContent = "Tanggal dan isi catatan wajib diisi."; return; }

  showLoading(true);
  await addDoc(catatanCol(activeKelasId, siswaId), { tanggal, isi });
  showLoading(false);
  el("catatanIsi").value = "";
  el("catatanStatus").textContent = "Catatan tersimpan.";
  muatCatatan(siswaId);
});
