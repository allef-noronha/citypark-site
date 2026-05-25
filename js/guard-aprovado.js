// js/guard-aprovado.js

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

function permissaoAtiva(valor) {
  if (valor === true || valor === 1) return true;
  if (typeof valor === "string") {
    return valor.trim().toLowerCase() === "true";
  }
  return false;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Você precisa fazer login para acessar esta página.");
    window.location.replace("vendas.html");
    return;
  }

  try {
    const snap = await getDoc(doc(db, "corretores", user.uid));

    if (!snap.exists()) {
      alert("Cadastro de corretor não encontrado.");
      window.location.replace("vendas.html");
      return;
    }

    const dados = snap.data();
    const aprovado = permissaoAtiva(dados.aprovado);

    if (!aprovado) {
      alert("Seu cadastro ainda está aguardando aprovação.");
      window.location.replace("vendas.html");
      return;
    }

    document.documentElement.classList.add("page-authorized");

  } catch (error) {
    console.error("[guard-aprovado] erro:", error);
    alert("Não foi possível verificar sua aprovação agora.");
    window.location.replace("vendas.html");
  }
});