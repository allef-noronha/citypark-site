import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where, limit, orderBy, startAfter, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const elements = {
  logout: $("btnSairAdmin"),
  refresh: $("refreshProposals"),
  search: $("proposalSearch"),
  filter: $("proposalStatusFilter"),
  loading: $("proposalLoading"),
  tableWrap: $("proposalTableWrap"),
  rows: $("proposalRows"),
  empty: $("proposalEmpty"),
  pendingCount: $("pendingCount"),
  approvedCount: $("approvedCount"),
  closedCount: $("closedCount"),
  inactiveCount: $("inactiveCount"),
  more: $("loadMoreProposals"), updatedAt: $("proposalLastUpdated"),
  toast: $("adminToast")
};

const state = {
  proposals: [], cursor: null, hasMore: false, loading: false, generation: 0,
  brokers: new Map(),
  units: new Map(),
  authorized: false,
  initialized: false,
  toastTimer: null
};

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

    state.authorized = true;
    document.documentElement.classList.add("page-authorized");
    bindEvents();
    await loadProposals();
  } catch (error) {
    console.error("[gestao-propostas] inicialização:", error);
    if (!state.authorized) {
      window.alert("Não foi possível validar o acesso administrativo. Tente novamente.");
      window.location.replace("vendas.html");
      return;
    }
    elements.loading.textContent = "Não foi possível carregar as propostas.";
    showToast(error.message || "Erro ao carregar propostas.", true);
  }
});

function bindEvents() {
  if (state.initialized) return;
  state.initialized = true;
  elements.search.addEventListener("input", renderRows);
  elements.filter.addEventListener("change", () => loadProposals());
  elements.refresh.addEventListener("click", () => loadProposals());
  elements.more.addEventListener("click", () => loadProposals(true));
  elements.rows.addEventListener("click", event => {
    const link = event.target.closest("[data-proposal-id]");
    if (link) {
      try { sessionStorage.setItem("cityparkAdminProposalId", link.dataset.proposalId); } catch { /* O ID continua presente na URL. */ }
    }
  });
  elements.logout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("vendas.html");
  });
}

function proposalQueryForFilter(filter) {
  const proposals = collection(db, "propostas");
  if (filter === "pending") return query(proposals, where("statusProposta", "==", "reservada"));
  if (filter === "approved") return query(proposals, where("statusProposta", "==", "aprovada"));
  if (filter === "closed") return query(proposals, where("statusProposta", "==", "vendida"));
  if (filter === "inactive") {
    return query(
      proposals,
      where("statusProposta", "in", ["recusada", "cancelada", "expirada", "distratada", "teste_invalidado"])
    );
  }
  return proposals;
}

async function loadProposals(append = false) {
  if (append && state.loading) return;
  const generation = ++state.generation;
  state.loading = true;
  elements.more.disabled = true;
  elements.refresh.disabled = true;
  elements.loading.hidden = false;
  elements.tableWrap.hidden = true;
  elements.empty.hidden = true;

  try {
    const constraints = [orderBy("criadoEm", "desc"), limit(25)];
    if (append && state.cursor) constraints.push(startAfter(state.cursor));
    const proposalSnapshot = await getDocs(query(proposalQueryForFilter(elements.filter.value), ...constraints));
    if (generation !== state.generation) return;
    state.cursor = proposalSnapshot.docs.at(-1) || null;
    state.hasMore = proposalSnapshot.size === 25;
    const page = proposalSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => dateValue(b.criadoEm) - dateValue(a.criadoEm));

    state.proposals = append ? [...state.proposals, ...page] : page;

    // BETA 15A · REDUÇÃO DE LEITURAS
    // Propostas novas ja carregam corretorSnapshot e unidadeSnapshot.
    // Para propostas legadas, buscamos SOMENTE os IDs ausentes, em vez de baixar
    // as colecoes inteiras de corretores e unidades (~300 documentos cada).
    const missingBrokerIds = [...new Set(
      state.proposals
        .filter(proposal => proposal.corretorId && !proposal.corretorSnapshot && !state.brokers.has(proposal.corretorId))
        .map(proposal => proposal.corretorId)
    )];
    const missingUnitIds = [...new Set(
      state.proposals
        .filter(proposal => proposal.unidadeId && !proposal.unidadeSnapshot && !state.units.has(proposal.unidadeId))
        .map(proposal => proposal.unidadeId)
    )];

    const [brokerDocs, unitDocs] = await Promise.all([
      Promise.all(missingBrokerIds.map(id => getDoc(doc(db, "corretores", id)))),
      Promise.all(missingUnitIds.map(id => getDoc(doc(db, "unidades", id))))
    ]);

    if (generation !== state.generation) return;
    state.brokers = new Map([ ...state.brokers, ...brokerDocs
        .filter(snapshot => snapshot.exists())
        .map(snapshot => [snapshot.id, { id: snapshot.id, ...snapshot.data() }])
    ]);
    state.units = new Map([ ...state.units, ...unitDocs
        .filter(snapshot => snapshot.exists())
        .map(snapshot => [snapshot.id, { id: snapshot.id, ...snapshot.data() }])
    ]);
    if (!append) await renderSummary();
    if (generation !== state.generation) return;
    elements.updatedAt.textContent = `Atualizado em: ${formatDate(new Date())}`;
    elements.more.hidden = !state.hasMore;
    renderRows();
  } catch (error) {
    if (generation !== state.generation) return;
    console.error("[gestao-propostas] carregamento:", error);
    elements.loading.textContent = "Não foi possível carregar as propostas.";
    showToast("Falha ao atualizar a lista de propostas.", true);
  } finally {
    if (generation === state.generation) { state.loading = false; elements.refresh.disabled = false; elements.more.disabled = false; }
  }
}

async function renderSummary() {
  const groups = ["pending", "approved", "closed", "inactive"];
  const results = await Promise.allSettled(groups.map(group => getCountFromServer(proposalQueryForFilter(group))));
  results.forEach((result,index) => { elements[groups[index] + "Count"].textContent = result.status === "fulfilled" ? String(result.value.data().count) : "—"; });
}

function renderRows() {
  const filter = elements.filter.value;
  const search = normalizeText(elements.search.value);
  const visible = state.proposals.filter(proposal => {
    const groupMatches = filter === "all" || statusGroup(proposal.statusProposta) === filter;
    return groupMatches && (!search || proposalSearchText(proposal).includes(search));
  });

  elements.loading.hidden = true;
  elements.empty.hidden = visible.length > 0;
  elements.tableWrap.hidden = visible.length === 0;
  elements.rows.innerHTML = visible.map(renderProposalRow).join("");
}

function renderProposalRow(proposal) {
  const broker = brokerData(proposal);
  const client = proposal.cliente || {};
  const unit = unitData(proposal);
  const group = statusGroup(proposal.statusProposta);
  const clientDocument = client.cpf || client.cnpj;
  const brokerage = broker.imobiliaria || broker.razaoSocial || "Não informada";

  return `
    <tr>
      <td>
        <span class="cell-title proposal-id">${escapeHtml(proposal.id)}</span>
        <span class="cell-line">Abertura: ${escapeHtml(formatDate(proposal.criadoEm))}</span>
      </td>
      <td>
        <span class="cell-title">${escapeHtml(broker.nome || "Corretor não informado")}</span>
        <span class="cell-line">CRECI: ${escapeHtml(broker.creci || "—")}</span>
        <span class="cell-line">Cliente: ${escapeHtml(clientName(client))}</span>
        <span class="cell-line">CPF/CNPJ: ${escapeHtml(formatCpfCnpj(clientDocument))}</span>
      </td>
      <td>
        <span class="cell-title">Unidade ${escapeHtml(unit.unidade || proposal.unidadeId || "—")}</span>
        <span class="cell-line">${escapeHtml(unit.tipologia || "Tipologia não informada")}</span>
        <span class="cell-line">${escapeHtml(formatArea(unit.areaM2))}</span>
      </td>
      <td><span class="cell-title">${escapeHtml(brokerage)}</span></td>
      <td><span class="status-badge" data-group="${group}">${escapeHtml(statusLabel(proposal.statusProposta))}</span></td>
      <td><a class="open-button" data-proposal-id="${escapeHtml(proposal.id)}" href="detalhes-proposta.html?id=${encodeURIComponent(proposal.id)}">Abrir</a><span class="expiry-line">${escapeHtml(proposalExpiryLabel(proposal))}</span></td>
    </tr>`;
}

function proposalSearchText(proposal) {
  const broker = brokerData(proposal);
  const client = proposal.cliente || {};
  const unit = unitData(proposal);
  return normalizeText([
    proposal.id, proposal.statusProposta, broker.nome, broker.creci, broker.imobiliaria,
    client.nomeCompleto, client.razaoSocial, client.cpf, client.cnpj,
    unit.unidade, unit.tipologia, proposal.unidadeId
  ].filter(Boolean).join(" "));
}

function brokerData(proposal) {
  return { ...(state.brokers.get(proposal.corretorId) || {}), ...(proposal.corretorSnapshot || {}) };
}

function unitData(proposal) {
  return { ...(state.units.get(proposal.unidadeId) || {}), ...(proposal.unidadeSnapshot || {}) };
}

function statusGroup(value) {
  const status = normalizeStatus(value);
  if (["reservada", "pendente", "em_analise", "em análise"].includes(status)) return "pending";
  if (["aprovada", "aprovado"].includes(status)) return "approved";
  if (["vendida", "vendido", "encerrada", "encerrado"].includes(status)) return "closed";
  return "inactive";
}

function statusLabel(value) {
  const status = normalizeStatus(value);
  const labels = {
    reservada: "Pendente para análise",
    pendente: "Pendente para análise",
    aprovada: "Proposta aprovada",
    vendida: "Proposta encerrada",
    recusada: "Proposta recusada",
    cancelada: "Proposta cancelada",
    expirada: "Proposta expirada",
    distratada: "Proposta distratada",
    teste_invalidado: "Teste invalidado",
    inativa: "Proposta inativa"
  };
  return labels[status] || value || "Situação não informada";
}

function clientName(client) {
  return client.nomeCompleto || client.razaoSocial || client.nome || "Cliente não informado";
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function proposalExpiryLabel(proposal) {
  if (statusGroup(proposal.statusProposta) !== "pending") return "Sem prazo ativo";
  const expiry = toDate(proposal.expiraEm);
  if (!expiry) return "Prazo não informado";
  return expiry.getTime() <= Date.now() ? "Prazo encerrado" : `Reserva até ${formatDate(expiry)}`;
}

function formatArea(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`
    : "Área não informada";
}

function formatCpfCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value || "—";
}

function normalizeStatus(value) { return String(value || "").trim().toLowerCase(); }
function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function dateValue(value) { return toDate(value)?.getTime() || 0; }
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("visible");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 4200);
}
