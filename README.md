# Chat Famiglia

PWA di chat pensata per un unico account condiviso tra i dispositivi della famiglia (nonni, genitori, nipoti), utilizzabile da parti diverse del mondo grazie alla traduzione automatica dei messaggi. Solo HTML, CSS e JavaScript lato client, backend interamente su Supabase.

## Funzionalità

- **Login condiviso** (email/password) via Supabase Auth: stesso account su tutti i dispositivi.
- **Messaggi in tempo reale** tra dispositivi tramite Supabase Realtime, con testo e/o **una foto per messaggio** (ridimensionata e compressa lato client prima dell'upload).
- **Traduzione automatica** di ogni messaggio nella lingua di sistema del dispositivo che lo riceve, tramite una Edge Function che fa da proxy verso l'API di Mistral.
- **Nome del dispositivo**: richiesto al primo avvio su ogni dispositivo (salvato solo in locale) e mostrato sui messaggi inviati da lì, per riconoscere chi scrive.
- **Notifiche** tramite vibrazione (Android e dispositivi non-iOS) all'arrivo di un nuovo messaggio.
- **Pulizia automatica**: i messaggi (e le foto collegate) più vecchi di 30 giorni vengono eliminati ad ogni apertura dell'app.
- **Due interruttori** in-app, per dispositivo, per disattivare singolarmente notifiche e traduzione automatica.
- Installabile come **PWA** su schermata Home (manifest + service worker con cache dell'app shell).

## Struttura del progetto

| File | Contenuto |
|------|-----------|
| `index.html` | Markup dell'app (schermata login + chat) |
| `style.css` | Stili, layout chat mobile-first, dark mode automatica |
| `app.js` | Logica: auth, messaggi, realtime, upload foto, traduzione, preferenze |
| `sw.js` | Service worker (cache dell'app shell) |
| `manifest.json` | Manifest PWA |
| `DB.sql` | Schema Supabase: tabella `messages`, RLS, bucket Storage per le foto |
| `icons/` | Icone dell'app |

## Setup Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. Esegui `DB.sql` nello SQL Editor del progetto: crea la tabella `messages`, le policy RLS e il bucket Storage privato `chat-photos`.
3. In `app.js`, imposta `SUPABASE_URL` e `SUPABASE_ANON_KEY` con i valori del tuo progetto (Project Settings → API).
4. Deploya la Edge Function `translate-message` (proxy verso l'API di Mistral) e imposta il secret `MISTRAL_API_KEY` in **Project Settings → Edge Functions → Secrets** con una chiave da [console.mistral.ai](https://console.mistral.ai).
5. Crea un utente (schermata "Registrati" nell'app) da usare come account condiviso su tutti i dispositivi.

## Sviluppo locale

Basta un server statico qualsiasi nella cartella del progetto, ad esempio:

```
npx serve
```

oppure

```
python -m http.server
```

Le chiamate a Supabase funzionano anche in locale (sono richieste HTTPS dirette); l'unica funzionalità che richiede un vero hosting HTTPS è l'installazione come PWA sul telefono.
