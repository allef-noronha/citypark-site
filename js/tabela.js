import { db } from "./firebase.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const tbody = document.getElementById("tvBody");
const stamp = document.getElementById("stamp");
const statusFilter = document.getElementById("statusFilter");
let allRows = [];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function statusClass(value) {
  const status = normalize(value);
  if (status.includes("vend")) return "vendido";
  if (status.includes("reserv") || status.includes("aprov")) return "reservado";
  return "disponivel";
}

function statusLabel(value) {
  const status = statusClass(value);
  if (status === "vendido") return "Vendido";
  if (status === "reservado") return "Reservado";
  return "Disponível";
}

function moneyFromCents(value) {
  if (typeof value !== "number") return "-";
  return (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function render(rows) {
  tbody.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const values = row.valores || {};
    const statusNormalizado = normalize(row.status);

    const ocultarValores = statusNormalizado.includes("vendid") || statusNormalizado.includes("reservad");

    const mostrarValores = value => ocultarValores ? "-" : moneyFromCents(value);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(row.unidade)}</td>
      <td>${escapeHTML(row.tipologia)}</td>
      <td>${escapeHTML(row.areaM2)}</td>
      <td>${escapeHTML(mostrarValores(values.precoAVistaCentavos))}</td>
      <td>${escapeHTML(mostrarValores(values.sinalCentavos))}</td>
      <td>${escapeHTML(mostrarValores(values.parcelasMensaisCentavos))}</td>
      <td>${escapeHTML(mostrarValores(values.intercaladasSemestraisCentavos))}</td>
      <td>${escapeHTML(mostrarValores(values.chavesCentavos))}</td>
      <td class="status ${statusClass(row.status)}">${statusLabel(row.status)}</td>
    `;
    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);
  stamp.textContent = `Atualizado agora: ${new Date().toLocaleString("pt-BR")}`;
}

function applyFilter() {
  const selected = normalize(statusFilter?.value);
  const rows = selected
    ? allRows.filter(row => statusClass(row.status) === selected)
    : allRows;
  render(rows);
}

async function load() {
  try {
    stamp.textContent = "Carregando dados…";
    const snapshot = await getDocs(collection(db, "unidades"));
    allRows = snapshot.docs
      .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }))
      .sort((a, b) => String(a.unidade).localeCompare(String(b.unidade), "pt-BR", { numeric: true }));
    applyFilter();
  } catch (error) {
    console.error("[tabela] erro:", error);
    stamp.textContent = "Falha ao carregar a tabela. Tente recarregar a página.";
  }
}

statusFilter?.addEventListener("change", applyFilter);
document.getElementById("btnPrint")?.addEventListener("click", () => window.print());
load();
