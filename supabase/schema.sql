-- =====================================================================================================
-- Hémicycle France : comptes des visiteurs (Supabase)
-- À coller UNE FOIS dans Supabase → SQL Editor → New query → Run. Peut être relancé sans risque.
-- Données conservées : l'e-mail (géré par Supabase Auth) et les préférences de l'utilisateur
-- (député ou groupe suivi, historique du quiz, favoris). Rien d'autre : aucun suivi, aucun cookie.
-- =====================================================================================================

-- 1. Table des préférences : une seule ligne par utilisateur.
create table if not exists public.profils (
  user_id     uuid primary key references auth.users (id) on delete cascade,  -- compte supprimé = ligne supprimée
  donnees     jsonb not null default '{}'::jsonb,                             -- préférences (voir compte-client.js)
  mis_a_jour  timestamptz not null default now(),
  constraint profils_donnees_taille check (octet_length(donnees::text) <= 20000),
  constraint profils_donnees_objet  check (jsonb_typeof(donnees) = 'object')
);

comment on table public.profils is 'Préférences des visiteurs connectés (Hémicycle France). Une ligne par utilisateur, protégée par Row Level Security.';

-- 2. Date de mise à jour fixée par le serveur (le navigateur ne peut pas la falsifier).
create or replace function public.profils_horodater() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.mis_a_jour := now();
  return new;
end $$;

drop trigger if exists profils_horodater on public.profils;
create trigger profils_horodater before insert or update on public.profils
  for each row execute function public.profils_horodater();

-- 3. Row Level Security : chacun ne lit et n'écrit que SA ligne. Le visiteur anonyme n'a accès à rien.
alter table public.profils enable row level security;
alter table public.profils force row level security;

drop policy if exists "profils_lecture"      on public.profils;
drop policy if exists "profils_creation"     on public.profils;
drop policy if exists "profils_modification" on public.profils;
drop policy if exists "profils_suppression"  on public.profils;

create policy "profils_lecture"      on public.profils for select to authenticated using      ((select auth.uid()) = user_id);
create policy "profils_creation"     on public.profils for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profils_modification" on public.profils for update to authenticated using      ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profils_suppression"  on public.profils for delete to authenticated using      ((select auth.uid()) = user_id);

revoke all on public.profils from anon, public;
grant select, insert, update, delete on public.profils to authenticated;

-- 4. Droit à l'effacement en libre-service : supprime le compte de l'appelant (auth.users), et le profil avec lui (cascade).
--    « security definer » : la fonction s'exécute avec les droits de son propriétaire, car un utilisateur ne peut pas
--    supprimer lui-même sa ligne dans auth.users. Elle ne touche JAMAIS qu'à auth.uid(), l'identité vérifiée par le jeton.
create or replace function public.supprimer_mon_compte() returns void
language plpgsql security definer set search_path = '' as $$
declare
  demandeur uuid := auth.uid();
begin
  if demandeur is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  delete from auth.users where id = demandeur;
end $$;

revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- 5. Comptes inactifs supprimés après 24 mois (promesse faite dans les mentions légales).
--    Utilise l'extension pg_cron, disponible sur l'offre gratuite. Une tâche quotidienne supprime les comptes
--    sans connexion ni mise à jour des préférences depuis 24 mois (la suppression emporte les préférences).
--    Si l'extension ne peut pas être activée, ce bloc affiche un avertissement : suivre docs/COMPTES.md,
--    étape « Comptes inactifs », sinon retirer la phrase correspondante des mentions légales.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'hemicycle-comptes-inactifs';
  perform cron.schedule(
    'hemicycle-comptes-inactifs', '17 3 * * *',
    $job$
      delete from auth.users u
      where greatest(
              coalesce(u.last_sign_in_at, u.created_at),
              u.created_at,
              coalesce((select p.mis_a_jour from public.profils p where p.user_id = u.id), u.created_at)
            ) < now() - interval '24 months'
    $job$);
exception when others then
  raise warning 'Purge des comptes inactifs non planifiée (%). Voir docs/COMPTES.md.', sqlerrm;
end $$;
