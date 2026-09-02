// Copia questo file in test-account.local.mjs (gitignored) con le credenziali
// reali dell'account Supabase dedicato ai test E2E.
//
// Non serve creare un progetto Supabase separato: questo account e' isolato
// dalle camere vere tramite le stesse RLS policy usate in produzione
// (ogni account vede/scrive solo le proprie righe, vedi SECURITY_REPORT.md
// punto 5). I test puliscono i messaggi che creano tramite il pulsante di
// eliminazione dell'app stessa.
//
// Per creare l'account: usa il modulo "Registrati" dell'app una volta con
// l'email/password scelte (la conferma email non e' richiesta su questo
// progetto), poi incolla le stesse credenziali qui sotto.
export const E2E_TEST_EMAIL = "e2e-tests@familychat.invalid";
export const E2E_TEST_PASSWORD = "changeme";
