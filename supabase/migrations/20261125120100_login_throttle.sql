-- =============================================================================
-- Limitador de intentos de inicio de sesión.
--
-- Por qué existe: el login pasa por el servidor de Next.js, así que Supabase
-- Auth ve la IP del servidor (Vercel) y no la del usuario; sus límites por IP
-- acabarían siendo globales. Este limitador cuenta fallos por correo y por IP.
--
-- Privacidad: no se guardan ni correos ni IPs, solo HMAC-SHA256 calculados en
-- el servidor con un secreto (LOGIN_THROTTLE_SECRET). Las filas caducan en 24 h.
--
-- En lugar de un bloqueo duro (que permitiría a cualquiera bloquear la cuenta
-- de otra persona) se aplica una espera exponencial a partir de N fallos.
--
-- Solo `service_role` (servidor) puede ejecutar estas funciones.
-- =============================================================================

create table private.login_failures (
  key_hash      text not null check (key_hash ~ '^(email|ip):[0-9a-f]{64}$'),
  failed_at     timestamptz not null default now()
);

create index login_failures_key_idx on private.login_failures (key_hash, failed_at desc);
create index login_failures_failed_at_idx on private.login_failures (failed_at);

alter table private.login_failures enable row level security;
revoke all on table private.login_failures from public, anon, authenticated, service_role;

-- Segundos de espera para una clave según sus fallos en los últimos 15 minutos.
-- A partir de `p_threshold` fallos: 15 s, 30 s, 60 s… hasta 15 minutos.
create or replace function private.login_wait_seconds(p_key text, p_threshold integer)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_failures integer;
  v_last timestamptz;
  v_penalty double precision;
begin
  select count(*), max(failed_at)
    into v_failures, v_last
    from private.login_failures
   where key_hash = p_key
     and failed_at > now() - interval '15 minutes';

  if v_failures < p_threshold then
    return 0;
  end if;

  v_penalty := least(900, 15 * power(2, least(v_failures - p_threshold, 10)));
  return greatest(0, ceil(extract(epoch from (v_last + make_interval(secs => v_penalty) - now())))::integer);
end;
$$;

create or replace function public.login_retry_after(p_email_key text, p_ip_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return greatest(
    private.login_wait_seconds(p_email_key, 5),
    private.login_wait_seconds(p_ip_key, 20)
  );
end;
$$;

create or replace function public.login_record_failure(p_email_key text, p_ip_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.login_failures (key_hash) values (p_email_key), (p_ip_key);
  delete from private.login_failures where failed_at < now() - interval '24 hours';
end;
$$;

-- Tras un login correcto se olvidan los fallos de ese correo (no los de la IP).
create or replace function public.login_clear_failures(p_email_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.login_failures where key_hash = p_email_key;
end;
$$;

revoke all on function private.login_wait_seconds(text, integer) from public, anon, authenticated;
revoke all on function public.login_retry_after(text, text) from public, anon, authenticated;
revoke all on function public.login_record_failure(text, text) from public, anon, authenticated;
revoke all on function public.login_clear_failures(text) from public, anon, authenticated;

grant execute on function public.login_retry_after(text, text) to service_role;
grant execute on function public.login_record_failure(text, text) to service_role;
grant execute on function public.login_clear_failures(text) to service_role;
