// js/auth.js — Autenticação + UI + Dropdown + "Esqueci a senha"
// ------------------------------------------------------------------
// - Modal padrão: Login ⇄ Cadastro + "Esqueceu a senha?"
// - Dropdown quando logado: Ver conta (placeholder) e Sair
// - Ícones: fa-solid (evita sumiço na edição Free) + destaque azul logado
// - Gating: elementos com [data-require-approved] só aparecem se aprovado=true
// - Expõe window.corretorPodePropor(), window.dadosCorretor(), window.fazerLogout()
// ------------------------------------------------------------------

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";

// ------------------------------------------------------------------
// Estado em memória
// ------------------------------------------------------------------
let usuarioAtual = null;
let dadosCorretorCache = null;

// Idioma dos e-mails (reset de senha etc.)
auth.languageCode = "pt_br";

// ------------------------------------------------------------------
/** Refs de UI (presentes em vendas.html) */
// ------------------------------------------------------------------
// Botão/ícone do usuário e modal
const btnLogin    = document.getElementById("btn-login");
const loginIcon   = document.getElementById("login-icon");
const loginModal  = document.getElementById("loginModal");
const closeModal  = document.getElementById("closeModal");

// Views do modal + links
const viewLogin      = document.getElementById("authViewLogin");
const viewCadastro   = document.getElementById("authViewCadastro");
const linkToCadastro = document.getElementById("linkToCadastro");
const linkToLogin    = document.getElementById("linkToLogin");
const btnEsqueci     = document.getElementById("btnEsqueciSenha");

// Formulários
const loginForm    = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

// Dropdown logado
const userMenu    = document.getElementById("userMenu");
const btnVerConta = document.getElementById("btnVerConta");
const btnSair     = document.getElementById("btnSair");
const userGreet = document.getElementById("user-greet"); // NOVO

// Alerta de aprovação pendente (no modal de cadastro)
const alertAprovacaoPendente = document.getElementById("alertAprovacaoPendente");

// ------------------------------------------------------------------
/** Helpers de UI */
// ------------------------------------------------------------------
function toggleView(mode) {
  if (!viewLogin || !viewCadastro) return;
  if (mode === "signup") {
    viewLogin.classList.add("hidden");
    viewCadastro.classList.remove("hidden");
  } else {
    viewCadastro.classList.add("hidden");
    viewLogin.classList.remove("hidden");
  }
}
function openAuth(mode = "login") {
  toggleView(mode);
  if (loginModal) {
    loginModal.style.display = "flex";
    loginModal.setAttribute("aria-hidden", "false");
  }
}
function closeAuth() {
  if (loginModal) {
    loginModal.style.display = "none";
    loginModal.setAttribute("aria-hidden", "true");
  }
}
function toggleMenu(show) {
  if (!userMenu) return;
  if (show) {
    userMenu.classList.remove("hidden");
    userMenu.setAttribute("aria-hidden", "false");
  } else {
    userMenu.classList.add("hidden");
    userMenu.setAttribute("aria-hidden", "true");
  }
}

// Fecha modal no X
closeModal?.addEventListener("click", () => {
  closeAuth();
  toggleMenu(false);
});

// Fecha modal com ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && loginModal?.style.display === "flex") {
    closeAuth();
  }
});

// Clique fora do dropdown → fecha
document.addEventListener("click", (e) => {
  if (!userMenu || userMenu.classList.contains("hidden")) return;
  const inside =
    e.target.closest("#userMenu") ||
    e.target.closest("#btn-login") ||
    e.target.closest("#user-greet");   // <- incluir a pill aqui
  if (!inside) toggleMenu(false);
});

// Botão do usuário: abre modal (deslogado) OU dropdown (logado)
btnLogin?.addEventListener("click", () => {
  if (auth.currentUser) {
    toggleMenu(userMenu?.classList.contains("hidden"));
  } else {
    openAuth("login");
  }
});

// Links Login ⇄ Cadastro
linkToCadastro?.addEventListener("click", () => toggleView("signup"));
linkToLogin?.addEventListener("click", () => toggleView("login"));

// ------------------------------------------------------------------
/** Login */
// ------------------------------------------------------------------
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail")?.value.trim();
  const senha = document.getElementById("loginPassword")?.value || "";
  if (!email || !senha) { alert("Informe e-mail e senha."); return; }

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    closeAuth();
  } catch (err) {
    console.error("[auth] login error:", err);
    const msg =
      err.code === "auth/wrong-password" ? "Senha incorreta." :
      err.code === "auth/user-not-found" ? "E-mail não cadastrado." :
      err.code === "auth/invalid-email"  ? "E-mail inválido." :
      "Não foi possível entrar agora. Tente novamente.";
    alert(msg);
  }
});

// ------------------------------------------------------------------
/** Esqueci a senha (reset email) */
// ------------------------------------------------------------------
btnEsqueci?.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail")?.value.trim();
  if (!email) { alert("Informe seu e-mail no campo acima."); return; }

  try {
    // Se quiser definir URL de retorno, passe como 3º argumento:
    // const action = { url: location.origin + "/vendas.html", handleCodeInApp: false };
    // await sendPasswordResetEmail(auth, email, action);

    await sendPasswordResetEmail(auth, email);
    alert("Enviamos um e-mail com o link para redefinir sua senha.");
  } catch (err) {
    console.error("[auth] reset", err);
    // mensagens amigáveis (opcional)
    if (err.code === "auth/user-not-found") {
      alert("Não encontramos uma conta com esse e-mail.");
    } else if (err.code === "auth/invalid-email") {
      alert("E-mail inválido. Verifique e tente novamente.");
    } else {
      alert("Não foi possível enviar o e-mail agora. Tente novamente.");
    }
  }
});
// ------------------------------------------------------------------
/** Cadastro de corretor */
// ------------------------------------------------------------------
registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    nome:        document.getElementById("registerNome")?.value.trim(),
    cpf:         (document.getElementById("registerCpf")?.value || "").replace(/\D/g, ""),
    creci:       document.getElementById("registerCreci")?.value.trim(),
    telefone:    (document.getElementById("registerTelefone")?.value || "").replace(/\D/g, ""),
    imobiliaria: document.getElementById("registerImobiliaria")?.value.trim(),
    email:       document.getElementById("registerEmail")?.value.trim(),
    senha:       document.getElementById("registerPassword")?.value || "",
  };

  if (!payload.email || !payload.senha) {
    alert("Preencha e-mail e senha.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, payload.email, payload.senha);
    await updateProfile(cred.user, { displayName: payload.nome });

    await setDoc(doc(db, "corretores", cred.user.uid), {
      nome: payload.nome,
      cpf: payload.cpf,
      creci: payload.creci,
      telefone: payload.telefone,
      email: payload.email,
      imobiliaria: payload.imobiliaria,
      aprovado: false,
      criadoEm: serverTimestamp(),
    }, { merge: true });

    // Mensagem padrão "em análise"
    if (alertAprovacaoPendente) alertAprovacaoPendente.style.display = "block";
    setTimeout(() => {
      // Fecha modal após breve confirmação
      closeAuth();
      if (alertAprovacaoPendente) alertAprovacaoPendente.style.display = "none";
    }, 1400);

  } catch (err) {
    console.error("[auth] cadastro error:", err);
    const msg =
      err.code === "auth/email-already-in-use" ? "Este e-mail já está em uso." :
      err.code === "auth/weak-password"       ? "Senha muito curta (mínimo 6 caracteres)." :
      "Não foi possível concluir o cadastro agora.";
    alert(msg);
  }
});

// ------------------------------------------------------------------
/** Observa mudanças de autenticação (ícone/estados/gating) */
// ------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  // estado em memória
  usuarioAtual = user || null;
  dadosCorretorCache = null;

  // refs
  const alertAprovInline = document.getElementById("alert-aprov");
  const userGreet = document.getElementById("user-greet"); // pill

  // helper: gating de elementos que exigem aprovado=true
  const aplicarGating = (aprovado) => {
    document.querySelectorAll("[data-require-approved]").forEach((el) => {
      el.toggleAttribute("disabled", !aprovado);
      el.classList.toggle("hidden", !aprovado);
    });
  };

  if (user) {
    // --- buscar dados do corretor ---
    try {
      const snap = await getDoc(doc(db, "corretores", user.uid));
      dadosCorretorCache = snap.exists() ? snap.data() : null;
    } catch (e) {
      console.error("[auth] erro ao obter corretor:", e);
    }
    const aprovado = !!dadosCorretorCache?.aprovado;

    // ► marque estado no <body>
    document.body.dataset.logged = "true";
    document.body.dataset.approved = aprovado ? "true" : "false";

    // --- UI: mostrar PILL e ocultar ícone ---
    if (userGreet) {
      const base =
        dadosCorretorCache?.nome ||
        user.displayName ||
        (user.email ? user.email.split("@")[0] : "");
      const primeiroNome = (base || "").trim().split(/\s+/)[0] || "Corretor";
      const curto = primeiroNome.length > 10 ? primeiroNome.slice(0, 10) + "…" : primeiroNome;

      userGreet.textContent = `Olá, ${curto}!`;
      userGreet.title = `Olá, ${primeiroNome}!`;
      userGreet.classList.remove("hidden");
      userGreet.setAttribute("aria-expanded", "false");

      userGreet.onclick = () => {
        const mostrar = userMenu?.classList.contains("hidden");
        toggleMenu(!!mostrar);
        userGreet.setAttribute("aria-expanded", String(!!mostrar));
      };
      userGreet.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          userGreet.click();
        }
      };
    }

    // ícone some (fica só a pill)
    btnLogin?.classList.add("hidden");
    if (loginIcon) {
      loginIcon.className = "fa-solid fa-user";
      loginIcon.style.color = "inherit";
    }

    // alert + gating
    if (alertAprovInline) alertAprovInline.style.display = aprovado ? "none" : "block";
    aplicarGating(aprovado);

    // helpers globais usados em vendas.js
    window.corretorPodePropor = () => aprovado;
    window.dadosCorretor = () => dadosCorretorCache;

    // ► avisa a vendas.html que o auth mudou
    window.dispatchEvent(
      new CustomEvent("auth-changed", {
        detail: { logged: true, approved: aprovado },
      })
    );
  } else {
    // ► marque estado no <body>
    document.body.dataset.logged = "false";
    document.body.dataset.approved = "false";

    // --- deslogado: esconder pill e mostrar ícone ---
    if (userGreet) {
      userGreet.textContent = "";
      userGreet.classList.add("hidden");
      userGreet.setAttribute("aria-expanded", "false");
      userGreet.onclick = null;
      userGreet.onkeydown = null;
    }

    btnLogin?.classList.remove("hidden");
    if (loginIcon) {
      loginIcon.className = "fa-solid fa-user";
      loginIcon.style.color = "inherit";
    }

    // alert + gating reset
    if (alertAprovInline) alertAprovInline.style.display = "none";
    aplicarGating(false);

    // fecha menu, se aberto
    toggleMenu(false);

    // helpers globais
    window.corretorPodePropor = () => false;
    window.dadosCorretor = () => null;

    // ► avisa a vendas.html que o auth mudou
    window.dispatchEvent(
      new CustomEvent("auth-changed", {
        detail: { logged: false, approved: false },
      })
    );
  }
});

// ------------------------------------------------------------------
/** Dropdown: ações */
// ------------------------------------------------------------------
btnVerConta?.addEventListener("click", () => {
  alert("Em breve: página da conta com propostas, reservas e vendas.");
});
btnSair?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    toggleMenu(false);
  } catch (err) {
    console.error("[auth] logout error:", err);
    alert("Não foi possível sair agora.");
  }
});

// ------------------------------------------------------------------
/** API global (usada em vendas.js) */
// ------------------------------------------------------------------
window.corretorPodePropor = () => !!(usuarioAtual && dadosCorretorCache?.aprovado === true);
window.dadosCorretor      = () => dadosCorretorCache;
window.fazerLogout        = async () => { await signOut(auth); };

