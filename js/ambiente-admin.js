import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const adminName = document.getElementById("adminName");
const pendingProposalCount = document.getElementById("pendingProposalCount");
const logoutButton = document.getElementById("btnSairAdmin");
const toast = document.getElementById("adminToast");

let toastTimer;

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("vendas.html");
    return;
  }

  try {
    const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
    const admin = adminSnapshot.exists() ? adminSnapshot.data() : null;

    if (!admin || admin.ativo !== true || admin.tipo !== "admin") {
      window.alert("Acesso restrito a administradores ativos.");
      window.location.replace("vendas.html");
      return;
    }

    adminName.textContent = admin.nome || user.displayName || user.email || "administrador";
    document.documentElement.classList.add("page-authorized");
    await loadPendingCount();
  } catch (error) {
    console.error("[ambiente-admin] inicialização:", error);
    window.alert("Não foi possível validar o acesso administrativo. Tente novamente.");
    window.location.replace("vendas.html");
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await signOut(auth);
    window.location.replace("vendas.html");
  } catch (error) {
    console.error("[ambiente-admin] logout:", error);
    logoutButton.disabled = false;
    showToast("Não foi possível sair agora. Tente novamente.", true);
  }
});

async function loadPendingCount() {
  try {
    const snapshot = await getDocs(collection(db, "propostas"));
    const total = snapshot.docs.reduce((count, proposal) => {
      return normalizeStatus(proposal.data().statusProposta) === "reservada" ? count + 1 : count;
    }, 0);
    pendingProposalCount.textContent = String(total);
  } catch (error) {
    console.error("[ambiente-admin] contagem de propostas:", error);
    pendingProposalCount.textContent = "—";
  }
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4200);
}
