# Chat Famiglia

PWA di chat che supporta più account condivisi ("camere") loggati contemporaneamente sullo stesso device — una camera per ogni famiglia/gruppo (nonni, genitori, nipoti) — utilizzabile da parti diverse del mondo grazie alla traduzione automatica dei messaggi. Solo HTML, CSS e JavaScript lato client, backend interamente su Supabase.

**In produzione**: https://chat-famiglia.onrender.com

## Funzionalità

- **Camere multiple**: più account Supabase (uno per gruppo/famiglia) loggati in parallelo sullo stesso device, ognuno con la propria sessione isolata — si passa dall'uno all'altro dalla lista camere senza rifare login, in stile Telegram (nome, anteprima ultimo messaggio, badge non letti).
- **Login condiviso per camera** (email/password) via Supabase Auth: stesso account su tutti i dispositivi che partecipano a quella camera.
- **Messaggi in tempo reale** tra dispositivi tramite Supabase Realtime, con testo e/o **una foto per messaggio** (ridimensionata e compressa lato client prima dell'upload).
- **Traduzione automatica** di ogni messaggio nella lingua di sistema del dispositivo che lo riceve, tramite una Edge Function che fa da proxy verso l'API di Mistral.
- **Traduttore**: strumento standalone per tradurre testo libero verso francese o inglese, utile per preparare messaggi nella lingua giusta; riusa la stessa Edge Function della chat.
- **Nome del dispositivo**: richiesto al primo avvio (salvato solo in locale, condiviso da tutte le camere su quel device) e mostrato sui messaggi inviati da lì, per riconoscere chi scrive.
- **Notifiche push** di sistema (Web Push/VAPID) per ciascuna camera, consegnate anche ad app chiusa o schermo spento, soppresse automaticamente solo se quella specifica camera è già aperta in primo piano (lì il messaggio arriva comunque via realtime).
- **Pulizia automatica**: i messaggi (e le foto collegate) più vecchi di 30 giorni vengono eliminati, per ogni camera, ad ogni apertura dell'app.
- **Due interruttori** in-app, per dispositivo, per disattivare singolarmente notifiche push e traduzione automatica (si applicano a tutte le camere).
- Installabile come **PWA** su schermata Home (manifest + service worker con cache dell'app shell).

## Struttura del progetto

| File | Contenuto |
|------|-----------|
| `index.html` | Markup dell'app (schermata login/aggiungi camera, lista camere, chat) |
| `style.css` | Stili, layout chat mobile-first, dark mode automatica |
| `app.js` | Logica: gestione multi-camera, auth, messaggi, realtime, upload foto, traduzione, notifiche push, preferenze |
| `sw.js` | Service worker (cache dell'app shell, ricezione notifiche push) |
| `manifest.json` | Manifest PWA |
| `DB.sql` | Schema Supabase: tabelle `messages`/`push_subscriptions`, RLS, bucket Storage per le foto |
| `icons/` | Icone dell'app |
| `lib/pure.js` | Funzioni pure estratte da `app.js`, testate con Vitest (vedi sotto) |
| `lib/translator.js` | Modulo di traduzione (client per la Edge Function `translate-message`), testato con Vitest |
| `translator.js` | UI della sezione Traduttore (debounce, cambio lingua, navigazione) |
| `lib/translator.test.js` | Test Vitest per `lib/translator.js` (7 test) |
| `e2e/` | Test end-to-end (Playwright) sui flussi critici |

## Setup Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. Esegui `DB.sql` nello SQL Editor del progetto: crea le tabelle `messages` e `push_subscriptions`, le policy RLS e il bucket Storage privato `chat-photos`.
3. In `app.js`, imposta `SUPABASE_URL` e `SUPABASE_ANON_KEY` con i valori del tuo progetto (Project Settings → API).
4. **Traduzione automatica**: deploya la Edge Function `translate-message` (proxy verso l'API di Mistral) e imposta il secret `MISTRAL_API_KEY` in **Project Settings → Edge Functions → Secrets** con una chiave da [console.mistral.ai](https://console.mistral.ai).
5. **Notifiche push**: genera una coppia di chiavi VAPID (es. con `web-push generate-vapid-keys`), poi:
   - imposta `VAPID_PUBLIC_KEY` in `app.js` (costante `VAPID_PUBLIC_KEY`);
   - deploya la Edge Function `send-push` e imposta i secret `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e un `PUSH_WEBHOOK_SECRET` a scelta (stringa casuale) in **Project Settings → Edge Functions → Secrets**;
   - crea un **Database Webhook** (Database → Webhooks) su `INSERT` della tabella `messages`, verso `POST https://<il-tuo-progetto>.supabase.co/functions/v1/send-push`, con l'header `x-webhook-secret` impostato allo stesso valore di `PUSH_WEBHOOK_SECRET`.
6. Crea un utente (schermata "Registrati" nell'app) da usare come account condiviso su tutti i dispositivi di una camera. Dalla lista camere, il bottone "+ Aggiungi account/gruppo" permette di aggiungerne altre (login su un account esistente o creazione di uno nuovo), tutte attive in parallelo sullo stesso device.

## Deploy

Sito statico su [Render](https://render.com), collegato al branch `main` di questo repository: ogni push triggera un nuovo deploy automatico. Nessun build step richiesto (solo HTML/CSS/JS serviti direttamente).

## Sviluppo locale

Basta un server statico qualsiasi nella cartella del progetto, ad esempio:

```
npx serve
```

oppure

```
python -m http.server
```

Le chiamate a Supabase funzionano anche in locale (sono richieste HTTPS dirette); l'unica funzionalità che richiede un vero hosting HTTPS è l'installazione come PWA sul telefono e la ricezione delle notifiche push.

## Test

Richiede `npm install` (installa solo dipendenze di sviluppo: l'app in produzione resta senza build step).

- **Unit test** (`npm test`, Vitest): coprono le funzioni pure estratte in `lib/pure.js` (escape HTML, formattazione, registro camere in `localStorage`) e il modulo `lib/translator.js` (fetch verso la Edge Function mockato). Non toccano Supabase.
- **Test E2E** (`npm run test:e2e`, Playwright): coprono login, invio messaggio e persistenza della sessione dopo reload, contro il vero backend Supabase del progetto (nessun mock).
  - Serve un account Supabase dedicato ai test, isolato dai dati reali tramite le stesse RLS policy di produzione (ogni account vede solo le proprie righe — non servono tabelle o progetti separati). Copia `e2e/test-account.example.mjs` in `e2e/test-account.local.mjs` (gitignored) con le credenziali di quell'account — vedi i commenti nel file per come crearlo.
  - I test puliscono da soli i messaggi che creano, usando il pulsante di eliminazione dell'app stessa.
  - Al primo utilizzo, scarica il browser Chromium di Playwright con `npx playwright install chromium`.
