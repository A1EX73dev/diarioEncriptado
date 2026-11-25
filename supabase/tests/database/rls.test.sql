-- =============================================================================
-- Tests de Row Level Security y privilegios (pgTAP).
-- Ejecutar con: npm run test:db   (supabase test db)
--
-- Dos usuarias, Ana y Bea. Se comprueba que Bea no puede leer, modificar,
-- borrar ni suplantar datos de Ana, que `anon` no tiene acceso y que la base
-- de datos rechaza formatos inválidos aunque el servidor fallara al validarlos.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- --- Estructura ---------------------------------------------------------------
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.keyrings'::regclass),
  'RLS activado y forzado en keyrings'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.entries'::regclass),
  'RLS activado y forzado en entries'
);
select policies_are('public', 'keyrings',
  array['keyrings_select_own', 'keyrings_insert_own', 'keyrings_update_own'],
  'keyrings solo tiene las políticas esperadas (sin DELETE)');
select policies_are('public', 'entries',
  array['entries_select_own', 'entries_insert_own', 'entries_update_own', 'entries_delete_own'],
  'entries solo tiene las políticas esperadas');

-- --- Datos de prueba ----------------------------------------------------------
insert into auth.users (id, email, aud, role, instance_id) values
  ('11111111-1111-4111-8111-111111111111', 'ana@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-4222-8222-222222222222', 'bea@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- --- Como Ana -----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$
  insert into public.keyrings (user_id, format_version, kdf_algorithm, kdf_memory_kib, kdf_iterations,
    kdf_parallelism, kdf_salt, pass_wrap_iv, pass_wrapped_dek, recovery_wrap_iv, recovery_wrapped_dek)
  values ('11111111-1111-4111-8111-111111111111', 1, 'argon2id', 65536, 3, 1,
    repeat('s', 22), repeat('i', 16), repeat('w', 64), repeat('j', 16), repeat('r', 64))
$$, 'Ana crea su llavero');

select lives_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    '2026-11-01', 1, repeat('i', 16), repeat('A', 704))
$$, 'Ana crea una entrada');

select is((select count(*)::int from public.entries), 1, 'Ana ve su entrada');
select is((select ciphertext_bytes from public.entries), 528, 'ciphertext_bytes se calcula en la base de datos');

select throws_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
    '2026-11-01', 1, repeat('i', 16), repeat('A', 704))
$$, '42501', null, 'Ana no puede crear entradas a nombre de Bea');

select throws_ok($$ update public.entries set user_id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'no se puede cambiar el user_id de una entrada');
select throws_ok($$ update public.entries set id = gen_random_uuid() $$,
  '42501', null, 'no se puede cambiar el id de una entrada (forma parte del AAD)');
select throws_ok($$ update public.entries set created_at = now() - interval '1 year' $$,
  '42501', null, 'no se puede falsear created_at');
select throws_ok($$ update public.keyrings set user_id = '22222222-2222-4222-8222-222222222222' $$,
  '42501', null, 'no se puede cambiar el dueño del llavero');
select throws_ok($$ delete from public.keyrings $$,
  '42501', null, 'el llavero no se puede borrar directamente');

select lives_ok($$ update public.entries set entry_date = '2026-11-02', iv = repeat('k', 16) $$,
  'Ana puede editar su entrada');

-- Formato: la base de datos rechaza lo que no sea un bloque cifrado válido.
select throws_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '2026-11-01', 1, repeat('i', 16),
    'Querido diario: hoy...')
$$, '23514', null, 'rechaza texto que no es un bloque cifrado');
select throws_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '2026-11-01', 1, repeat('i', 16), repeat('A', 705))
$$, '23514', null, 'rechaza longitudes base64url imposibles');
select throws_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '2026-11-01', 1, repeat('i', 16), repeat('A', 1386))
$$, '23514', null, 'rechaza bloques que no son n·512 + 16 bytes');
select throws_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '2026-11-01', 1, 'corto', repeat('A', 704))
$$, '23514', null, 'rechaza IV de tamaño incorrecto');
select throws_ok($$
  insert into public.entries (id, user_id, entry_date, format_version, iv, ciphertext)
  values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '2026-11-01', 2, repeat('i', 16), repeat('A', 704))
$$, '23514', null, 'rechaza versiones de formato desconocidas');
select throws_ok($$ update public.keyrings set kdf_memory_kib = 1024 $$,
  '23514', null, 'rechaza parámetros de Argon2id por debajo del mínimo');

-- --- Como Bea -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is_empty($$ select * from public.entries $$, 'Bea no ve las entradas de Ana');
select is_empty($$ select * from public.keyrings $$, 'Bea no ve el llavero de Ana');
select is_empty($$ update public.entries set entry_date = '2000-01-01' returning id $$,
  'Bea no puede modificar las entradas de Ana');
select is_empty($$ delete from public.entries returning id $$,
  'Bea no puede borrar las entradas de Ana');
select is_empty($$ update public.keyrings set pass_wrapped_dek = repeat('x', 64) returning user_id $$,
  'Bea no puede sustituir el llavero de Ana');
select throws_ok($$
  insert into public.keyrings (user_id, format_version, kdf_algorithm, kdf_memory_kib, kdf_iterations,
    kdf_parallelism, kdf_salt, pass_wrap_iv, pass_wrapped_dek, recovery_wrap_iv, recovery_wrapped_dek)
  values ('11111111-1111-4111-8111-111111111111', 1, 'argon2id', 65536, 3, 1,
    repeat('s', 22), repeat('i', 16), repeat('w', 64), repeat('j', 16), repeat('r', 64))
$$, '42501', null, 'Bea no puede crear un llavero a nombre de Ana');

-- --- Como anon ----------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.entries $$, '42501', null, 'anon no puede leer entries');
select throws_ok($$ select * from public.keyrings $$, '42501', null, 'anon no puede leer keyrings');

-- --- Comprobación final (como postgres) --------------------------------------
reset role;
select is((select count(*)::int from public.entries where user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'la entrada de Ana sigue existiendo');
select is((select entry_date from public.entries where user_id = '11111111-1111-4111-8111-111111111111'),
  date '2026-11-02', 'la entrada de Ana conserva su fecha');
select is((select pass_wrapped_dek from public.keyrings where user_id = '11111111-1111-4111-8111-111111111111'),
  repeat('w', 64), 'el llavero de Ana no ha cambiado');

-- --- Borrado de cuenta (RGPD) -------------------------------------------------
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.entries where user_id = '11111111-1111-4111-8111-111111111111'), 0,
  'borrar la cuenta borra sus entradas');
select is((select count(*)::int from public.keyrings where user_id = '11111111-1111-4111-8111-111111111111'), 0,
  'borrar la cuenta borra su llavero');

select * from finish();
rollback;
