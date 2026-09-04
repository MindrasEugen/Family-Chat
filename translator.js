// Sezione Traduttore: UI isolata dalla chat.
//
// Convenzioni riprese da app.js: riferimenti DOM in testa, tutto dietro
// addEventListener, messaggi di stato con classi .message/.error, navigazione
// tra schermate con showScreen(). La traduzione vera e propria resta dentro
// lib/translator.js (Translator.translateText): qui non si costruisce nessun
// URL e non si chiama fetch direttamente.
// Si usa `Translator.translateText` (non una `translateText` globale nuda)
// perché app.js definisce già una propria `translateText` per la chat: nomi
// bare identici in script classici caricati insieme collidono silenziosamente
// (vedi commento in lib/translator.js).
// Viene caricato come script classico dopo app.js e lib/translator.js.
const translatorBackBtn = document.getElementById("translator-back-btn");
const translatorOpenBtn = document.getElementById("translator-open-btn");
const translatorInput = document.getElementById("translator-input");
const translatorOutput = document.getElementById("translator-output");
const translatorMessage = document.getElementById("translator-message");
const translatorLangButtons = [...document.querySelectorAll("[data-translator-lang]")];

let translatorTargetLang = "fr";
let translatorDebounceTimer = null;
let translatorRequestSeq = 0;

function setTranslatorMessage(text, type) {
  translatorMessage.textContent = text || "";
  translatorMessage.classList.remove("error", "success");
  if (type) translatorMessage.classList.add(type);
}

// Evita di mostrare traduzioni arrivate fuori ordine: vale solo l'ultima
// richiesta (input che cambia in fretta, cambio lingua durante il fetch).
async function requestTranslatorTranslation() {
  const text = translatorInput.value;
  const requestId = ++translatorRequestSeq;
  if (!text.trim()) {
    translatorOutput.textContent = "";
    setTranslatorMessage("");
    return;
  }
  translatorOutput.textContent = "Traduzione in corso…";
  setTranslatorMessage("");
  try {
    const translated = await Translator.translateText(text, translatorTargetLang);
    if (requestId !== translatorRequestSeq) return;
    translatorOutput.textContent = translated;
  } catch {
    if (requestId !== translatorRequestSeq) return;
    translatorOutput.textContent = "";
    setTranslatorMessage("Traduzione non riuscita. Riprova tra poco.", "error");
  }
}

function scheduleTranslatorTranslation() {
  clearTimeout(translatorDebounceTimer);
  translatorDebounceTimer = setTimeout(requestTranslatorTranslation, 400);
}

function setTranslatorTargetLang(lang) {
  translatorTargetLang = lang;
  translatorLangButtons.forEach((btn) => {
    const selected = btn.dataset.translatorLang === lang;
    btn.classList.toggle("secondary", !selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
  // Il cambio lingua ritraduce subito quello che c'è già scritto.
  clearTimeout(translatorDebounceTimer);
  requestTranslatorTranslation();
}

translatorInput.addEventListener("input", scheduleTranslatorTranslation);

translatorLangButtons.forEach((btn) => {
  btn.addEventListener("click", () => setTranslatorTargetLang(btn.dataset.translatorLang));
});

translatorOpenBtn.addEventListener("click", () => {
  showScreen("translator");
});

translatorBackBtn.addEventListener("click", () => {
  clearTimeout(translatorDebounceTimer);
  translatorRequestSeq++;
  showScreen("rooms");
});

setTranslatorTargetLang("fr");
