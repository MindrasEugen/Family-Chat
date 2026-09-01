-- =========================================================
-- DB.sql — Setup Supabase per Chat Famiglia
-- Esegui questo file nel SQL Editor del progetto Supabase.
-- =========================================================

-- Estensione necessaria per generare UUID (già abilitata di default
-- sulla maggior parte dei progetti Supabase, ma la richiediamo per sicurezza).
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- Tabella messages
-- ---------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text,
  image_path text,
  device_name text,
  created_at timestamptz not null default now(),
  constraint messages_content_or_image_present check (content is not null or image_path is not null)
);

-- Colonna aggiunta in un secondo momento (dispositivi già esistenti prima di
-- questa modifica avranno righe con device_name null, gestito lato client):
-- alter table public.messages add column if not exists device_name text;

-- ---------------------------------------------------------
-- Row Level Security — messages
-- ---------------------------------------------------------
alter table public.messages enable row level security;

-- Necessario perché gli eventi realtime di DELETE includano tutte le colonne
-- della riga eliminata (di default includono solo la primary key): il channel
-- filtra per user_id, che altrimenti non sarebbe presente nel payload "old"
-- e il filtro non farebbe mai match.
alter table public.messages replica identity full;

-- Ogni utente vede solo i propri messaggi
-- (select auth.uid()) invece di auth.uid() diretto: evita che Postgres
-- rivaluti la funzione per ogni riga, migliorando le performance su tabelle grandi
create policy "messages_select_own"
on public.messages
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Ogni utente può inserire solo messaggi associati a se stesso
create policy "messages_insert_own"
on public.messages
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Ogni utente può eliminare solo i propri messaggi
create policy "messages_delete_own"
on public.messages
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Nota: non viene creata nessuna policy di UPDATE.
-- Con RLS abilitata, l'assenza della policy blocca di default
-- ogni modifica, in linea con il requisito "no modifica".

-- Indice sulla foreign key user_id: senza questo indice le query filtrate
-- per utente (comprese le policy RLS sopra) risultano più lente su tabelle grandi
create index if not exists messages_user_id_idx on public.messages (user_id);

-- ---------------------------------------------------------
-- Realtime — messages
-- ---------------------------------------------------------
-- Aggiunge la tabella alla pubblicazione realtime di Supabase,
-- necessaria affinché il client possa sottoscriversi ai
-- cambiamenti (INSERT/DELETE) tramite un channel.
-- Se la tabella è già presente nella pubblicazione, questo comando
-- darà errore "relation already member of publication": in tal caso
-- puoi ignorarlo o rimuovere questa riga.
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------
-- Storage — bucket foto chat
-- ---------------------------------------------------------
-- Bucket privato: le foto non sono raggiungibili da un URL pubblico diretto,
-- il client deve generare una signed URL (createSignedUrl) per visualizzarle.
insert into storage.buckets (id, name, public)
values ('chat-photos', 'chat-photos', false)
on conflict (id) do nothing;

-- Convenzione dei percorsi: "<user_id>/<nome-file>". Le policy sotto usano
-- storage.foldername(name) per estrarre lo user_id dal primo segmento del path
-- e verificare che corrisponda all'utente autenticato.
create policy "chat_photos_select_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'chat-photos' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "chat_photos_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-photos' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy "chat_photos_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'chat-photos' and (select auth.uid())::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------
-- Nota: pulizia automatica messaggi oltre 30 giorni
-- ---------------------------------------------------------
-- Non gestita qui via pg_cron: richiederebbe la service_role key per
-- eliminare anche i file su Storage (le policy RLS sopra valgono solo per
-- utenti autenticati, non per un job schedulato senza sessione). Viene
-- gestita invece lato client in app.js (funzione cleanupOldMessages),
-- eseguita ad ogni apertura dell'app con la sessione dell'utente già
-- autenticato, sfruttando le stesse policy RLS di sopra.

-- ---------------------------------------------------------
-- Nota migrazione: la vecchia tabella "todos" (versione precedente
-- dell'app, to-do list) non viene toccata da questo script e resta
-- nel database inutilizzata. Se vuoi rimuoverla manualmente:
--   drop table if exists public.todos;
-- ---------------------------------------------------------
