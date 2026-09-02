# SECURITY_REPORT.md — Report di sicurezza

Data: 2026-09-02
Ambito: revisione statica del codice in questo repository (`index.html`, `app.js`, `sw.js`, `DB.sql`, `manifest.json`) e della configurazione Supabase così come descritta in `DB.sql`/`README.md`. Non include un penetration test attivo né l'ispezione del codice delle Edge Function (`translate-message`, `send-push`), che non sono versionate in questo repository.

## Executive summary

L'app è una PWA statica (nessun backend proprio) che si appoggia interamente a Supabase per autenticazione, dati e storage. L'impostazione delle Row Level Security (RLS) è corretta e coerente su entrambe le tabelle (`messages`, `push_subscriptions`), l'input utente mostrato come HTML è sempre passato per `escapeHtml`, e non ci sono query SQL costruite a mano lato client (si usa sempre il query builder di supabase-js). Non sono state trovate chiavi private o segreti sensibili nel codice versionato.

I punti da sistemare sono di severità bassa/media e riguardano principalmente *defense in depth* (SRI sulla libreria caricata da CDN, assenza di CSP) e la mancanza di validazione server-side sugli upload delle foto, non falle sfruttabili in modo diretto.

## Riepilogo dei findings

| # | Severità | Area | Titolo |
|---|----------|------|--------|
| 1 | Media | Supply chain | Libreria `supabase-js` caricata da CDN senza versione fissata e senza SRI — **risolto** (2026-09-02) |
| 2 | Bassa | Upload foto | Nessuna validazione server-side di tipo/dimensione del file caricato |
| 3 | Bassa | Hardening | Nessun Content-Security-Policy |
| 4 | Info | Storage | Signed URL delle foto valide 7 giorni, non revocabili singolarmente |
| 5 | Info | Modello di fiducia | Account condiviso per camera: ogni membro ha accesso completo a tutti i messaggi/foto della camera |
| 6 | Info | Segreti | Anon key e VAPID public key in chiaro in `app.js` — corretto per design, verificato che non ci siano chiavi private |
| 7 | Info | Terze parti | Il testo dei messaggi viene inviato a Mistral per la traduzione |
| 8 | Info | Tracciabilità | Codice delle Edge Function non versionato in questo repository |
| 9 | Info | Igiene repo | File locali non necessari (`app.js.bak`, file PNG con nome anomalo) già esclusi da `.gitignore` |

## Dettaglio

### 1. Libreria supabase-js senza versione fissata né SRI (Media)

`index.html:93`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```
`@2` punta sempre all'ultima versione 2.x disponibile su jsDelivr, e non c'è l'attributo `integrity` (Subresource Integrity). Questo significa che:
- un aggiornamento della libreria può introdurre comportamenti diversi senza preavviso;
- se jsDelivr o il pacchetto npm venissero compromessi, il codice servito verrebbe eseguito senza alcun controllo di integrità, con accesso diretto a sessioni Supabase (quindi ai dati di tutte le camere sul device).

**Consigliato**: fissare una versione esatta (es. `@supabase/supabase-js@2.45.4`) e aggiungere `integrity="sha384-..."` + `crossorigin="anonymous"`.

**Risolto**: `index.html` ora carica `@supabase/supabase-js@2.113.0` (versione stabile più recente al momento della modifica) dal percorso file esatto, con `integrity` (SHA-384) e `crossorigin="anonymous"`. Verificato in locale: la pagina carica senza errori di integrity in console e l'app funziona normalmente. Da tenere presente: ad ogni futuro aggiornamento della versione andrà rigenerato anche l'hash `integrity`, altrimenti il browser bloccherà lo script.

### 2. Nessuna validazione server-side su tipo/dimensione foto (Bassa)

`app.js:855-869` controlla solo `file.type.startsWith("image/")`, un valore dichiarato dal browser e facilmente aggirabile (devtools, richiesta diretta all'API Storage). Le policy RLS su `storage.objects` (`DB.sql:92-108`) verificano solo che il path inizi con il proprio `user_id`, non il tipo di contenuto né la dimensione. Un membro autenticato di una camera potrebbe quindi caricare file non immagine o di dimensioni arbitrarie nel bucket `chat-photos`.

**Consigliato**: se rilevante per il modello di minaccia (utenti sono familiari fidati, quindi rischio basso), impostare un limite di dimensione sul bucket Supabase Storage (Project Settings → Storage) e valutare una validazione MIME lato Edge Function se in futuro si aggiungerà un livello server-side.

### 3. Nessun Content-Security-Policy (Bassa)

Nessun header/meta CSP in `index.html`. Il codice attuale è pulito (uso sistematico di `escapeHtml`/`textContent` per contenuto utente, nessun `eval`), quindi il rischio concreto oggi è basso, ma una CSP fornirebbe una rete di sicurezza in caso di errore futuro (es. un nuovo punto che dimentica di escapare l'input).

**Consigliato**: meta CSP che permetta solo `self`, il CDN di supabase-js e le connessioni verso `*.supabase.co`.

### 4. Signed URL delle foto valide 7 giorni (Info)

`app.js:7` (`SIGNED_URL_TTL_SECONDS`) genera URL firmati validi 7 giorni. Chi ottiene quell'URL (es. da history del browser, da uno screenshot, da una condivisione accidentale) può vedere la foto per tutta la finestra, anche se nel frattempo l'account viene rimosso dalla camera. Compromesso ragionevole per l'uso previsto (chat familiare), da tenere presente.

### 5. Modello di fiducia: account condiviso per camera (Info)

Per design (vedi README), tutti i membri di una "camera" usano le stesse credenziali Supabase, quindi condividono lo stesso `auth.uid()`. Le policy RLS "solo i propri messaggi" (`DB.sql:41-59`) diventano di fatto "solo i messaggi di questa camera": chiunque conosca la password della camera può leggere, inserire ed **eliminare** qualsiasi messaggio/foto di quella camera. Non è un bug — è il modello dichiarato — ma va tenuto presente: non c'è distinzione di permessi tra i membri di una stessa camera, e la sicurezza della camera dipende interamente dalla segretezza della password condivisa.

### 6. Chiavi pubbliche in chiaro nel client (Info, verificato corretto)

`SUPABASE_ANON_KEY` e `VAPID_PUBLIC_KEY` sono hardcoded in `app.js:3-10`. È il funzionamento previsto per Supabase (l'anon key è protetta dalle policy RLS, non da segretezza) e per Web Push (la chiave VAPID pubblica è per definizione pubblica). Confermato che **nessuna** `service_role` key, `MISTRAL_API_KEY` o `PUSH_WEBHOOK_SECRET`/`VAPID_PRIVATE_KEY` compare nel codice versionato: questi restano correttamente lato server come secret delle Edge Function, come descritto nel README.

### 7. Testo dei messaggi inviato a Mistral per la traduzione (Info)

`app.js:204-218` invoca l'Edge Function `translate-message`, che fa da proxy verso l'API di Mistral. Il contenuto dei messaggi lascia quindi l'infrastruttura Supabase verso una terza parte per essere tradotto. Non è una vulnerabilità (la chiamata passa da un proxy server-side con chiave segreta, non è esposta lato client), ma è un flusso dati verso terzi da tenere presente/dichiarare se l'app venisse usata da un pubblico più ampio (vedi PLAN.md, visione a lungo termine).

### 8. Codice delle Edge Function non versionato (Info)

`translate-message` e `send-push` — che gestiscono `MISTRAL_API_KEY`, `VAPID_PRIVATE_KEY` e `PUSH_WEBHOOK_SECRET` — non hanno file sorgente in questo repository (nessuna cartella `supabase/functions`), quindi non è stato possibile includerle in questa revisione. Sono deployate direttamente su Supabase.

**Consigliato**: se possibile, versionare il codice sorgente delle Edge Function (senza i secret, che restano nel secret manager di Supabase) in una cartella `supabase/functions/` di questo repo, per tracciabilità e revisione futura.

### 9. Igiene del repository (Info) — **risolto** (2026-09-02)

`app.js.bak` (versione precedente del file, con lo stesso `SUPABASE_ANON_KEY` pubblico) e un file immagine con nome anomalo (`System.Drawing.Drawing2D.GraphicsPath`, probabilmente un artefatto di un copia-incolla) erano presenti localmente ma correttamente esclusi da `.gitignore`, quindi non sono mai stati pushati: nessun rischio era mai esistito nel repository remoto. Verificato e rimosso: `System.Drawing.Drawing2D.GraphicsPath` era un PNG 180×180 completamente bianco, senza contenuto reale né riferimenti nel codice; `app.js.bak` era ridondante (la cronologia completa di `app.js` resta comunque in git). Entrambi cancellati localmente; rimossa anche la riga specifica in `.gitignore` (non più necessaria).

## Cose verificate e risultate corrette

- **RLS completa e coerente** su `messages` e `push_subscriptions`: SELECT/INSERT/DELETE (e UPDATE dove serve) tutte filtrate su `(select auth.uid()) = user_id`, nessuna tabella con RLS disabilitata, nessuna policy troppo permissiva (`using (true)`) trovata.
- **Nessuna SQL injection possibile**: tutte le query lato client passano dal query builder di supabase-js (`.eq()`, `.lt()`, `.gt()`, `.insert()`, ecc.), mai SQL testuale costruito con concatenazione.
- **XSS**: ogni inserimento di contenuto utente in `innerHTML` (testo messaggio, nome dispositivo, etichetta camera, anteprima) passa da `escapeHtml()` (`app.js:74-78`); gli aggiornamenti successivi (es. testo tradotto) usano `textContent`, non `innerHTML`.
- **Storage privato**: il bucket `chat-photos` è `public: false`, accesso solo via signed URL generata lato client autenticato.
- **Nessun segreto privato committato**: verificato che `service_role key`, chiave privata VAPID e chiave Mistral non compaiono in nessun file tracciato da git.

## Punti da verificare manualmente (non ispezionabili dal codice)

Queste impostazioni vivono nella dashboard Supabase, non nel repository — vanno controllate/confermate a parte:

- **Conferma email: verificato NON attiva (2026-09-02)**, creando l'account di test per la suite E2E (vedi `PLAN.md`) — la richiesta di signup ha restituito subito una sessione valida, senza attesa di conferma. Permette quindi oggi account "usa e getta" sulla camera con una semplice email/password, senza bisogno di accesso reale a quella casella. **Scelta deliberata, non una svista**: finché l'uso resta familiare, il rischio è accettabile; da attivare in **Authentication → Providers → Email** della dashboard Supabase solo se/quando si osserva un uso improprio (coerente col pubblico più ampio ipotizzato in `PLAN.md`).
- Rate limiting / protezione da password compromesse su Supabase Auth.
- Dimensione massima file impostata sul bucket `chat-photos`.
- Che il Database Webhook verso `send-push` non sia raggiungibile senza l'header `x-webhook-secret` corretto (già previsto per design, da riconfermare in dashboard).

## Conclusione

Non sono state individuate vulnerabilità sfruttabili direttamente (nessuna injection, nessuna XSS, RLS solida). I punti aperti sono miglioramenti di hardening (SRI, CSP, validazione upload) coerenti con la scala e il pubblico attuale del progetto (uso familiare, utenti fidati). Da rivalutare se il progetto crescesse verso un pubblico più ampio, come ipotizzato in `PLAN.md`.
