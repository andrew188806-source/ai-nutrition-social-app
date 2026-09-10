begin;

-- RA-2I-P2-R1: close the canonical-storage gap proven during P2 Development acceptance.
-- The frozen P2 host-allowlist check lower()'d the submitted host before comparing it against
-- the (already-lowercase) allowlist, so a case-variant but allowlist-matching host (for example
-- "https://INSTAGRAM.com/x") passed validation and was stored verbatim, uncanonicalized. Scheme
-- case was already closed by the pre-existing case-sensitive `left(p_url,8)='https://'` check;
-- only the host comparison was lenient. This function is composed into the table CHECK
-- constraint, both RLS INSERT/UPDATE policies, and the mutation RPC's own pre-check, so replacing
-- it closes the gap at every enforcement layer -- not just the RPC -- without reimplementing any
-- WHATWG URL parsing: the fix is a single removed lower() call, requiring the host exactly as
-- submitted to already equal one of the fixed lowercase allowlist entries.

create or replace function restaurant_internal.restaurant_public_social_link_url_allowed_v1(
  p_provider text,p_url text
) returns boolean language sql immutable strict set search_path='' as $$
  select p_provider in ('instagram','facebook','line','threads','tiktok','youtube')
    and p_url=pg_catalog.btrim(p_url)
    and pg_catalog.char_length(p_url) between 1 and 2048
    and p_url !~ '[\x00-\x1F\x7F-\x9F]'
    and p_url !~ '[[:space:]]'
    and pg_catalog.left(p_url,8)='https://'
    and pg_catalog.split_part(
      pg_catalog.split_part(pg_catalog.split_part(pg_catalog.substring(p_url, 9), '/', 1), '?', 1),
      '#',1
    ) !~ '@'
    and pg_catalog.split_part(
      pg_catalog.split_part(
        pg_catalog.split_part(pg_catalog.split_part(pg_catalog.substring(p_url, 9), '/', 1), '?', 1),
        '#',1
      ),':',1
    )=any(case p_provider
      when 'instagram' then array['instagram.com','www.instagram.com']
      when 'facebook' then array['facebook.com','www.facebook.com']
      when 'line' then array['line.me','www.line.me','page.line.me','lin.ee']
      when 'threads' then array['threads.net','www.threads.net']
      when 'tiktok' then array['tiktok.com','www.tiktok.com']
      when 'youtube' then array['youtube.com','www.youtube.com']
      else array[]::text[]
    end);
$$;

do $$
declare v_bad boolean;v_good boolean;v_owner text;v_execute_grantee boolean;
begin
  select restaurant_internal.restaurant_public_social_link_url_allowed_v1('instagram','https://INSTAGRAM.com/x')
    into v_bad;
  if v_bad then
    raise exception 'RA-2I-P2-R1: case-variant host still passes canonical validation';
  end if;
  select restaurant_internal.restaurant_public_social_link_url_allowed_v1('instagram','https://instagram.com/x')
    into v_good;
  if not v_good then
    raise exception 'RA-2I-P2-R1: canonical host was wrongly rejected';
  end if;
  select restaurant_internal.restaurant_public_social_link_url_allowed_v1('instagram','HTTPS://instagram.com/x')
    into v_bad;
  if v_bad then
    raise exception 'RA-2I-P2-R1: case-variant scheme still passes canonical validation';
  end if;

  select pg_catalog.has_function_privilege(
    'restaurant_owner_public_social_links_write_authority',
    'restaurant_internal.restaurant_public_social_link_url_allowed_v1(text,text)', 'EXECUTE'
  ) into v_execute_grantee;
  if not v_execute_grantee then
    raise exception 'RA-2I-P2-R1: sealed writer lost EXECUTE on the replaced validator';
  end if;
end
$$;

commit;
