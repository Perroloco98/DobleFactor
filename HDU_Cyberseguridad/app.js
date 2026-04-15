const state = {
  user: null,
  profile: null,
  sessionActive: false,
  mfaEnabled: false,
  contacts: { sms: "", email: "", authenticator: "" },
  verified: { sms: false, email: false, authenticator: false },
  selectedMethod: null,
  otpCode: null,
  otpExpiresAt: null,
  failedAttempts: 0,
  lockUntil: null,
  otpTimer: null,
  lockTimer: null,
};

const REQUIRED_METHODS = 2;
const MAX_ATTEMPTS = 3;
const LOCK_MS = 10 * 60 * 1000;
const OTP_TTL_MS = 60 * 1000;

const screens = {
  login: document.getElementById("screen-login"),
  setup: document.getElementById("screen-mfa-setup"),
  methodSelect: document.getElementById("screen-method-select"),
  challenge: document.getElementById("screen-mfa-challenge"),
  locked: document.getElementById("screen-locked"),
  dashboard: document.getElementById("screen-dashboard"),
};

const stepperEl = document.getElementById("stepper");
const messagesEl = document.getElementById("messages");
const loginForm = document.getElementById("login-form");
const setupForm = document.getElementById("setup-form");
const otpForm = document.getElementById("otp-form");
const resendOtpBtn = document.getElementById("resend-otp");
const changeMethodBtn = document.getElementById("change-method");
const logoutBtn = document.getElementById("logout-btn");
const securityForm = document.getElementById("security-form");
const mfaEnabledInput = document.getElementById("mfa-enabled");
const securityMethodInputs = Array.from(document.querySelectorAll(".security-method"));
const otpSecondsEl = document.getElementById("otp-seconds");
const attemptsLeftEl = document.getElementById("attempts-left");
const challengeMethodEl = document.getElementById("challenge-method");
const otpDebugEl = document.getElementById("otp-debug");
const mfaStatusLabel = document.getElementById("mfa-status-label");
const verifiedSummaryEl = document.getElementById("verified-summary");
const saveMfaBtn = document.getElementById("save-mfa");
const methodOptionsEl = document.getElementById("method-options");
const continueChallengeBtn = document.getElementById("continue-challenge");
const lockSecondsEl = document.getElementById("lock-seconds");
const lockBackBtn = document.getElementById("lock-back");
const reconfigureBtn = document.getElementById("reconfigure-btn");
const sidebarEl = document.getElementById("sidebar");
const sessionBarEl = document.getElementById("session-bar");
const lastLoginEl = document.getElementById("last-login");
const sidebarUserNameEl = document.getElementById("sidebar-user-name");
const avatarInitialsEl = document.getElementById("avatar-initials");
const sidebarLogoutBtn = document.getElementById("sidebar-logout");

const STEP_BY_SCREEN = {
  login: "credentials",
  setup: "method",
  methodSelect: "method",
  challenge: "verify",
};

const METHOD_LABELS = {
  sms: "Mensaje de texto (SMS)",
  email: "Correo electrónico",
  authenticator: "Aplicación Authenticator",
};

function methodLabel(key) {
  return METHOD_LABELS[key] ?? key;
}

function showScreen(target) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[target].classList.add("active");
  updateStepper(target);
  updateAuthenticatedChrome(target);
}

function updateAuthenticatedChrome(target) {
  const authed = target === "dashboard";
  sidebarEl.hidden = !authed;
  sessionBarEl.hidden = !authed;
  if (authed) {
    sidebarUserNameEl.textContent = displayName(state.user);
    avatarInitialsEl.textContent = initialsOf(state.user);
    lastLoginEl.textContent = formatNow();
  }
}

function displayName(user) {
  if (!user) return "Usuario";
  const base = user.split("@")[0].replace(/[._-]+/g, " ").trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase()) || "Usuario";
}

function initialsOf(user) {
  const name = displayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatNow() {
  const now = new Date();
  const d = now.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const t = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${d} a las ${t}`;
}

function updateStepper(target) {
  const step = STEP_BY_SCREEN[target];
  if (!step) {
    stepperEl.classList.add("hidden");
    return;
  }
  stepperEl.classList.remove("hidden");
  stepperEl.querySelectorAll("li").forEach((li) => {
    li.classList.remove("active", "done");
    const s = li.dataset.step;
    if (s === step) li.classList.add("active");
    if (stepOrder(s) < stepOrder(step)) li.classList.add("done");
  });
}

function stepOrder(step) {
  return { credentials: 0, method: 1, verify: 2 }[step] ?? -1;
}

function notify(message, type = "info") {
  const el = document.createElement("div");
  el.className = `message ${type}`;
  el.textContent = message;
  messagesEl.prepend(el);
  window.setTimeout(() => el.remove(), 4500);
}

function setFieldError(name, message) {
  const el = document.querySelector(`[data-error-for="${name}"]`);
  const input = document.getElementById(name);
  if (el) el.textContent = message ?? "";
  if (input) input.classList.toggle("has-error", Boolean(message));
}

function clearFieldErrors(container) {
  container.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  container.querySelectorAll("input, select").forEach((el) => el.classList.remove("has-error"));
}

function randomOtp() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return /^\+?\d[\d\s-]{6,}$/.test(value);
}

function verifiedCount() {
  return Object.values(state.verified).filter(Boolean).length;
}

function refreshSetupSummary() {
  const count = verifiedCount();
  verifiedSummaryEl.textContent = `Métodos verificados: ${count} / ${REQUIRED_METHODS} requeridos`;
  saveMfaBtn.disabled = count < REQUIRED_METHODS;
  Object.entries(state.verified).forEach(([method, ok]) => {
    const statusEl = document.querySelector(`[data-status-for="${method}"]`);
    if (!statusEl) return;
    statusEl.textContent = ok ? "Verificado" : "Pendiente";
    statusEl.classList.toggle("ok", ok);
  });
}

function getContactFor(method) {
  if (method === "sms") return document.getElementById("sms-phone").value.trim();
  if (method === "email") return document.getElementById("email-address").value.trim();
  return document.getElementById("totp-secret").textContent.trim();
}

function validateContactFor(method) {
  const value = getContactFor(method);
  if (method === "sms") {
    if (!validPhone(value)) {
      setFieldError("sms-phone", "Ingresa un número válido (mínimo 7 dígitos).");
      return null;
    }
    setFieldError("sms-phone", "");
    return value;
  }
  if (method === "email") {
    if (!validEmail(value)) {
      setFieldError("email-address", "Ingresa un correo válido.");
      return null;
    }
    setFieldError("email-address", "");
    return value;
  }
  return value;
}

function channelDescription(method, contact) {
  if (method === "sms") return `SMS al ${contact}`;
  if (method === "email") return `correo ${contact}`;
  return "aplicación Authenticator";
}

function askSetupOtp(method, contact) {
  const otp = randomOtp();
  const prompt = `Código enviado a ${channelDescription(method, contact)}.\n\n(DEMO) Código: ${otp}\n\nIngrésalo aquí para verificar:`;
  const input = window.prompt(prompt, "");
  if (input === null) return false;
  if (input.trim() !== otp) {
    notify(`Código incorrecto. No se verificó ${methodLabel(method)}.`, "error");
    return false;
  }
  return true;
}

function handleVerifyClick(event) {
  const btn = event.target.closest(".btn-verify");
  if (!btn) return;
  const method = btn.dataset.verify;
  const contact = validateContactFor(method);
  if (!contact) return;
  state.contacts[method] = contact;

  if (askSetupOtp(method, contact)) {
    state.verified[method] = true;
    notify(`${methodLabel(method)} verificado correctamente.`, "success");
    refreshSetupSummary();
  }
}

function renderMethodOptions() {
  while (methodOptionsEl.firstChild) methodOptionsEl.removeChild(methodOptionsEl.firstChild);

  const available = Object.keys(state.verified).filter((m) => state.verified[m]);
  available.forEach((method) => {
    const label = document.createElement("label");
    label.className = "method-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "challenge-method";
    input.id = `opt-${method}`;
    input.value = method;

    const body = document.createElement("span");
    body.className = "method-option-body";

    const title = document.createElement("strong");
    title.textContent = methodLabel(method);

    const small = document.createElement("small");
    small.textContent = state.contacts[method]
      ? maskContact(method, state.contacts[method])
      : "Listo para recibir código";

    body.appendChild(title);
    body.appendChild(small);
    label.appendChild(input);
    label.appendChild(body);
    methodOptionsEl.appendChild(label);

    input.addEventListener("change", () => {
      state.selectedMethod = input.value;
      continueChallengeBtn.disabled = false;
    });
  });

  continueChallengeBtn.disabled = true;
  state.selectedMethod = null;
}

function maskContact(method, value) {
  if (method === "sms") return value.replace(/\d(?=\d{2})/g, "•");
  if (method === "email") {
    const [user, domain] = value.split("@");
    if (!domain) return value;
    const maskedUser = user.length > 2 ? user.slice(0, 2) + "•".repeat(Math.max(1, user.length - 2)) : user;
    return `${maskedUser}@${domain}`;
  }
  return "Código generado por tu app";
}

function openMfaChallenge(method) {
  state.failedAttempts = 0;
  attemptsLeftEl.textContent = `${MAX_ATTEMPTS}`;
  state.selectedMethod = method;
  challengeMethodEl.textContent = `Código enviado vía ${methodLabel(method)} (${maskContact(method, state.contacts[method] || "")}).`;
  generateOtp();
  startOtpTicker();
  showScreen("challenge");
}

function generateOtp() {
  state.otpCode = randomOtp();
  state.otpExpiresAt = Date.now() + OTP_TTL_MS;
  otpDebugEl.textContent = `OTP de prueba: ${state.otpCode}`;
}

function startOtpTicker() {
  if (state.otpTimer) window.clearInterval(state.otpTimer);
  updateOtpSeconds();
  state.otpTimer = window.setInterval(() => {
    const expired = updateOtpSeconds();
    if (expired) {
      window.clearInterval(state.otpTimer);
      notify("El OTP expiró. Solicita uno nuevo para continuar.", "error");
    }
  }, 300);
}

function updateOtpSeconds() {
  const remaining = Math.max(0, state.otpExpiresAt - Date.now());
  otpSecondsEl.textContent = `${Math.ceil(remaining / 1000)}`;
  return remaining <= 0;
}

function startLockCountdown() {
  if (state.lockTimer) window.clearInterval(state.lockTimer);
  lockBackBtn.disabled = true;
  tickLock();
  state.lockTimer = window.setInterval(tickLock, 1000);
}

function tickLock() {
  const remaining = Math.max(0, state.lockUntil - Date.now());
  lockSecondsEl.textContent = `${Math.ceil(remaining / 1000)}`;
  if (remaining <= 0) {
    window.clearInterval(state.lockTimer);
    state.lockUntil = null;
    state.failedAttempts = 0;
    lockBackBtn.disabled = false;
    notify("Bloqueo liberado. Puedes reintentar.", "info");
  }
}

function enforceLockIfNeeded() {
  if (!state.lockUntil) return false;
  if (Date.now() < state.lockUntil) {
    showScreen("locked");
    startLockCountdown();
    return true;
  }
  state.lockUntil = null;
  state.failedAttempts = 0;
  return false;
}

function refreshDashboardSecurity() {
  mfaEnabledInput.checked = state.mfaEnabled;
  securityMethodInputs.forEach((input) => {
    input.checked = Boolean(state.verified[input.value]);
  });
  if (state.mfaEnabled) {
    const methods = Object.keys(state.verified)
      .filter((m) => state.verified[m])
      .map(methodLabel)
      .join(", ");
    mfaStatusLabel.textContent = `MFA habilitado (${state.profile ?? "usuario"}) con: ${methods}`;
  } else {
    mfaStatusLabel.textContent = "MFA deshabilitado.";
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFieldErrors(loginForm);
  if (enforceLockIfNeeded()) return;

  const data = new FormData(loginForm);
  const user = data.get("username")?.toString().trim();
  const password = data.get("password")?.toString().trim();
  const profile = data.get("profile")?.toString();

  let hasError = false;
  if (!user) { setFieldError("username", "Requerido."); hasError = true; }
  if (!password) { setFieldError("password", "Requerido."); hasError = true; }
  if (hasError) return;

  state.user = user;
  state.profile = profile;

  if (!state.mfaEnabled || verifiedCount() < REQUIRED_METHODS) {
    showScreen("setup");
    refreshSetupSummary();
    notify("Debes configurar y verificar al menos 2 métodos MFA.", "info");
    return;
  }

  renderMethodOptions();
  showScreen("methodSelect");
});

setupForm.addEventListener("click", handleVerifyClick);

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (verifiedCount() < REQUIRED_METHODS) {
    notify(`Debes verificar al menos ${REQUIRED_METHODS} métodos diferentes.`, "error");
    return;
  }
  state.mfaEnabled = true;
  notify("MFA habilitado correctamente.", "success");
  renderMethodOptions();
  showScreen("methodSelect");
});

continueChallengeBtn.addEventListener("click", () => {
  if (!state.selectedMethod) return;
  openMfaChallenge(state.selectedMethod);
});

otpForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFieldErrors(otpForm);
  if (enforceLockIfNeeded()) return;

  const entered = new FormData(otpForm).get("otp-code")?.toString().trim();

  if (!entered || entered.length !== 6) {
    setFieldError("otp-code", "El código debe tener 6 dígitos.");
    return;
  }

  if (Date.now() > state.otpExpiresAt) {
    setFieldError("otp-code", "El código expiró. Solicita uno nuevo.");
    return;
  }

  if (entered === state.otpCode) {
    state.sessionActive = true;
    if (state.otpTimer) window.clearInterval(state.otpTimer);
    otpForm.reset();
    refreshDashboardSecurity();
    showScreen("dashboard");
    notify("Autenticación exitosa. Acceso concedido.", "success");
    return;
  }

  state.failedAttempts += 1;
  const remaining = Math.max(0, MAX_ATTEMPTS - state.failedAttempts);
  attemptsLeftEl.textContent = `${remaining}`;

  if (state.failedAttempts >= MAX_ATTEMPTS) {
    state.lockUntil = Date.now() + LOCK_MS;
    if (state.otpTimer) window.clearInterval(state.otpTimer);
    notify("3 OTP incorrectos. Cuenta bloqueada por 10 minutos.", "error");
    showScreen("locked");
    startLockCountdown();
    return;
  }

  setFieldError("otp-code", "Código incorrecto. Intenta nuevamente.");
});

resendOtpBtn.addEventListener("click", () => {
  if (enforceLockIfNeeded()) return;
  generateOtp();
  startOtpTicker();
  notify("Nuevo OTP generado (válido 60 segundos).", "info");
});

changeMethodBtn.addEventListener("click", () => {
  if (state.otpTimer) window.clearInterval(state.otpTimer);
  renderMethodOptions();
  showScreen("methodSelect");
});

lockBackBtn.addEventListener("click", () => {
  showScreen("login");
  loginForm.reset();
});

function handleLogout() {
  state.sessionActive = false;
  if (state.otpTimer) window.clearInterval(state.otpTimer);
  showScreen("login");
  loginForm.reset();
  notify("Sesión cerrada. Se solicitará MFA en el próximo inicio.", "info");
}

logoutBtn.addEventListener("click", handleLogout);
if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener("click", handleLogout);

reconfigureBtn.addEventListener("click", () => {
  showScreen("setup");
  refreshSetupSummary();
});

securityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const enabled = mfaEnabledInput.checked;
  const checked = securityMethodInputs.filter((i) => i.checked).map((i) => i.value);

  if (enabled && checked.length < REQUIRED_METHODS) {
    notify(`Para habilitar MFA debes tener al menos ${REQUIRED_METHODS} métodos verificados.`, "error");
    return;
  }

  const anyUnverified = checked.some((m) => !state.verified[m]);
  if (anyUnverified) {
    notify("Solo puedes activar métodos previamente verificados.", "error");
    return;
  }

  Object.keys(state.verified).forEach((m) => {
    if (!checked.includes(m)) state.verified[m] = false;
  });

  state.mfaEnabled = enabled;
  refreshDashboardSecurity();
  notify("Cambios de seguridad guardados.", "success");
});

// Dev panel — navegación directa entre pantallas
(function initDevPanel() {
  const panel = document.getElementById("devpanel");
  const toggle = document.getElementById("devpanel-toggle");
  if (!panel || !toggle) return;

  toggle.addEventListener("click", () => panel.classList.toggle("open"));

  panel.querySelectorAll("[data-dev-screen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.devScreen;
      devSeed(target);
      if (target === "challenge") {
        openMfaChallenge(state.selectedMethod || "email");
      } else if (target === "methodSelect") {
        renderMethodOptions();
        showScreen("methodSelect");
      } else if (target === "locked") {
        state.lockUntil = Date.now() + LOCK_MS;
        showScreen("locked");
        startLockCountdown();
      } else {
        showScreen(target);
        if (target === "setup") refreshSetupSummary();
        if (target === "dashboard") refreshDashboardSecurity();
      }
    });
  });
})();

function devSeed(target) {
  if (!state.user) state.user = "demo@globalseguros.com";
  if (!state.profile) state.profile = "cliente";
  if (["methodSelect", "challenge", "dashboard"].includes(target)) {
    state.contacts.sms = state.contacts.sms || "+57 300 0000000";
    state.contacts.email = state.contacts.email || "demo@globalseguros.com";
    state.verified.sms = true;
    state.verified.email = true;
    state.mfaEnabled = true;
  }
}

showScreen("login");
