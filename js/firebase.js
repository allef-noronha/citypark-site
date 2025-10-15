// js/firebase.js — Firebase v9+ modular (CDN ESM)
// ------------------------------------------------------------------
// Como configurar:
// 1) Preencha o objeto firebaseConfig abaixo com os dados do seu projeto.
// 2) NÃO exponha chaves sensíveis do lado do cliente além do necessário.
// 3) Este arquivo é importado como módulo via <script type="module">.
// ------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

// TODO: Cole aqui suas credenciais
export const firebaseConfig = {
  apiKey: "AIzaSyDFJ9VM2icvFAdW3SjT6ERzu8Btl9ZUvF0",
  authDomain: "city-park-25e9c.firebaseapp.com",
  projectId: "city-park-25e9c",
  storageBucket: "city-park-25e9c.firebasestorage.app",
  messagingSenderId: "926526615426",
  appId: "1:926526615426:web:c28a098f1c5191502c299b",
  measurementId: "G-4R36Z1FGV9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

console.info("Firebase inicializado (modular).");
