# PLAN.md — Note e direzione futura

Note di lavoro non legate a un task specifico: filosofia di sviluppo, debito tecnico noto, idee per il futuro. Aggiornare quando cambia qualcosa di rilevante, non ad ogni commit.

## Filosofia

- **Test automatici sempre**, indipendentemente dalla dimensione del progetto. Non è un "nice to have" da rimandare finché l'app resta piccola: è un debito da recuperare appena si riprende in mano il progetto con calma.

## Visione a lungo termine

- Oggi: chat per famiglia, con "camere" per gestire più gruppi familiari (o più famiglie) sullo stesso device.
- Possibile domani: una chat con traduzione automatica integrata potrebbe essere utile a un pubblico più ampio, non solo alla famiglia. Non è una decisione presa, ma un'ipotesi abbastanza solida da tenere in mente nelle scelte architetturali — vedi sotto.

## Debito tecnico noto

- **Test automatici: due passi fatti, resto ancora scoperto** (vedi Filosofia sopra).
  - `npm test` (Vitest) copre le funzioni pure estratte in `lib/pure.js` (escapeHtml, urlBase64ToUint8Array, roomInitial, formatPreviewText, e il registro camere load/save/upsert/remove/findLegacy). `lib/pure.js` è caricato come script classico (non modulo) prima di `app.js` in `index.html`, con doppio export (`window`/`module.exports`) per restare importabile sia dal browser sia da Vitest senza introdurre un build step nell'app.
  - `npm run test:e2e` (Playwright, contro il vero Supabase del progetto) copre login (credenziali giuste/sbagliate), invio messaggio con conferma realtime, e persistenza della sessione dopo reload — quest'ultimo il test di più alto valore, perché verifica proprio il multi-room support (2026-09-02) end-to-end in un vero browser, non solo la logica del registro in isolamento. Account di test dedicato (`e2e-tests@familychat.invalid`), isolato dai dati reali via le stesse RLS policy di produzione (vedi README "Test" per come configurarlo). Nota: la conferma email risulta **non attiva** su questo progetto Supabase (verificato empiricamente creando l'account di test) — scelta deliberata finché l'uso resta familiare, vedi `SECURITY_REPORT.md`.
  - Resta scoperto: multi-camera con due account reali aperti in parallelo (switch tra camere), upload foto, notifiche push, traduzione automatica. Richiederebbe un secondo account di test e più tempo di esecuzione — non prioritario finché l'uso resta familiare/a basso traffico.
- **Aggiornamento di `supabase-js` in due passi**: in `index.html` la libreria è caricata da CDN con versione fissata e hash `integrity` (SRI, vedi `SECURITY_REPORT.md` punto 1). Aggiornare solo il numero di versione senza rigenerare l'hash rompe il caricamento (il browser blocca lo script per mismatch di integrity). Ad ogni bump di versione: scaricare il nuovo file, ricalcolare l'hash SHA-384, e aggiornare entrambi insieme nel tag `<script>`.
- `app.js` è un unico file (~950 righe) che gestisce auth multi-camera, realtime, push, traduzione e rendering UI. Sostenibile per ora, ma da modularizzare se il progetto cresce ulteriormente.
- Nessun build step / type-checking: gli errori di battitura o di forma dei dati si scoprono solo a runtime.
- La funzione multi-camera (aggiunta 2026-09-02) non è ancora stata verificata su device reali con due account veri.

## Idee in sospeso (non urgenti)

- **Migrazione a React** (o struttura a componenti equivalente): aiuterebbe soprattutto a eliminare la sincronizzazione manuale stato↔DOM (lista camere, badge non letti, cambio schermata), che oggi è il punto più fragile del codice. È una riscrittura, non un refactor — da pianificare con calma se/quando l'app cresce oltre l'uso familiare attuale, non da fare "di corsa".
