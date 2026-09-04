// js/vendas.js — Tabela, filtros, popup e formulário (modal ou nova guia)
// ------------------------------------------------------------------
// - Card: "VER" só aparece para corretor aprovado (e pode ser ocultado para visitante via HideMode).
// - Modal: "Enviar Proposta" (só logado + aprovado + Disponível).
// - HideMode só vale para visitante (não logado):
//     "ver" | 2       -> esconde VER (visitante não vê botão)
//     "proposta" | 1  -> esconde Enviar Proposta (não tem efeito prático no visitante)
//     0               -> não esconde nada
// - Form Target: "modal" (iframe no popup) ou "newtab" (abre nova guia).
//   Pode alternar por localStorage ou por um botão opcional #btn-form-target.
// - Planta: mostra imagem simples no modal + botão "Tela cheia" com lightbox fullscreen
//   com zoom (wheel/dblclick), pan (arrastar) e pinch (touch).
// ------------------------------------------------------------------

import { db } from "./firebase.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

// ===== CONFIG =====
const CONFIG = {
  formsBase: "formulario.html",

  // 🔧 HideMode (apenas para visitante / não logado)
  ctaHideMode: 2, // "ver"|2 = esconde VER; "proposta"|1 = esconde Enviar Proposta; 0 = nada

  // 🔧 Destino do formulário: "modal" (iframe) ou "newtab" (nova guia)
  formsTarget: "newtab",
};

// Overrides via localStorage (sem redeploy)
try {
  const v1 = localStorage.getItem("ctaHideMode");
  if (v1 !== null) CONFIG.ctaHideMode = isNaN(v1) ? v1 : Number(v1);
  const v2 = localStorage.getItem("formsTarget");
  if (v2 === "modal" || v2 === "newtab") CONFIG.formsTarget = v2;
} catch {}

// ===== HELPERS DE ESTADO =====
function getHideMode() {
  const m = CONFIG.ctaHideMode;
  if (m === "ver" || m === 2) return 2;       // esconde VER (visitante)
  if (m === "proposta" || m === 1) return 1;  // esconde Enviar Proposta (visitante)
  return 0;                                   // não esconde nada
}
function isLogged() {
  return document.body?.dataset?.logged === "true" || !!window._user;
}
function isAprovado() {
  return !!(window.corretorPodePropor && window.corretorPodePropor());
}
const normaliza = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
const isDisponivel = (status) => normaliza(status).includes("disponivel");

// ===== ESTADO LOCAL =====
let listaCompleta = [];
let listaFiltrada = [];
let carregandoDados = false;

// BETA 15B Â· PROTECAO DE COTA DO FIRESTORE
const SALES_CACHE_KEY = "citypark:vendas-cache:v1";
const SALES_CACHE_TTL_MS = 2 * 60 * 1000;

// ===== UI REFS =====
const btnToggleFiltros = document.getElementById("btn-toggle-filtros");
const filtrosEl =
  document.getElementById("filtros-bar") || document.querySelector(".filtros");
const tabelaEl = document.getElementById("tabela-vendas");
const popup = document.getElementById("popup");
const popupContent = document.getElementById("popup-content");

// Filtros do formulário
const f = {
  form: document.getElementById("filtro-form"),
  unidade: document.getElementById("filtro-unidade"),
  status: document.getElementById("filtro-status"),
  tipologia: document.getElementById("filtro-tipologia"),
  valor: document.getElementById("filtro-valor"),
};

// Botão opcional para alternar destino do Forms
const btnFormTarget = document.getElementById("btn-form-target");

// ===== AUTH EVENTS =====
window.addEventListener("auth-changed", () => {
  if (carregandoDados) return;
  renderTabela((listaFiltrada && listaFiltrada.length) ? listaFiltrada : listaCompleta);
});

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  initFiltrosToggle();
  initFiltrosForm();
  initPopupEscapes();
  initFormTargetToggle();

  mostrarCarregandoDados();
  carregandoDados = true;
  const data = await fetchWebApp();
  carregandoDados = false;

  if (!data) return;
  listaCompleta = data;
  renderTabela(data);
});

// ========================================================================
// DADOS
// ========================================================================
function mostrarCarregandoDados() {
  if (!tabelaEl) return;

  tabelaEl.innerHTML = `
    <div class="loading-dados" role="status" aria-live="polite">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>Carregando dados...</span>
    </div>
  `;
}

function readSalesCache({ allowStale = false } = {}) {
  try {
    const raw = localStorage.getItem(SALES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.data)) return null;

    const age = Date.now() - Number(parsed.savedAt || 0);
    if (!allowStale && (age < 0 || age > SALES_CACHE_TTL_MS)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeSalesCache(data) {
  try {
    localStorage.setItem(SALES_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data
    }));
  } catch {
    // Modos de privacidade podem bloquear localStorage.
  }
}

async function fetchWebApp() {
  const cached = readSalesCache();
  if (cached) {
    console.info("[vendas] tabela carregada do cache local; leitura do Firestore evitada.");
    return cached;
  }

  const data = await fetchWebAppFromFirestore();
  if (Array.isArray(data)) {
    writeSalesCache(data);
    return data;
  }

  const stale = readSalesCache({ allowStale: true });
  if (stale) {
    console.warn("[vendas] usando o ultimo cache local conhecido.");
    return stale;
  }
  return data;
}
async function fetchWebAppFromFirestore() {
  try {
    const snapshot = await getDocs(collection(db, "unidades"));
    return snapshot.docs
      .map((docSnapshot) => {
        const unit = docSnapshot.data();
        const values = unit.valores || {};
        return {
          id: docSnapshot.id,
          unidade: unit.unidade || docSnapshot.id,
          preco: fromCents(values.precoAVistaCentavos),
          area: unit.areaM2,
          sinal: fromCents(values.sinalCentavos),
          parcela: fromCents(values.parcelasMensaisCentavos),
          intercalada: fromCents(values.intercaladasSemestraisCentavos),
          chaves: fromCents(values.chavesCentavos),
          status: statusLabel(unit.status),
          tipologia: unit.tipologia,
          imagem: unit.imagem
        };
      })
      .sort((a, b) => String(a.unidade).localeCompare(String(b.unidade), "pt-BR", { numeric: true }));
  } catch (err) {
    console.error("[vendas] erro ao carregar dados:", err);
    if (tabelaEl) {
      tabelaEl.innerHTML = `
        <div class="alert">
          Não foi possível carregar a Tabela de Vendas agora.
          <br>Tente recarregar a página em alguns instantes.
        </div>`;
    }
    return null;
  }
}

async function readResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();

  const text = await res.text();
  if (!text.trim()) return [];

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("A resposta do Web App nao esta em JSON valido.");
  }
}

function normalizeResponse(data) {
  if (Array.isArray(data)) {
    if (!data.length) return [];
    if (Array.isArray(data[0])) return rowsFromMatrix(data);
    if (typeof data[0] === "object") return data;
    return [];
  }

  const candidates = ["rows", "data", "values", "resultado", "result"];
  for (const key of candidates) {
    const value = data?.[key];
    if (!Array.isArray(value)) continue;
    if (value.length && Array.isArray(value[0])) return rowsFromMatrix(value);
    return value;
  }

  return [];
}

function rowsFromMatrix(matrix) {
  const headers = (matrix[0] || []).map(String);
  return matrix.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function pick(obj, keys) {
  if (!obj) return "";

  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }

  const entries = Object.entries(obj);
  const wanted = keys.map(normalizeFieldName);
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    if (wanted.includes(normalizeFieldName(key))) return value;
  }

  return "";
}

function valueOr(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : value;
}

function normalizeFieldName(value) {
  return normaliza(value).replace(/[^a-z0-9]/g, "");
}

// ========================================================================
// FILTROS
// ========================================================================
function initFiltrosToggle() {
  if (!filtrosEl || !btnToggleFiltros) return;

  setFiltrosVisivel(!filtrosEl.classList.contains("oculto"));

  btnToggleFiltros.addEventListener("click", () => {
    const aberto = btnToggleFiltros.getAttribute("aria-expanded") === "true";
    setFiltrosVisivel(!aberto);
  });

  function setFiltrosVisivel(show) {
    filtrosEl.classList.toggle("oculto", !show);
    filtrosEl.hidden = !show;
    filtrosEl.style.display = show ? "flex" : "none";
    btnToggleFiltros.setAttribute("aria-expanded", String(show));
    btnToggleFiltros.title = show ? "Ocultar filtros" : "Mostrar filtros";
  }
}

function initFiltrosForm() {
  if (!f.form) return;

  f.form.addEventListener("input", () => {
    if (carregandoDados) {
      mostrarCarregandoDados();
      return;
    }

    const unidade = (f.unidade?.value || "").toLowerCase();
    const status = (f.status?.value || "").toLowerCase();
    const tipo = (f.tipologia?.value || "").toLowerCase();
    const valorRaw = (f.valor?.value || "").trim();
    const valorLimpo = valorRaw.replace(/\./g, "").replace(",", ".");
    const valorMax = parseFloat(valorLimpo) || Infinity;

    listaFiltrada = (listaCompleta || []).filter((item) => {
      const precoNumerico =
        parseFloat(
          String(item.preco).replace(/[R$\s.]/g, "").replace(",", ".")
        ) || 0;
      return (
        String(item.unidade).toLowerCase().includes(unidade) &&
        String(item.status).toLowerCase().includes(status) &&
        String(item.tipologia).toLowerCase().includes(tipo) &&
        precoNumerico <= valorMax
      );
    });

    renderTabela(listaFiltrada);
  });
}

// ========================================================================
// RENDERIZAÇÃO DOS CARDS
// ========================================================================
function renderTabela(data = []) {
  if (!tabelaEl) return;

  tabelaEl.innerHTML = "";
  listaFiltrada = Array.isArray(data) ? data : [];

  const logged = isLogged();
  const aprovado = isAprovado();
  const mode = logged ? 0 : getHideMode(); // hide só para visitante

  if (!listaFiltrada.length) {
    tabelaEl.innerHTML = `<div class="alert">Nenhuma unidade encontrada.</div>`;
    return;
  }

  listaFiltrada.forEach((item, index) => {
    const s = normaliza(item.status);
    const statusClass = s.includes("disponivel")
      ? "status-disponivel"
      : s.includes("reservado")
      ? "status-reservado"
      : s.includes("vendido")
      ? "status-vendido"
      : "";

    const card = document.createElement("div");
    card.className = `unidade-card ${statusClass}`;
    const unidade   = esc(item.unidade);
    const tipologia = esc(item.tipologia);
    const area      = esc(item.area);
    const statusTxt = esc(item.status);
    const url       = safeURL(item.imagem);

    card.innerHTML = `
      <div class="unidade-info">
        <span><strong>Unidade:</strong> ${unidade}</span>
        <span><strong>Tipologia:</strong> ${tipologia}</span>
        <span><strong>Área:</strong> ${area}</span>
        <span class="unidade-status"><strong>Status:</strong>
          <span class="status-texto ${statusClass}">${statusTxt}</span>
        </span>
      </div>
      <div class="acoes"></div>
    `;

    const acoes = card.querySelector(".acoes");

    // ► ÚNICO CTA no card: VER (somente aprovado; no visitante ainda respeita HideMode)
    if (aprovado && mode !== 2) {
      const btnVer = document.createElement("button");
      btnVer.className = "ver-btn";
      btnVer.textContent = "VER";
      btnVer.addEventListener("click", () => mostrarDetalhes(index));

      acoes.appendChild(btnVer);
    }

    // if (mode !== 2) {
    //   const btnVer = document.createElement("button");
    //   btnVer.className = "ver-btn";
    //   btnVer.textContent = "VER";
    //   btnVer.addEventListener("click", () => mostrarDetalhes(index));
    //   acoes.appendChild(btnVer);
    // }

    tabelaEl.appendChild(card);
  });
}

// ========================================================================
// POPUP (modal) + FORM DESTINO
// ========================================================================
function initPopupEscapes() {
  popup?.addEventListener("click", (e) => {
    if (e.target === popup) fecharPopup();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popup?.style.display === "flex") fecharPopup();
  });
}
function abrirPopup() {
  if (popup) popup.style.display = "flex";
}
function fecharPopup() {
  if (popup) popup.style.display = "none";
  if (popupContent) popupContent.innerHTML = "";
}

function mostrarDetalhes(index) {
  const item = listaFiltrada[index] || listaCompleta[index];
  if (!item || !popupContent) return;

  const aprovado = isAprovado();
  const podeProposta = aprovado && isDisponivel(item.status);
  // statusNormalizado = status do item sem acentos, minúsculas e espaços extras
  const statusNormalizado = normaliza(item.status);
  // Const que esconde os valores se o status incluir "reservad" ou "vendid", cobrindo variações como "reservadO" e "vendidA" + variações.
  const ocultarValores = statusNormalizado.includes("reservad") || statusNormalizado.includes("vendid");
  const mostrarValor = (valor) => {
    return ocultarValores ? "-" : brl(valor);
  }

  popupContent.innerHTML = `
    <h2>Condições - Unidade ${item.unidade}</h2>
    <p><strong>Preço à vista:</strong> ${mostrarValor(item.preco)}</p>
    <p><strong>Sinal:</strong> ${mostrarValor(item.sinal)}</p>
    <p><strong>Parcelas mensais:</strong> ${mostrarValor(item.parcela)}</p>
    <p><strong>Intercaladas semestrais:</strong> ${mostrarValor(item.intercalada)}</p>
    <p><strong>Chaves:</strong> ${mostrarValor(item.chaves)}</p>

    <div class="popup-botoes">
      ${podeProposta ? `<button class="ver-btn" data-action="propor" data-unidade="${encodeURIComponent(item.unidade)}">Enviar Proposta <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.8em; margin-left: 2px;" aria-hidden="true"></i></button>` : ""}
      ${item.imagem && item.imagem !== "-" ? `<button class="ver-btn" data-action="planta" data-imagem="${encodeURIComponent(item.imagem)}">Planta</button>` : ""}
      <button class="ver-btn" data-action="fechar">Fechar</button>
    </div>
  `;

  popupContent.querySelectorAll("button.ver-btn").forEach((btn) => {
    const action = btn.dataset.action;
    if (action === "fechar") {
      btn.addEventListener("click", fecharPopup);
    } else if (action === "planta") {
      const src = btn.dataset.imagem || "";
      btn.addEventListener("click", () => mostrarPlanta(src));
    } else if (action === "propor") {
      const unidade = decodeURIComponent(btn.dataset.unidade || "");
      btn.addEventListener("click", () => enviarProposta(unidade));
    }
  });

  abrirPopup();
}

// ===== Planta no modal (simples) + botão "Tela cheia" =====
function mostrarPlanta(imgNameOrUrl) {
  const content = popupContent;
  if (!content) return;

  // resolve caminho
  let url = (imgNameOrUrl || "").trim();
  try { url = decodeURIComponent(url.replace(/^['"]|['"]$/g, "")); } catch {}
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/") && !url.startsWith("img/")) {
    url = "img/" + url; // ajuste se suas plantas estiverem em outra pasta
  }

  content.innerHTML = `
    <h2>Planta da Unidade</h2>
    <img src="${url}" alt="Planta" class="planta-popup" />
    <div class="popup-botoes">
      <button class="ver-btn" data-action="fs">Tela cheia</button>
      <button class="ver-btn" data-action="fechar">Fechar</button>
    </div>
  `;

  content.querySelector('[data-action="fechar"]')?.addEventListener('click', fecharPopup);
  content.querySelector('[data-action="fs"]')?.addEventListener('click', () => abrirPlantaFullscreen(url));

  abrirPopup();
}

// ===== Lightbox fullscreen com zoom/pinch =====
function abrirPlantaFullscreen(url) {
  let fs = document.getElementById("fsLightbox");
  if (!fs) {
    fs = document.createElement("div");
    fs.id = "fsLightbox";
    fs.className = "fsbox";
    fs.innerHTML = `
      <div class="fsbox-head">
        <div class="fsbox-title">Planta</div>
        <button class="fsbox-close" aria-label="Fechar" title="Fechar">&times;</button>
      </div>
      <div class="fsstage-wrap">
        <div class="fsstage" id="fsStage">
          <img class="fsimg" id="fsImg" alt="Planta">
        </div>
        <div class="fscontrols">
          <button class="fsbtn" id="fsZoomOut">–</button>
          <button class="fsbtn" id="fsZoomReset">100%</button>
          <button class="fsbtn" id="fsZoomIn">+</button>
        </div>
      </div>`;
    document.body.appendChild(fs);

    fs.querySelector(".fsbox-close")?.addEventListener("click", () => {
      fs.classList.remove("open");
      if (fs._onResize) window.removeEventListener("resize", fs._onResize);
      fs._onResize = null;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fs.querySelector(".fsbox-close")?.click();
    });
  }

  const imgEl = fs.querySelector("#fsImg");
  const stage = fs.querySelector("#fsStage");

  imgEl.onload = () => {
    const api = enableZoom(stage, imgEl);
    // entra ajustado e centralizado
    api.fitToStage();
    // refaz ajuste ao redimensionar a janela
    const onResize = () => stage.dispatchEvent(new CustomEvent("zoom-fit"));
    window.addEventListener("resize", onResize, { passive: true });
    fs._onResize = onResize;

    // botões
    fs.querySelector("#fsZoomIn")?.addEventListener("click", () =>
      stage.dispatchEvent(new CustomEvent("zoom-step", { detail: { dir: 1 } }))
    );
    fs.querySelector("#fsZoomOut")?.addEventListener("click", () =>
      stage.dispatchEvent(new CustomEvent("zoom-step", { detail: { dir: -1 } }))
    );
    fs.querySelector("#fsZoomReset")?.addEventListener("click", () =>
      stage.dispatchEvent(new CustomEvent("zoom-reset"))
    );
  };

  imgEl.src = url;
  fs.classList.add("open");
}

/**
 * enableZoom(stageEl, imgEl)
 *  - mouse wheel: zoom incremental centralizado no cursor
 *  - duplo clique: alterna zoom 1x -> 2x (ou reseta)
 *  - arrastar: pan
 *  - pinch (touch): zoom com dois dedos, com centro no meio do gesto
 */
function enableZoom(stageEl, imgEl) {
  const MIN_Z = 0.2;
  const MAX_Z = 4;
  const STEP  = 0.2;

  let scale = 1;
  let panX = 0, panY = 0;
  let baseFit = 1;

  let dragging = false, lastPt = null;
  let tracking = false, lastDist = 0;

  imgEl.addEventListener("dragstart", e => e.preventDefault());
  imgEl.style.willChange = "transform";

  function apply() {
    imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }

  function fitToStage() {
    const r = stageEl.getBoundingClientRect();
    const w = imgEl.naturalWidth  || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    if (!w || !h) return;

    baseFit = Math.min(r.width / w, r.height / h);
    baseFit = Math.min(MAX_Z, Math.max(MIN_Z, baseFit));

    scale = baseFit;
    const cw = w * scale, ch = h * scale;
    panX = (r.width  - cw) / 2;
    panY = (r.height - ch) / 2;
    apply();
  }

  function clampPan() {
    const r = stageEl.getBoundingClientRect();
    const w = imgEl.naturalWidth  || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    if (!w || !h) return;

    const cw = w * scale, ch = h * scale;

    // Se a imagem coube no eixo, centraliza e “trava” o pan nesse eixo
    if (cw <= r.width) {
      panX = (r.width - cw) / 2;
    } else {
      const margin = 30;
      const minX = r.width - cw - margin;
      const maxX = margin;
      panX = Math.max(minX, Math.min(maxX, panX));
    }
    if (ch <= r.height) {
      panY = (r.height - ch) / 2;
    } else {
      const margin = 30;
      const minY = r.height - ch - margin;
      const maxY = margin;
      panY = Math.max(minY, Math.min(maxY, panY));
    }
  }

  // cx, cy nas COORDENADAS DO STAGE (não da janela!)
  function zoomAt(factor, cx, cy) {
    const prev = scale;
    const next = Math.max(MIN_Z, Math.min(MAX_Z, prev * factor));
    if (next === prev) return;

    // mantém o ponto (cx,cy) sob o cursor
    // Fórmula: pan' = (1 - k)*c + k*pan
    const k = next / prev;
    panX = (1 - k) * cx + k * panX;
    panY = (1 - k) * cy + k * panY;

    scale = next;
    clampPan();
    apply();
  }

  function stepZoom(dir, center) {
    const r = stageEl.getBoundingClientRect();
    const c = center || { x: r.width / 2, y: r.height / 2 };
    const factor = dir > 0 ? (1 + STEP) : (1 - STEP);
    zoomAt(factor, c.x, c.y);
  }

  function resetToFit() {
    fitToStage(); // usa baseFit e centraliza
  }

  // Wheel: usa ponto do mouse como foco (coords do stage)
  stageEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    stepZoom(e.deltaY < 0 ? 1 : -1, { x: cx, y: cy });
  }, { passive: false });

  // Duplo clique: baseFit ↔ 2x no ponto
  stageEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const target = scale <= baseFit * 1.05 ? Math.min(2, MAX_Z) : baseFit;
    zoomAt(target / scale, cx, cy);
  });

  // Pan (mouse)
  stageEl.addEventListener("mousedown", (e) => {
    dragging = true;
    lastPt = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastPt.x;
    const dy = e.clientY - lastPt.y;
    lastPt = { x: e.clientX, y: e.clientY };
    panX += dx; panY += dy;
    clampPan(); apply();
  });
  window.addEventListener("mouseup", () => { dragging = false; });

  // Touch: pinch + pan
  stageEl.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      dragging = true;
      lastPt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      tracking = true;
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  stageEl.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const r = stageEl.getBoundingClientRect();

    if (tracking && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top
      };
      const factor = dist / (lastDist || dist);
      zoomAt(factor, mid.x, mid.y);
      lastDist = dist;
      return;
    }

    if (dragging && e.touches.length === 1) {
      const { clientX, clientY } = e.touches[0];
      const dx = clientX - lastPt.x;
      const dy = clientY - lastPt.y;
      lastPt = { x: clientX, y: clientY };
      panX += dx; panY += dy;
      clampPan(); apply();
    }
  }, { passive: false });

  window.addEventListener("touchend", () => {
    tracking = false; dragging = false; lastPt = null;
  });

  // Hooks externos
  stageEl.addEventListener("zoom-step", (e) => {
    const dir = e.detail?.dir || 1;
    stepZoom(dir);
  });
  stageEl.addEventListener("zoom-reset", resetToFit);
  stageEl.addEventListener("zoom-fit",   resetToFit);

  // primeira aplicação
  fitToStage();

  // expõe API opcional
  return { fitToStage: resetToFit, reset: resetToFit };
}

// ========================================================================
/** ENVIAR PROPOSTA — abre no MODAL (iframe) ou em NOVA GUIA */
// ========================================================================
function enviarProposta(unidade) {
  if (!(window.corretorPodePropor && window.corretorPodePropor())) {
    alert("Faça login e aguarde aprovação para enviar propostas.");
    return;
  }
  const p = new URLSearchParams();
  p.set("unidade", unidade || "");

  // O fragmento permanece no navegador mesmo quando o servidor aplica URL limpa
  // (ex.: formulario.html -> /formulario).
  const url = `${CONFIG.formsBase}#${p.toString()}`;

  if (CONFIG.formsTarget === "newtab") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  if (!popupContent) return;
  popupContent.innerHTML = `
    <h2>Solicitação de Proposta - Unidade ${unidade}</h2>
    <iframe class="forms-iframe" src="${url}" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="popup-botoes"><button class="ver-btn" data-action="fechar">Fechar</button></div>
  `;
  popupContent.querySelector('[data-action="fechar"]')?.addEventListener("click", fecharPopup);
  abrirPopup();
}

// ========================================================================
// FORM TARGET TOGGLE (opcional: precisa do botão #btn-form-target no HTML)
// ========================================================================
function initFormTargetToggle() {
  if (!btnFormTarget) return;
  applyFormTargetLabel();

  btnFormTarget.addEventListener("click", () => {
    CONFIG.formsTarget = CONFIG.formsTarget === "modal" ? "newtab" : "modal";
    try { localStorage.setItem("formsTarget", CONFIG.formsTarget); } catch {}
    applyFormTargetLabel();
  });

  function applyFormTargetLabel() {
    const modo = CONFIG.formsTarget === "modal" ? "No site" : "Nova guia";
    btnFormTarget.textContent = `Formulário: ${modo}`;
    btnFormTarget.title =
      CONFIG.formsTarget === "modal"
        ? "Abrir o formulário dentro do site"
        : "Abrir o formulário em nova guia";
    btnFormTarget.setAttribute("aria-pressed", CONFIG.formsTarget === "modal" ? "false" : "true");
  }
}

// ========================================================================
// UTIL
// ========================================================================
function brl(v) {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  if (!s || s === "-") return "-";
  if (s.startsWith("R$")) return s;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (isNaN(n)) return s;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fromCents(value) {
  return typeof value === "number" ? value / 100 : null;
}

function statusLabel(value) {
  const status = normaliza(value);
  if (status.includes("dispon")) return "Disponível";
  if (status.includes("reserv") || status.includes("aprov")) return "Reservado";
  if (status.includes("vend")) return "Vendido";
  return value || "Não informado";
}

// ADICIONE perto dos “UTIL”
function esc(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;')
    .replaceAll('`','&#96;');
}
// URL segura (só http/https)
function safeURL(u) {
  try {
    const url = new URL(u, location.href);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
  } catch { return ''; }
}
