# PLAN.md — Note e direzione futura

Note di lavoro non legate a un task specifico: filosofia di sviluppo, debito tecnico noto, idee per il futuro. Aggiornare quando cambia qualcosa di rilevante, non ad ogni commit.

## Filosofia

- **Test automatici sempre**, indipendentemente dalla dimensione del progetto. Non è un "nice to have" da rimandare finché l'app resta piccola: è un debito da recuperare appena si riprende in mano il progetto con calma.

## Visione a lungo termine

- Oggi: chat per famiglia, con "camere" per gestire più gruppi familiari (o più famiglie) sullo stesso device.
- Possibile domani: una chat con traduzione automatica integrata potrebbe essere utile a un pubblico più ampio, non solo alla famiglia. Non è una decisione presa, ma un'ipotesi abbastanza solida da tenere in mente nelle scelte architetturali — vedi sotto.

## Debito tecnico noto

- **Nessun test automatico** (vedi Filosofia sopra).
- `app.js` è un unico file (~950 righe) che gestisce auth multi-camera, realtime, push, traduzione e rendering UI. Sostenibile per ora, ma da modularizzare se il progetto cresce ulteriormente.
- Nessun build step / type-checking: gli errori di battitura o di forma dei dati si scoprono solo a runtime.
- La funzione multi-camera (aggiunta 2026-09-02) non è ancora stata verificata su device reali con due account veri.

## Idee in sospeso (non urgenti)

- **Migrazione a React** (o struttura a componenti equivalente): aiuterebbe soprattutto a eliminare la sincronizzazione manuale stato↔DOM (lista camere, badge non letti, cambio schermata), che oggi è il punto più fragile del codice. È una riscrittura, non un refactor — da pianificare con calma se/quando l'app cresce oltre l'uso familiare attuale, non da fare "di corsa".
