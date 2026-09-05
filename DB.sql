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
-- Tabella push_subscriptions — Web Push (notifiche a schermo spento)
-- ---------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_name text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Necessaria per l'upsert (onConflict su "endpoint") che il client esegue
-- per rinnovare una sottoscrizione push già esistente.
create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------
-- Database Webhook: invio Web Push su ogni nuovo messaggio
-- ---------------------------------------------------------
-- Configurato dal dashboard Supabase (Database → Webhooks) e non da questo
-- file, perché richiede di incorporare un segreto (x-webhook-secret) in
-- chiaro nella query — evitato qui per prudenza. Riportato come
-- riferimento se preferisci crearlo via SQL Editor invece che da UI
-- (sostituisci <SEGRETO> con il valore di PUSH_WEBHOOK_SECRET):
--
-- create trigger on_message_insert_send_push
-- after insert on public.messages
-- for each row
-- execute function supabase_functions.http_request(
--   'https://qamvkevkddfwyxhbftoy.supabase.co/functions/v1/send-push',
--   'POST',
--   '{"Content-Type":"application/json","x-webhook-secret":"<SEGRETO>"}',
--   '{}',
--   '5000'
-- );

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

-- ---------------------------------------------------------
-- Migrazione multi-camera: push_subscriptions per (endpoint, user_id)
-- ---------------------------------------------------------
-- Un solo browser/service worker ha un solo endpoint push, condiviso da
-- tutte le "camere" (account) loggate sullo stesso device. Il vincolo
-- UNIQUE era finora solo su endpoint: va ampliato a (endpoint, user_id)
-- per permettere una riga per ciascuna camera che registra lo stesso
-- endpoint. Nessuna riga esistente diventa orfana: oggi ogni endpoint
-- compare già una sola volta, quindi soddisfa banalmente anche il nuovo
-- vincolo composito.
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'push_subscriptions'
    and con.contype = 'u'
    and con.conkey = (
      select array_agg(attnum) from pg_attribute
      where attrelid = rel.oid and attname = 'endpoint'
    );
  if cname is not null then
    execute format('alter table public.push_subscriptions drop constraint %I', cname);
  end if;
end $$;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_user_id_key unique (endpoint, user_id);

-- ---------------------------------------------------------
-- Fix: niente più notifica push a chi ha appena inviato il messaggio
-- ---------------------------------------------------------
-- send-push filtra push_subscriptions solo per user_id ("camera"): con più
-- dispositivi sulla stessa camera, chi scrive riceveva anche la push del
-- proprio messaggio. sender_endpoint registra l'endpoint push del
-- dispositivo mittente al momento dell'invio (app.js), così send-push può
-- escluderlo dai destinatari. Nullable: resta null se il mittente non ha
-- notifiche attive in quel momento (send-push allora non esclude nessuno).
alter table public.messages add column if not exists sender_endpoint text;
