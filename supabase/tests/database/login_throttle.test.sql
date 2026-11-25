-- =============================================================================
-- Tests del limitador de intentos de login (pgTAP).
-- Nota: dentro de una transacción now() es constante, así que la espera
-- calculada tras el último fallo es exactamente la penalización.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Claves de prueba (en la app son HMAC-SHA256 calculados en el servidor).
create temp table k as select
  'email:' || repeat('a', 64) as email_a,
  'email:' || repeat('b', 64) as email_b,
  'ip:'    || repeat('c', 64) as ip;
grant select on k to service_role, anon, authenticated;

-- --- Permisos -----------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.login_retry_after((select email_a from k), (select ip from k)) $$,
  '42501', null, 'anon no puede consultar el limitador');
select throws_ok($$ select public.login_record_failure((select email_a from k), (select ip from k)) $$,
  '42501', null, 'anon no puede registrar fallos');
reset role;
set local role authenticated;
select throws_ok($$ select public.login_clear_failures((select email_a from k)) $$,
  '42501', null, 'authenticated no puede borrar fallos');
reset role;

set local role service_role;
select throws_ok($$ select * from private.login_failures $$,
  '42501', null, 'ni siquiera service_role lee la tabla directamente');

-- --- Lógica -------------------------------------------------------------------
select is(public.login_retry_after((select email_a from k), (select ip from k)), 0, 'sin fallos no hay espera');

select public.login_record_failure((select email_a from k), (select ip from k)) from generate_series(1, 4);
select is(public.login_retry_after((select email_a from k), (select ip from k)), 0, '4 fallos: aún sin espera');

select public.login_record_failure((select email_a from k), (select ip from k));
select is(public.login_retry_after((select email_a from k), (select ip from k)), 15, '5 fallos: espera de 15 s');

select public.login_record_failure((select email_a from k), (select ip from k));
select is(public.login_retry_after((select email_a from k), (select ip from k)), 30, '6 fallos: la espera se duplica');

select is(public.login_retry_after((select email_b from k), (select ip from k)), 0,
  'otro correo desde la misma IP no queda afectado (umbral por IP más alto)');

select public.login_clear_failures((select email_a from k));
select is(public.login_retry_after((select email_a from k), 'ip:' || repeat('d', 64)), 0,
  'un login correcto borra los fallos de ese correo');

select public.login_record_failure('email:' || lpad(i::text, 64, '0'), (select ip from k)) from generate_series(1, 14) as i;
select ok(public.login_retry_after((select email_b from k), (select ip from k)) > 0,
  '20 fallos desde una IP: espera también para otros correos');

select throws_ok($$ select public.login_record_failure('maria@example.test', 'ip:' || repeat('c', 64)) $$,
  '23514', null, 'rechaza claves que no son hashes (no se guardan correos en claro)');

reset role;
select * from finish();
rollback;
