# Chat Famiglia

PWA di chat pensata per un unico account condiviso tra i dispositivi della famiglia (nonni, genitori, nipoti), utilizzabile da parti diverse del mondo grazie alla traduzione automatica dei messaggi. Solo HTML, CSS e JavaScript lato client, backend interamente su Supabase.

**In produzione**: https://chat-famiglia.onrender.com

## Funzionalità

- **Login condiviso** (email/password) via Supabase Auth: stesso account su tutti i dispositivi.
- **Messaggi in tempo reale** tra dispositivi tramite Supabase Realtime, con testo e/o **una foto per messaggio** (ridimensionata e compressa lato client prima dell'upload).
- **Traduzione automatica** di ogni messaggio nella lingua di sistema del dispositivo che lo riceve, tramite una Edge Function che fa da proxy verso l'API di Mistral.
- **Nome del dispositivo**: richiesto al primo avvio su ogni dispositivo (salvato solo in locale) e mostrato sui messaggi inviati da lì, per riconoscere chi scrive.
- **Notifiche push** di sistema (Web Push/VAPID), consegnate anche ad app chiusa o schermo spento, soppresse automaticamente sul dispositivo che ha già la chat aperta in primo piano (lì il messaggio arriva comunque via realtime, con vibrazione).
- **Pulizia automatica**: i messaggi (e le foto collegate) più vecchi di 30 giorni vengono eliminati ad ogni apertura dell'app.
- **Due interruttori** in-app, per dispositivo, per disattivare singolarmente notifiche (push + vibrazione) e traduzione automatica.
- Installabile come **PWA** su schermata Home (manifest + service worker con cache dell'app shell).

## Struttura del progetto

| File | Contenuto |
|------|-----------|
| `index.html` | Markup dell'app (schermata login + chat) |
| `style.css` | Stili, layout chat mobile-first, dark mode automatica |
| `app.js` | Logica: auth, messaggi, realtime, upload foto, traduzione, notifiche push, preferenze |
| `sw.js` | Service worker (cache dell'app shell, ricezione notifiche push) |
| `manifest.json` | Manifest PWA |
| `DB.sql` | Schema Supabase: tabelle `messages`/`push_subscriptions`, RLS, bucket Storage per le foto |
| `icons/` | Icone dell'app |

## Setup Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. Esegui `DB.sql` nello SQL Editor del progetto: crea le tabelle `messages` e `push_subscriptions`, le policy RLS e il bucket Storage privato `chat-photos`.
3. In `app.js`, imposta `SUPABASE_URL` e `SUPABASE_ANON_KEY` con i valori del tuo progetto (Project Settings → API).
4. **Traduzione automatica**: deploya la Edge Function `translate-message` (proxy verso l'API di Mistral) e imposta il secret `MISTRAL_API_KEY` in **Project Settings → Edge Functions → Secrets** con una chiave da [console.mistral.ai](https://console.mistral.ai).
5. **Notifiche push**: genera una coppia di chiavi VAPID (es. con `web-push generate-vapid-keys`), poi:
   - imposta `VAPID_PUBLIC_KEY` in `app.js` (costante `VAPID_PUBLIC_KEY`);
   - deploya la Edge Function `send-push` e imposta i secret `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e un `PUSH_WEBHOOK_SECRET` a scelta (stringa casuale) in **Project Settings → Edge Functions → Secrets**;
   - crea un **Database Webhook** (Database → Webhooks) su `INSERT` della tabella `messages`, verso `POST https://<il-tuo-progetto>.supabase.co/functions/v1/send-push`, con l'header `x-webhook-secret` impostato allo stesso valore di `PUSH_WEBHOOK_SECRET`.
6. Crea un utente (schermata "Registrati" nell'app) da usare come account condiviso su tutti i dispositivi.

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
