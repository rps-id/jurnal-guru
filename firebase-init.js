// ================================================
// FIREBASE CONFIG
// Ganti bagian ini dengan config dari Firebase Console:
// Project Settings > General > Your apps > SDK setup and configuration
// ================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAofW28SgnD-ENyqcmJzsjqB-jyfO8HiME",
  authDomain: "jurnal-guru-15021.firebaseapp.com",
  projectId: "jurnal-guru-15021",
  storageBucket: "jurnal-guru-15021.firebasestorage.app",
  messagingSenderId: "613992565814",
  appId: "1:613992565814:web:c3ac625865f8e3d058dc97",
  measurementId: "G-29KTTP4P5W"
};

// ================================================
// INISIALISASI
// ================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ================================================
// ELEMEN HTML
// ================================================
const loginPage = document.getElementById("loginPage");
const appPage = document.getElementById("appPage");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userEmailEl = document.getElementById("userEmail");
const loginErrorEl = document.getElementById("loginError");

// ================================================
// LOGIN DENGAN GOOGLE
// ================================================
loginBtn.addEventListener("click", () => {
  loginErrorEl.textContent = "";
  signInWithPopup(auth, provider)
    .then((result) => {
      console.log("Login sukses:", result.user.email);
    })
    .catch((error) => {
      console.error("Login gagal:", error);
      loginErrorEl.textContent = "Login gagal. Coba lagi.";
    });
});

// ================================================
// LOGOUT
// ================================================
logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

// ================================================
// PANTAU STATUS LOGIN
// Otomatis jalan tiap kali halaman dibuka / status berubah
// ================================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Sudah login -> tampilkan halaman utama
    loginPage.style.display = "none";
    appPage.style.display = "block";
    userEmailEl.textContent = user.email;
  } else {
    // Belum login -> tampilkan halaman login
    loginPage.style.display = "flex";
    appPage.style.display = "none";
  }
});

// Export kalau nanti mau dipakai file lain (untuk Firestore, dll)
export { app, auth, db };
