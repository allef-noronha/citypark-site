import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const form = document.getElementById("commercialSettingsForm");
const maxDiscount = document.getElementById("maxDiscount");
const maxKeys = document.getElementById("maxKeys");
const reservationDays = document.getElementById("reservationDays");
const testMode = document.getElementById("testMode");
const saveButton = document.getElementById("saveSettings");
const message = document.getElementById("settingsMessage");
const status = document.getElementById("settingsStatus");

let adminUser = null;

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

    adminUser = user;
    document.documentElement.classList.add("page-authorized");
    await loadSettings();
  } catch (error) {
    console.error("[configuracoes-comerciais] inicialização:", error);
    window.alert("Não foi possível abrir as configurações comerciais.");
    window.location.replace("painel-admin.html");
  }
});

async function loadSettings() {
  const snapshot = await getDoc(doc(db, "configuracoes", "comercial"));
  const data = snapshot.exists() ? snapshot.data() : {};

  maxDiscount.value = finiteOr(data.descontoMaximoPercentual, 15);
  maxKeys.value = finiteOr(data.alertaChavesPercentual, 60);
  reservationDays.value = integerOr(data.prazoReservaDias, 7);
  testMode.checked = data.modoEnvioTeste !== false;

  status.textContent = snapshot.exists() ? "Configuração carregada" : "Usando valores iniciais";
  status.classList.add("ready");
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "";
  message.className = "settings-message";

  const discount = Number(maxDiscount.value);
  const keys = Number(maxKeys.value);
  const days = Number(reservationDays.value);

  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    return showError("Informe uma diferença máxima entre 0% e 100%.");
  }

  if (!Number.isFinite(keys) || keys < 0 || keys > 100) {
    return showError("Informe um limite de chaves entre 0% e 100%.");
  }

  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return showError("O prazo da reserva deve ser um número inteiro entre 1 e 90 dias.");
  }

  saveButton.disabled = true;
  saveButton.textContent = "Salvando…";

  try {
    await setDoc(doc(db, "configuracoes", "comercial"), {
      descontoMaximoPercentual: discount,
      alertaChavesPercentual: keys,
      prazoReservaDias: days,
      modoEnvioTeste: testMode.checked,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: adminUser.uid
    }, { merge: true });

    message.textContent = testMode.checked
      ? "Configurações salvas. O envio permanece em modo de teste."
      : "Configurações salvas. O envio real está habilitado.";

    status.textContent = "Salvo";
    status.classList.add("ready");
  } catch (error) {
    console.error("[configuracoes-comerciais] salvamento:", error);
    showError(error.message || "Não foi possível salvar as configurações.");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Salvar configurações";
  }
});

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integerOr(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function showError(text) {
  message.textContent = text;
  message.className = "settings-message error";
}
