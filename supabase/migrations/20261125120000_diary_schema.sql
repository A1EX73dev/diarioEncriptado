-- =============================================================================
-- Diario cifrado · esquema v1
--
-- El servidor solo guarda texto cifrado y parámetros públicos. Las
-- restricciones CHECK replican los esquemas zod de `src/lib/crypto`: si el
-- servidor de Next.js tuviera un fallo de validación, la base de datos seguiría
-- rechazando formatos inválidos (aunque nunca puede comprobar el contenido).
--
-- Defensa en profundidad:
--   1. Privilegios mínimos: se revoca todo y se concede solo lo necesario,
--      incluso por columna (no se puede cambiar `id`, `user_id` ni `created_at`).
--   2. Row Level Security: cada usuario solo ve y modifica sus propias filas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Esquema privado: no lo expone la API de datos (PostgREST).
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- keyrings: material de claves por usuario (DEK envuelta dos veces).
-- -----------------------------------------------------------------------------
create table public.keyrings (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  format_version        smallint not null check (format_version = 1),
  -- Parámetros de Argon2id (mismos límites que KDF_LIMITS en kdf.ts).
  kdf_algorithm         text not null check (kdf_algorithm = 'argon2id'),
  kdf_memory_kib        integer not null check (kdf_memory_kib between 19456 and 262144),
  kdf_iterations        integer not null check (kdf_iterations between 2 and 10),
  kdf_parallelism       integer not null check (kdf_parallelism between 1 and 4),
  -- Binarios en base64url sin relleno: sal 16 B → 22, IV 12 B → 16, DEK envuelta 48 B → 64.
  kdf_salt              text not null check (kdf_salt ~ '^[A-Za-z0-9_-]{22}$'),
  pass_wrap_iv          text not null check (pass_wrap_iv ~ '^[A-Za-z0-9_-]{16}$'),
  pass_wrapped_dek      text not null check (pass_wrapped_dek ~ '^[A-Za-z0-9_-]{64}$'),
  recovery_wrap_iv      text not null check (recovery_wrap_iv ~ '^[A-Za-z0-9_-]{16}$'),
  recovery_wrapped_dek  text not null check (recovery_wrapped_dek ~ '^[A-Za-z0-9_-]{64}$'),
  recovery_created_at   timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.keyrings is
  'DEK del diario envuelta con la KEK de la frase (Argon2id) y con la de recuperación (HKDF). Nunca contiene claves en claro.';

create or replace function private.keyrings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.recovery_wrapped_dek is distinct from old.recovery_wrapped_dek then
    new.recovery_created_at := now();
  end if;
  return new;
end;
$$;

create trigger keyrings_touch
before update on public.keyrings
for each row execute function private.keyrings_touch();

-- -----------------------------------------------------------------------------
-- entries: entradas cifradas.
-- -----------------------------------------------------------------------------
create table public.entries (
  -- Lo genera el cliente antes de cifrar, porque forma parte del AAD.
  id                uuid primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Metadato visible: necesario para la lista bloqueada y el calendario.
  entry_date        date not null check (entry_date between date '1900-01-01' and date '2999-12-31'),
  format_version    smallint not null check (format_version = 1),
  iv                text not null check (iv ~ '^[A-Za-z0-9_-]{16}$'),
  -- Bloque = n·512 bytes de texto rellenado + 16 de etiqueta, entre 528 B y 192 KiB + 16 B.
  -- Con b = bytes decodificados, la longitud base64url exacta es ceil(4b/3) = (4b + 2) / 3.
  ciphertext        text not null check (
                      char_length(ciphertext) between 704 and 262166
                      and ciphertext ~ '^[A-Za-z0-9_-]+$'
                      and ((char_length(ciphertext) * 3 / 4) - 16) % 512 = 0
                      and char_length(ciphertext) = (4 * (char_length(ciphertext) * 3 / 4) + 2) / 3
                    ),
  ciphertext_bytes  integer generated always as (char_length(ciphertext) * 3 / 4) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.entries is
  'Entradas cifradas con AES-256-GCM en el navegador. AAD = dominio|entry|v1|user_id|id.';

create index entries_user_date_idx on public.entries (user_id, entry_date desc, created_at desc);

create trigger entries_set_updated_at
before update on public.entries
for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Privilegios mínimos.
-- -----------------------------------------------------------------------------
revoke all on table public.keyrings, public.entries from public, anon, authenticated, service_role;

grant select on table public.keyrings to authenticated;
grant insert (
  user_id, format_version,
  kdf_algorithm, kdf_memory_kib, kdf_iterations, kdf_parallelism, kdf_salt,
  pass_wrap_iv, pass_wrapped_dek, recovery_wrap_iv, recovery_wrapped_dek
) on table public.keyrings to authenticated;
-- Cambiar la frase o regenerar la clave de recuperación = actualizar estas columnas.
grant update (
  format_version,
  kdf_algorithm, kdf_memory_kib, kdf_iterations, kdf_parallelism, kdf_salt,
  pass_wrap_iv, pass_wrapped_dek, recovery_wrap_iv, recovery_wrapped_dek
) on table public.keyrings to authenticated;
-- Sin DELETE: el llavero se borra en cascada al borrar la cuenta.

grant select, delete on table public.entries to authenticated;
grant insert (id, user_id, entry_date, format_version, iv, ciphertext) on table public.entries to authenticated;
grant update (entry_date, format_version, iv, ciphertext) on table public.entries to authenticated;

-- service_role (solo en el servidor) puede leer para tareas administrativas y tests
-- de "ningún texto en claro". El borrado de cuentas va por la API de Auth (cascada).
grant select on table public.keyrings, public.entries to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security.
-- `(select auth.uid())` se evalúa una vez por consulta, no por fila.
-- -----------------------------------------------------------------------------
alter table public.keyrings enable row level security;
alter table public.keyrings force row level security;
alter table public.entries enable row level security;
alter table public.entries force row level security;

create policy keyrings_select_own on public.keyrings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy keyrings_insert_own on public.keyrings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy keyrings_update_own on public.keyrings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy entries_select_own on public.entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy entries_insert_own on public.entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy entries_update_own on public.entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy entries_delete_own on public.entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);
