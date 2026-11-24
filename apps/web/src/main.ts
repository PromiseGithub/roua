/**
 * ROUA web generator. Runs entirely in the browser; makes no network requests
 * (the page's Content-Security-Policy sets connect-src 'none' to enforce it).
 */
import {
  LEVELS,
  LEVEL_INFO,
  PROFILES,
  PROFILE_INFO,
  configToYaml,
  generatePassword,
  isScramSafePassword,
  planPostgres,
  scramSha256Verifier,
  validateConfig,
  type Level,
  type PasswordSecret,
  type Profile,
} from "@roua/core";
import { formToConfig, type FormValues } from "./form.js";

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let files: Record<string, string> = {};
let current = "setup.sql";

function init() {
  const profile = $<HTMLSelectElement>("profile");
  const level = $<HTMLSelectElement>("level");
  for (const p of PROFILES) profile.add(new Option(`${PROFILE_INFO[p].title} (${p})`, p));
  for (const l of LEVELS) level.add(new Option(`${l}: ${LEVEL_INFO[l].name}`, l));
  profile.value = "agent";
  level.value = PROFILE_INFO.agent.defaultLevel;
  setDefaultExpiry();
  $("password").value = generatePassword(32);

  profile.addEventListener("change", () => {
    const p = profile.value as Profile;
    level.value = PROFILE_INFO[p].defaultLevel;
    const name = $("name");
    if (/^roua_[a-z]+_/.test(name.value)) name.value = name.value.replace(/^roua_[a-z]+_/, `roua_${p}_`);
    setDefaultExpiry();
    refreshVisibility();
  });
  level.addEventListener("change", () => {
    setDefaultExpiry();
    refreshVisibility();
  });
  $("regen").addEventListener("click", () => ($("password").value = generatePassword(32)));
  $("copyPw").addEventListener("click", () => copy($("password").value, $("copyPw")));
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    void generate();
  });
  $("copy").addEventListener("click", () => copy(files[current] ?? "", $("copy")));
  $("download").addEventListener("click", () => download(current, files[current] ?? ""));
  $("downloadAll").addEventListener("click", () => {
    for (const [name, text] of Object.entries(files)) download(name, text);
  });
  refreshVisibility();
}

function setDefaultExpiry() {
  const p = $<HTMLSelectElement>("profile").value as Profile;
  const l = $<HTMLSelectElement>("level").value as Level;
  const d = new Date();
  if (l === "L5") {
    const t = new Date(d.getTime() + 8 * 3_600_000);
    $("expiresDate").value = t.toISOString().slice(0, 10);
    $("expiresTime").value = t.toISOString().slice(11, 16);
  } else {
    d.setUTCDate(d.getUTCDate() + PROFILE_INFO[p].defaultExpiryDays);
    $("expiresDate").value = d.toISOString().slice(0, 10);
  }
}

function refreshVisibility() {
  const p = $<HTMLSelectElement>("profile").value as Profile;
  const l = $<HTMLSelectElement>("level").value as Level;
  $("levelHelp").textContent = `${LEVEL_INFO[l].canRead} ${PROFILE_INFO[p].description}`;
  $("expiryHelp").textContent =
    l === "L5" ? "L5 accounts must expire within 24 hours and need two approvers." : `The ${p} profile allows at most ${PROFILE_INFO[p].maxExpiryDays} days.`;
  $("expiresTimeWrap").hidden = l !== "L5";
  document.querySelectorAll<HTMLElement>("[data-levels]").forEach((el) => {
    el.hidden = !(el.dataset.levels ?? "").split(" ").includes(l);
  });
}

function values(): FormValues {
  const v = (id: string) => $(id).value;
  const c = (id: string) => $(id).checked;
  return {
    name: v("name"),
    profile: v("profile") as Profile,
    level: v("level") as Level,
    owner: v("owner"),
    purpose: v("purpose"),
    approvedBy: v("approvedBy"),
    approvalRef: v("approvalRef"),
    expiresDate: v("expiresDate"),
    expiresTime: v("expiresTime"),
    maxConnections: v("maxConnections"),
    statementTimeout: v("statementTimeout"),
    allowedSources: v("allowedSources"),
    database: v("database"),
    schemas: v("schemas"),
    objectOwner: v("objectOwner"),
    include: v("include"),
    exclude: hiddenOr("exclude"),
    publicObjects: hiddenOr("publicObjects"),
    analyticsViews: hiddenOr("analyticsViews"),
    columnsDeny: hiddenOr("columnsDeny"),
    columnsAllow: hiddenOr("columnsAllow"),
    mask: hiddenOr("mask"),
    revokeTemp: c("revokeTemp"),
    revokePublicCreate: c("revokePublicCreate"),
    plaintext: c("plaintext"),
  };
}

/** Fields hidden for the chosen level do not apply. */
function hiddenOr(id: string): string {
  const el = $(id);
  return el.closest<HTMLElement>("[data-levels]")?.hidden ? "" : el.value;
}

async function generate() {
  const errorsEl = $("errors");
  const { config, errors } = formToConfig(values());
  const now = new Date();
  const v = validateConfig(config, { now });
  const all = [...errors, ...v.errors];
  const password = $("password").value;
  if (password.length < 16) all.push("Use a password of at least 16 characters (or click New).");
  if (!$("plaintext").checked && !isScramSafePassword(password)) all.push("SCRAM verifiers need a printable-ASCII password without spaces. Click New, or tick the plaintext option.");
  if (all.length) {
    errorsEl.innerHTML = `<b>Fix these first:</b><ul>${all.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
    errorsEl.hidden = false;
    return;
  }
  errorsEl.hidden = true;

  const secret: PasswordSecret = $("plaintext").checked
    ? { kind: "password", password }
    : { kind: "scram", verifier: await scramSha256Verifier(password) };
  const plan = planPostgres(v.config!, { now, secret, generator: "ROUA web generator 0.1.0" });
  const yamlConfig = { ...v.config!, auth: { ...v.config!.auth, password_env: "ROUA_PASSWORD" } };
  files = {
    "setup.sql": plan.setupSql,
    "audit.sql": plan.auditSql,
    "revoke.sql": plan.revokeSql,
    "drop.sql": plan.dropSql,
    "roua.yaml": configToYaml(yamlConfig, "ROUA 0.1 account definition. Never put a password in this file.\nUse with the roua CLI: roua plan / roua apply / roua verify"),
  };

  const tabs = $("tabs");
  tabs.replaceChildren(
    ...Object.keys(files).map((name) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = name;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => show(name));
      return b;
    }),
  );
  const notes: string[] = [];
  const warnings = [...v.warnings, ...plan.warnings];
  if (warnings.length) notes.push(`<div class="warn"><h3>Warnings</h3><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`);
  if (plan.manualSteps.length) {
    notes.push(`<h3>Manual steps</h3><ul>${plan.manualSteps.map((m) => `<li>${m.startsWith("  ") ? `<code>${esc(m.trim())}</code>` : esc(m)}</li>`).join("")}</ul>`);
  }
  $("notes").innerHTML = notes.join("");
  $("empty").hidden = true;
  $("result").hidden = false;
  show("setup.sql");
}

function show(name: string) {
  current = name;
  $("code").textContent = files[name] ?? "";
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.textContent === name)));
}

async function copy(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    flash(button, "Copied");
  } catch {
    flash(button, "Select and copy manually");
  }
}

function flash(button: HTMLElement, text: string) {
  const old = button.textContent;
  button.textContent = text;
  setTimeout(() => (button.textContent = old), 1500);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

init();
