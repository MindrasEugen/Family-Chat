// Modulo unico di traduzione per la sezione Traduttore.
//
// Espone `Translator.translateText(text, targetLang)` su `window`: il resto
// dell'app non sa (e non deve sapere) come avviene la traduzione. Tutto è
// incapsulato in una IIFE apposta perché app.js definisce già una propria
// `translateText(client, messageId, text)` per la traduzione dei messaggi in
// chat — essendo entrambi script classici (nessun type="module"), condividono
// lo scope globale. Una dichiarazione bare `function translateText` qui
// verrebbe silenziosamente sovrascritta da quella di app.js (che carica
// dopo), rompendo la sezione Traduttore senza errori visibili. La IIFE evita
// il problema alla radice: `translateText` qui dentro non tocca mai lo scope
// globale, solo `window.Translator` lo fa, con un nome che non collide.
//
// Servizio usato: la Edge Function Supabase `translate-message`, la stessa
// già usata dalla chat (proxy verso Mistral con chiave server-side). Nessuna
// chiave nel codice client: solo l'anon key pubblica di Supabase, richiesta
// dal gateway per instradare la richiesta alla function.
//
// Lingua di partenza: non dichiarata perché non richiesta. Il prompt lato
// server chiede a Mistral di tradurre verso targetLang rilevando la lingua
// di partenza dal testo stesso (autodetect), quindi non c'è alcuna
// assunzione da fare qui.
//
// Doppia esposizione (globale + module.exports) per browser e Vitest senza
// build step, come lib/pure.js.
(function (global) {
  const TRANSLATOR_TARGET_LANGS = ["fr", "en"];

  async function translateText(text, targetLang) {
    if (!TRANSLATOR_TARGET_LANGS.includes(targetLang)) {
      throw new Error(`Lingua di destinazione non supportata: ${targetLang}`);
    }
    if (!text || !text.trim()) return "";
    // SUPABASE_URL/SUPABASE_ANON_KEY sono const globali di app.js: lette qui
    // dentro la funzione (non a livello di modulo) perché lib/translator.js
    // viene caricato PRIMA di app.js — a livello di modulo non esisterebbero
    // ancora. Qui va bene: translateText viene chiamata solo dopo l'avvio,
    // quando app.js è già stato eseguito per intero.
    const response = await fetch(`${SUPABASE_URL}/functions/v1/translate-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ text, targetLang }),
    });
    if (!response.ok) {
      throw new Error(`Servizio di traduzione non disponibile (${response.status})`);
    }
    const data = await response.json();
    const translated = data?.translatedText;
    if (typeof translated !== "string" || !translated) {
      throw new Error("Risposta del servizio di traduzione non valida");
    }
    return translated;
  }

  if (typeof global !== "undefined") {
    global.Translator = { translateText };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      translateText,
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
