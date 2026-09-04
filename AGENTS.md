# Istruzioni per agenti (FamilyChat)

Prima di introdurre un servizio o una libreria esterna, verifica se il progetto ha già una capacità equivalente. Se esiste, usala. Se scegli di non usarla, fermati e chiedi.

Esempio concreto già capitato in questo progetto: la sezione Traduttore è stata inizialmente implementata con un servizio pubblico esterno (MyMemory) pur essendo già presente ed in uso dalla chat una Edge Function Supabase (`translate-message`, proxy verso Mistral con chiave server-side) adatta allo stesso scopo. Per un'app di messaggi di famiglia, mandare il testo a un servizio esterno non necessario non è una scelta da prendere in autonomia.
