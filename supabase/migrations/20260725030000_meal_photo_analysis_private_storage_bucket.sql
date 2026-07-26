-- MI-E-C1: private Storage bucket candidate for meal-photo AI analysis uploads. Forward-only.
-- No public bucket, no public URL flow, no anon access. Cross-user access is prevented by
-- requiring the first path segment of every object to equal the authenticated caller's auth.uid()
-- — never a client-supplied user ID. storage.objects ships with row level security enabled by
-- default in Supabase and carries no policies until explicitly added, so the absence of any
-- policy matching a given role/row already denies access; the policies below are the explicit,
-- directly-auditable statement of that intent for the authenticated role only.
--
-- This migration does not upload any image, does not create an Edge Function, and does not grant
-- any access beyond the authenticated owner of a given path prefix. No UPDATE policy is created:
-- this pipeline's objects are immutable once written (a re-analysis gets a new
-- analysis_request_id and therefore a new path), so UPDATE fails closed rather than being opened
-- without a concrete need.
--
-- MI-E-C1-R1: this migration previously used ON CONFLICT (id) DO NOTHING on the bucket insert.
-- That was wrong — if a bucket with this id already existed with an unsafe configuration (e.g.
-- public = true, from some prior manual/out-of-band creation), DO NOTHING would let this
-- migration report success while leaving that unsafe configuration untouched. ON CONFLICT DO
-- UPDATE below instead unconditionally re-asserts every security-relevant setting every time this
-- migration runs, so the migration itself fails closed rather than silently trusting whatever was
-- already there.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-analysis-photos',
  'meal-analysis-photos',
  false,
  10485760, -- 10 MB: a reasonable ceiling for a single compressed phone photo; not a measured/benchmarked limit
  array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path contract: {auth.uid()}/{analysis_request_id}/original.{ext} — the first path
-- segment is the owning user's auth.uid(), which is exactly what storage.foldername(name) index 1
-- extracts below. This is the same convention documented on meal_analyses.image_object_ref (see
-- the companion additive-columns migration) and formalized as
-- buildMealPhotoAnalysisObjectPath() in packages/shared/src/domain/meal-photo-analysis/types.ts.
--
-- MI-E-C1-R2: each policy below now also requires segment 2 (the analysis_request_id folder) to
-- exist and be non-empty — a path containing only a user-ID folder and a bare filename (i.e. no
-- analysis-request folder at all) no longer satisfies any policy. This still deliberately does
-- NOT validate that segment 2 is a well-formed UUID via a regex cast in the policy itself — that
-- kind of string validation inside an RLS policy is fragile and easy to get subtly wrong. A
-- malformed (but present and non-empty) second segment still cannot grant access to another
-- user's objects regardless, since segment 1 always has to equal auth.uid() first. Real
-- UUID-format validation, canonical-filename validation, and re-validating the path against the
-- authenticated actor MUST be enforced as required request-validation steps in the future Edge
-- Function once one exists — no Edge Function is created this round. The object reference Mobile
-- sends in a request body must never be trusted by the server as-is; the server must always
-- re-derive/re-check it against the caller's own verified auth.uid().

create policy meal_analysis_photos_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'meal-analysis-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] is not null
    and (storage.foldername(name))[2] <> ''
  );

create policy meal_analysis_photos_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'meal-analysis-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] is not null
    and (storage.foldername(name))[2] <> ''
  );

create policy meal_analysis_photos_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'meal-analysis-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] is not null
    and (storage.foldername(name))[2] <> ''
  );

-- No policy is created for anon on this bucket, and no policy is created for UPDATE on any role —
-- both fail closed by the absence of a matching policy under row level security.
