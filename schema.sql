-- ============================================================
-- Ejecuta esto en Supabase → SQL Editor
-- ============================================================

-- Tabla que guarda cada archivo subido
create table if not exists public.files (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

alter table public.files enable row level security;

-- Cualquiera puede ver los metadatos de un archivo si tiene el enlace (id)
create policy "files_select_all"
  on public.files for select
  using (true);

-- Cualquiera (con o sin cuenta) puede registrar un archivo que subió
create policy "files_insert_any"
  on public.files for insert
  with check (true);

-- Solo el dueño puede borrar sus propios archivos
create policy "files_delete_owner"
  on public.files for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Bucket de almacenamiento
-- (también puedes crearlo desde Storage → New bucket, nombre: dropzone, público)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('dropzone', 'dropzone', true, 1073741824) -- 1 GB en bytes
on conflict (id) do nothing;

-- Cualquiera puede leer los archivos del bucket (para que el enlace público funcione)
create policy "dropzone_public_read"
  on storage.objects for select
  using (bucket_id = 'dropzone');

-- Cualquiera puede subir archivos al bucket (con o sin sesión)
create policy "dropzone_public_insert"
  on storage.objects for insert
  with check (bucket_id = 'dropzone');

-- Solo el dueño del objeto puede borrarlo
create policy "dropzone_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'dropzone' and auth.uid() = owner);
