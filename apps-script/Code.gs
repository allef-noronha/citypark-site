const SPREADSHEET_ID = "18dPPkPvjb6HCutlX6UE-SFCXfsfeUPgoufV9xDctN5c";

const FIREBASE_PROJECT_ID = "city-park-25e9c";

const FIRESTORE_BATCH_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
  `/databases/(default)/documents:batchWrite`;

const FIRESTORE_DOCUMENT_BASE =
  `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;


// ============================================================
// WEB APP
// ============================================================

function doGet(e) {
  const resource =
    e && e.parameter
      ? e.parameter.resource
      : "";

  if (resource === "conditions") {
    return jsonOutput_(getConditions_());
  }

  if (resource === "unit") {
    const unit = e && e.parameter ? e.parameter.unit : "";
    return jsonOutput_(getTabelaVendaUnit_(unit));
  }

  return jsonOutput_(getTabelaVendas_());
}


// ============================================================
// TABELA DE VENDAS
// ============================================================

function getTabelaVendas_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName("Tabela de Vendas");

  if (!sh) {
    throw new Error('Aba "Tabela de Vendas" não encontrada.');
  }

  const values = sh.getDataRange().getValues();
  const headers = values.shift();

  return values.map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
    });

    return obj;
  });
}




// ============================================================
// UMA ÚNICA UNIDADE — evita baixar a tabela inteira no formulário
// ============================================================

function getTabelaVendaUnit_(unitValue) {
  const wanted = normalizeUnitId_(unitValue);

  if (!wanted) {
    throw new Error("Parâmetro unit não informado.");
  }

  const rows = getTabelaVendas_();
  const row = rows.find(item =>
    normalizeUnitId_(item["UNIDADE"] || item["Unidade"] || item["unidade"]) === wanted
  );

  if (!row) {
    throw new Error(`Unidade não encontrada na Tabela de Vendas: ${unitValue}`);
  }

  return row;
}

// ============================================================
// CONTRATO COMPLETO DAS CONDIÇÕES COMERCIAIS
//
// FIREBASE_CONDITIONS
// A1 Tipologia | B1 Sinal | C1 Parc. Mensais | D1 Intercaladas | E1 Chaves
// A2 Quantidade| B2 1     | C2 39            | D2 5            | E2 1
// A3...        | percentuais por tipologia
// ============================================================

function getConditions_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName("FIREBASE_CONDITIONS");

  if (!sh) {
    throw new Error('Aba "FIREBASE_CONDITIONS" não encontrada.');
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 3) {
    throw new Error('Aba "FIREBASE_CONDITIONS" não possui dados suficientes.');
  }

  const values = sh.getRange(1, 1, lastRow, 5).getValues();
  const headers = values[0].map(normalizeConditionHeader_);

  const index = {
    tipologia: findConditionColumn_(headers, ["tipologia"]),
    sinal: findConditionColumn_(headers, ["sinal"]),
    mensais: findConditionColumn_(headers, ["parcmensais", "parcelasmensais", "mensais"]),
    intercaladas: findConditionColumn_(headers, ["intercaladas", "intercaladassemestrais"]),
    chaves: findConditionColumn_(headers, ["chaves", "chavesfinanciamento"])
  };

  Object.entries(index).forEach(([name, column]) => {
    if (column < 0) {
      throw new Error(`Coluna obrigatória não encontrada em FIREBASE_CONDITIONS: ${name}`);
    }
  });

  const quantityRow = values
    .slice(1)
    .find(row => normalizeConditionHeader_(row[index.tipologia]) === "quantidade");

  if (!quantityRow) {
    throw new Error('Linha "Quantidade" não encontrada em FIREBASE_CONDITIONS.');
  }

  const quantidades = {
    sinal: integerConditionValue_(quantityRow[index.sinal], "Quantidade do sinal"),
    mensais: integerConditionValue_(quantityRow[index.mensais], "Quantidade de parcelas mensais"),
    intercaladas: integerConditionValue_(quantityRow[index.intercaladas], "Quantidade de intercaladas"),
    chaves: integerConditionValue_(quantityRow[index.chaves], "Quantidade de chaves")
  };

  const tipologias = {};

  values.slice(1).forEach(row => {
    const rawName = row[index.tipologia];
    const normalizedName = normalizeConditionHeader_(rawName);

    if (!rawName || normalizedName === "quantidade") {
      return;
    }

    const name = String(rawName).trim();

    const percentages = {
      sinal: percentageConditionValue_(row[index.sinal], `${name} / Sinal`),
      mensais: percentageConditionValue_(row[index.mensais], `${name} / Mensais`),
      intercaladas: percentageConditionValue_(row[index.intercaladas], `${name} / Intercaladas`),
      chaves: percentageConditionValue_(row[index.chaves], `${name} / Chaves`)
    };

    const total =
      percentages.sinal +
      percentages.mensais +
      percentages.intercaladas +
      percentages.chaves;

    if (Math.abs(total - 1) > 0.001) {
      throw new Error(
        `Os percentuais da tipologia "${name}" não totalizam 100%. Total encontrado: ${(total * 100).toFixed(2)}%.`
      );
    }

    tipologias[name] = percentages;
  });

  if (!Object.keys(tipologias).length) {
    throw new Error("Nenhuma tipologia válida encontrada em FIREBASE_CONDITIONS.");
  }

  // parcelasMensais/intercaladas ficam no topo por compatibilidade com tabela.js,
  // que já usa esses campos para alterar o cabeçalho 39/5 automaticamente.
  return {
    schemaVersao: 2,
    fonte: "FIREBASE_CONDITIONS",
    parcelasMensais: quantidades.mensais,
    intercaladas: quantidades.intercaladas,
    quantidades,
    tipologias,
    consultadoEm: new Date().toISOString()
  };
}


function normalizeConditionHeader_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}


function findConditionColumn_(headers, candidates) {
  return headers.findIndex(header => candidates.includes(header));
}


function integerConditionValue_(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${label} inválida em FIREBASE_CONDITIONS.`);
  }

  return number;
}


function percentageConditionValue_(value, label) {
  let number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Percentual inválido em ${label}.`);
  }

  // Aceita tanto célula percentual real (0,12) quanto eventual número 12.
  if (number > 1 && number <= 100) {
    number = number / 100;
  }

  if (number > 1) {
    throw new Error(`Percentual acima de 100% em ${label}.`);
  }

  return Math.round((number + Number.EPSILON) * 1000000) / 1000000;
}


// ============================================================
// PUBLICAÇÃO COMPLETA - AMBIENTE TESTE
// ============================================================

function publicarTodasUnidadesFirebaseTeste() {
  const inicio = new Date();

  const versaoTabela =
    Utilities.formatDate(
      inicio,
      Session.getScriptTimeZone(),
      "yyyyMMdd-HHmmss"
    );

  const conditions = getConditions_();

  const rows =
    getTabelaVendas_()
      .filter(row => row["UNIDADE"]);

  if (!rows.length) {
    throw new Error("Nenhuma unidade encontrada.");
  }

  const idsEncontrados = new Set();
  const writes = [];


  // ----------------------------------------------------------
  // CONDIÇÃO VIGENTE COMPLETA
  // ----------------------------------------------------------

  writes.push(
    buildFirestoreWrite_(
      "site_conditions_test/current",
      {
        ...conditions,
        versaoTabela,
        atualizadoEm: inicio
      }
    )
  );


  // ----------------------------------------------------------
  // UNIDADES
  // ----------------------------------------------------------

  rows.forEach((row, index) => {

    const unidade =
      String(row["UNIDADE"] || "").trim();

    if (!unidade) {
      throw new Error(
        `Linha ${index + 2}: unidade vazia.`
      );
    }

    const unidadeId = normalizeUnitId_(unidade);

    if (idsEncontrados.has(unidadeId)) {
      throw new Error(
        `Unidade duplicada encontrada: ${unidade}`
      );
    }

    idsEncontrados.add(unidadeId);

    const dadosUnidade = {
      unidade,
      tipologia: row["TIPOLOGIA"] || "",
      areaM2: numberOrNull_(row["ÁREA"]),
      precoVista: roundMoney_(row["PREÇO À VISTA"]),
      sinal: roundMoney_(row["SINAL"]),
      parcelaMensal: roundMoney_(row["PARCELA MENSAL"]),
      intercalada: roundMoney_(row["INTERCALADA"]),
      chaves: roundMoney_(row["CHAVES"]),
      imagem: row["IMAGEM"] || "",
      versaoTabela,
      atualizadoEm: inicio
    };

    writes.push(
      buildFirestoreWrite_(
        `site_units_test/${unidadeId}`,
        dadosUnidade
      )
    );
  });

  const totalGravacoes = executarBatchWrites_(writes);

  const resumo = {
    unidadesLidas: rows.length,
    unidadesPublicadas: rows.length,
    documentosGravados: totalGravacoes,
    parcelasMensais: conditions.quantidades.mensais,
    intercaladas: conditions.quantidades.intercaladas,
    tipologiasPublicadas: Object.keys(conditions.tipologias).length,
    versaoTabela,
    concluidoEm: new Date().toISOString()
  };

  Logger.log("====================================");
  Logger.log("PUBLICAÇÃO FIREBASE TESTE CONCLUÍDA");
  Logger.log("====================================");
  Logger.log(`Unidades lidas: ${resumo.unidadesLidas}`);
  Logger.log(`Unidades publicadas: ${resumo.unidadesPublicadas}`);
  Logger.log(`Parcelas mensais: ${resumo.parcelasMensais}`);
  Logger.log(`Intercaladas: ${resumo.intercaladas}`);
  Logger.log(`Tipologias publicadas: ${resumo.tipologiasPublicadas}`);
  Logger.log(`Versão: ${resumo.versaoTabela}`);

  return resumo;
}


// ============================================================
// BATCH WRITE
// ============================================================

function executarBatchWrites_(writes) {
  if (!writes.length) {
    return 0;
  }

  const token = ScriptApp.getOAuthToken();
  const tamanhoLote = 400;
  let total = 0;

  for (
    let i = 0;
    i < writes.length;
    i += tamanhoLote
  ) {
    const lote = writes.slice(i, i + tamanhoLote);

    const response =
      UrlFetchApp.fetch(
        FIRESTORE_BATCH_URL,
        {
          method: "post",
          contentType: "application/json",
          headers: {
            Authorization: `Bearer ${token}`
          },
          payload: JSON.stringify({
            writes: lote
          }),
          muteHttpExceptions: true
        }
      );

    const status = response.getResponseCode();
    const body = response.getContentText();

    if (
      status < 200 ||
      status >= 300
    ) {
      throw new Error(
        `Erro Firestore (${status}): ${body}`
      );
    }

    const resultado = JSON.parse(body);

    const erros =
      (resultado.status || [])
        .filter(item =>
          item &&
          item.code &&
          Number(item.code) !== 0
        );

    if (erros.length) {
      throw new Error(
        "Firestore retornou erros individuais: " +
        JSON.stringify(erros)
      );
    }

    total += lote.length;
  }

  return total;
}


// ============================================================
// MONTA WRITE DO FIRESTORE
// ============================================================

function buildFirestoreWrite_(documentPath, data) {
  const documentName =
    `${FIRESTORE_DOCUMENT_BASE}/${documentPath}`;

  return {
    update: {
      name: documentName,
      fields: objectToFirestoreFields_(data)
    }
  };
}


// ============================================================
// CONVERSÃO JS -> FIRESTORE
// Agora suporta mapas e arrays, necessários para o contrato completo.
// ============================================================

function objectToFirestoreFields_(obj) {
  const fields = {};

  Object.entries(obj).forEach(([key, value]) => {
    fields[key] = firestoreValue_(value);
  });

  return fields;
}


function firestoreValue_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      nullValue: null
    };
  }

  if (value instanceof Date) {
    return {
      timestampValue: value.toISOString()
    };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(firestoreValue_)
      }
    };
  }

  if (
    typeof value === "object"
  ) {
    return {
      mapValue: {
        fields: objectToFirestoreFields_(value)
      }
    };
  }

  if (
    typeof value === "boolean"
  ) {
    return {
      booleanValue: value
    };
  }

  if (
    typeof value === "number"
  ) {
    if (Number.isInteger(value)) {
      return {
        integerValue: String(value)
      };
    }

    return {
      doubleValue: value
    };
  }

  return {
    stringValue: String(value)
  };
}


// ============================================================
// UTILITÁRIOS
// ============================================================

function normalizeUnitId_(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}


function numberOrNull_(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    value === "-"
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function roundMoney_(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    value === "-"
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return (
    Math.round(
      (number + Number.EPSILON) * 100
    ) / 100
  );
}


// ============================================================
// RESPOSTA JSON DO WEB APP
// ============================================================

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
