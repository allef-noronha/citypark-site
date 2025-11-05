// js/tabela.js
(function () {
  'use strict';

  // URL do seu Web App (Apps Script publicado como Anyone)
  const WEBAPP_URL =
    'https://script.google.com/macros/s/AKfycbwD1zCtYAD_UMaFv9rF63QWJ-RYqZbTv5RbRSVCoUqpZB8WFnOqJAhdqCmd_kxhneewoA/exec';

  const $ = (s) => document.querySelector(s);
  const tbody = $('#tvBody');
  const stamp = $('#stamp');

  const esc = (x) =>
    String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const brMoney = (v) => {
    if (v == null || v === '') return '';
    if (String(v).trim() === '-') return '-';
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v);
  };

  const clsStatus = (s) => {
    const k = String(s || '').toLowerCase();
    if (k.includes('vend')) return 'vendido';
    if (k.includes('reserv')) return 'reservado';
    return 'disponivel';
  };

  function normalizeResponse(data) {
    if (Array.isArray(data)) {
      if (data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) return data;
      if (data.length && Array.isArray(data[0])) {
        const headers = data[0].map(String);
        return data.slice(1).map((row) => {
          const obj = {};
          headers.forEach((h, i) => (obj[h] = row[i]));
          return obj;
        });
      }
      return [];
    }
    const candidates = ['rows', 'data', 'values', 'resultado', 'result'];
    for (const key of candidates) {
      if (data && Array.isArray(data[key])) {
        const arr = data[key];
        if (arr.length && Array.isArray(arr[0])) {
          const headers = arr[0].map(String);
          return arr.slice(1).map((row) => {
            const obj = {};
            headers.forEach((h, i) => (obj[h] = row[i]));
            return obj;
          });
        }
        return arr;
      }
    }
    return [];
  }

  const pick = (obj, keys) => {
    for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
    return '';
  };

  function render(rows) {
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();

    rows.forEach((r) => {
      const unidade   = pick(r, ['UNIDADE', 'Unidade', 'unidade']);
      const tipologia = pick(r, ['TIPOLOGIA', 'Tipologia', 'tipologia']);
      const area      = pick(r, ['ÁREA', 'AREA', 'Área', 'area']);
      const preco     = pick(r, ['PREÇO À VISTA', 'PRECO À VISTA', 'Preço', 'Preco', 'preco']);
      const sinal     = pick(r, ['SINAL', 'Sinal', 'sinal']);
      const parc80    = pick(r, ['80 PARC. MENSAIS', '80 PARC MENSAIS', '80 PARC', '80 parcelas', '80 PARCELAS']);
      const inter12   = pick(r, ['12 INTERCAL. SEMESTRAIS', '12 INTERCAL SEMESTRAIS', '12 INTERCALADAS']);
      const chaves    = pick(r, ['CHAVES', 'Chaves', 'chaves']);
      const status    = pick(r, ['STATUS', 'Status', 'status']);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(unidade)}</td>
        <td>${esc(tipologia)}</td>
        <td>${esc(area)}</td>
        <td>${esc(brMoney(preco))}</td>
        <td>${esc(brMoney(sinal))}</td>
        <td>${esc(brMoney(parc80))}</td>
        <td>${esc(brMoney(inter12))}</td>
        <td>${esc(brMoney(chaves))}</td>
        <td class="status ${clsStatus(status)}">${esc(status)}</td>
      `;
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
    stamp.textContent = `Atualizado agora: ${new Date().toLocaleString('pt-BR')}`;
  }

  async function load() {
    try {
      stamp.textContent = 'Carregando dados…';
      const res = await fetch(WEBAPP_URL, { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      let data;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        const txt = await res.text();
        try { data = JSON.parse(txt); } catch { data = []; }
      }

      const rows = normalizeResponse(data);
      render(rows);
    } catch (e) {
      console.error('[tabela] erro:', e);
      stamp.textContent = 'Falha ao carregar a tabela. Tente recarregar a página.';
    }
  }

  $('#btnPrint')?.addEventListener('click', () => window.print());

  load();
})();
