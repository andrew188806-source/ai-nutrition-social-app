BEGIN;

-- Phase 2V-B creates only the restaurant membership authorization foundation.
-- Existing restaurant, branch, menu, nutrition, view, policy, and grant objects
-- are intentionally left unchanged.

CREATE TABLE public.restaurant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  login_status text NOT NULL DEFAULT 'enabled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_users_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT restaurant_users_auth_user_id_fkey
    FOREIGN KEY (auth_user_id)
    REFERENCES auth.users(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT restaurant_users_login_status_check
    CHECK (login_status IN ('enabled', 'disabled'))
);

CREATE TABLE public.restaurant_roles (
  id uuid PRIMARY KEY,
  role_key text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_roles_role_key_key UNIQUE (role_key),
  CONSTRAINT restaurant_roles_role_key_check
    CHECK (role_key IN ('owner', 'manager', 'staff')),
  CONSTRAINT restaurant_roles_status_check
    CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL,
  permission_key text NOT NULL,
  permission_scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_pkey
    PRIMARY KEY (role_id, permission_key, permission_scope),
  CONSTRAINT role_permissions_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES public.restaurant_roles(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT role_permissions_permission_key_check
    CHECK (permission_key IN (
      'access_context.read',
      'restaurant.read',
      'branch.read',
      'menu.read',
      'nutrition.read'
    )),
  CONSTRAINT role_permissions_permission_scope_check
    CHECK (permission_scope IN ('self', 'restaurant', 'branch'))
);

CREATE TABLE public.restaurant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_user_id uuid NOT NULL,
  restaurant_id text NOT NULL,
  role_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_memberships_user_restaurant_key
    UNIQUE (restaurant_user_id, restaurant_id),
  CONSTRAINT restaurant_memberships_restaurant_user_id_fkey
    FOREIGN KEY (restaurant_user_id)
    REFERENCES public.restaurant_users(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT restaurant_memberships_restaurant_id_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT restaurant_memberships_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES public.restaurant_roles(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT restaurant_memberships_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'revoked'))
);

CREATE TABLE public.restaurant_membership_branch_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  branch_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_membership_branch_scopes_membership_branch_key
    UNIQUE (membership_id, branch_id),
  CONSTRAINT restaurant_membership_branch_scopes_membership_id_fkey
    FOREIGN KEY (membership_id)
    REFERENCES public.restaurant_memberships(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT restaurant_membership_branch_scopes_branch_id_fkey
    FOREIGN KEY (branch_id)
    REFERENCES public.restaurant_branches(id)
    ON UPDATE RESTRICT
    ON DELETE CASCADE,
  CONSTRAINT restaurant_membership_branch_scopes_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'revoked'))
);

CREATE INDEX restaurant_memberships_restaurant_status_idx
  ON public.restaurant_memberships (restaurant_id, status);

CREATE INDEX restaurant_memberships_user_status_idx
  ON public.restaurant_memberships (restaurant_user_id, status);

CREATE INDEX restaurant_memberships_role_id_idx
  ON public.restaurant_memberships (role_id);

CREATE INDEX restaurant_membership_branch_scopes_membership_status_idx
  ON public.restaurant_membership_branch_scopes (membership_id, status);

CREATE INDEX restaurant_membership_branch_scopes_branch_status_idx
  ON public.restaurant_membership_branch_scopes (branch_id, status);

INSERT INTO public.restaurant_roles (id, role_key, display_name, status)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'owner', 'Owner', 'active'),
  ('00000000-0000-4000-8000-000000000002', 'manager', 'Manager', 'active'),
  ('00000000-0000-4000-8000-000000000003', 'staff', 'Staff', 'active')
ON CONFLICT (role_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_key, permission_scope)
SELECT role.id, permission.permission_key, permission.permission_scope
FROM (
  VALUES
    ('owner', 'access_context.read', 'self'),
    ('owner', 'restaurant.read', 'restaurant'),
    ('owner', 'branch.read', 'restaurant'),
    ('owner', 'menu.read', 'restaurant'),
    ('owner', 'nutrition.read', 'restaurant'),
    ('manager', 'access_context.read', 'self'),
    ('manager', 'restaurant.read', 'restaurant'),
    ('manager', 'branch.read', 'branch'),
    ('manager', 'menu.read', 'branch'),
    ('manager', 'nutrition.read', 'branch'),
    ('staff', 'access_context.read', 'self'),
    ('staff', 'branch.read', 'branch'),
    ('staff', 'menu.read', 'branch'),
    ('staff', 'nutrition.read', 'branch')
) AS permission(role_key, permission_key, permission_scope)
JOIN public.restaurant_roles AS role
  ON role.role_key = permission.role_key
ON CONFLICT (role_id, permission_key, permission_scope) DO NOTHING;

CREATE FUNCTION public.enforce_restaurant_membership_branch_scope_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurant_memberships AS membership
    JOIN public.restaurant_branches AS branch
      ON branch.id = NEW.branch_id
     AND branch.restaurant_id = membership.restaurant_id
    WHERE membership.id = NEW.membership_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'branch scope must belong to the membership restaurant';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER restaurant_membership_branch_scopes_consistency_trigger
BEFORE INSERT OR UPDATE OF membership_id, branch_id
ON public.restaurant_membership_branch_scopes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_restaurant_membership_branch_scope_consistency();

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_membership_branch_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_membership_branch_scopes FORCE ROW LEVEL SECURITY;

CREATE POLICY restaurant_users_self_active_select
ON public.restaurant_users
FOR SELECT
TO PUBLIC
USING (
  auth_user_id = COALESCE(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    (
      nullif(
        pg_catalog.current_setting('request.jwt.claims', true),
        ''
      )::pg_catalog.jsonb ->> 'sub'
    )
  )::pg_catalog.uuid
  AND login_status = 'enabled'
);

CREATE POLICY restaurant_memberships_self_active_select
ON public.restaurant_memberships
FOR SELECT
TO PUBLIC
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.restaurant_users AS restaurant_user
    WHERE restaurant_user.id = restaurant_memberships.restaurant_user_id
      AND restaurant_user.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (
          nullif(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
          )::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      AND restaurant_user.login_status = 'enabled'
  )
);

CREATE POLICY restaurant_roles_self_active_select
ON public.restaurant_roles
FOR SELECT
TO PUBLIC
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.restaurant_memberships AS membership
    JOIN public.restaurant_users AS restaurant_user
      ON restaurant_user.id = membership.restaurant_user_id
    WHERE membership.role_id = restaurant_roles.id
      AND membership.status = 'active'
      AND restaurant_user.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (
          nullif(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
          )::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      AND restaurant_user.login_status = 'enabled'
  )
);

CREATE POLICY role_permissions_self_active_select
ON public.role_permissions
FOR SELECT
TO PUBLIC
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurant_roles AS role
    JOIN public.restaurant_memberships AS membership
      ON membership.role_id = role.id
    JOIN public.restaurant_users AS restaurant_user
      ON restaurant_user.id = membership.restaurant_user_id
    WHERE role.id = role_permissions.role_id
      AND role.status = 'active'
      AND membership.status = 'active'
      AND restaurant_user.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (
          nullif(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
          )::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      AND restaurant_user.login_status = 'enabled'
  )
);

CREATE POLICY restaurant_membership_branch_scopes_self_active_select
ON public.restaurant_membership_branch_scopes
FOR SELECT
TO PUBLIC
USING (
  status = 'active'
  AND EXISTS (
    SELECT 1
    FROM public.restaurant_memberships AS membership
    JOIN public.restaurant_users AS restaurant_user
      ON restaurant_user.id = membership.restaurant_user_id
    JOIN public.restaurant_branches AS branch
      ON branch.id = restaurant_membership_branch_scopes.branch_id
     AND branch.restaurant_id = membership.restaurant_id
    WHERE membership.id = restaurant_membership_branch_scopes.membership_id
      AND membership.status = 'active'
      AND restaurant_user.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (
          nullif(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
          )::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      AND restaurant_user.login_status = 'enabled'
  )
);

REVOKE ALL ON TABLE public.restaurant_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.restaurant_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.role_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.restaurant_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.restaurant_membership_branch_scopes FROM PUBLIC, anon, authenticated;

CREATE ROLE restaurant_membership_context_reader
  NOLOGIN
  NOINHERIT
  NOBYPASSRLS;

-- PostgreSQL 17 gives the CREATEROLE creator administration authority but no
-- SET or INHERIT path by default. This explicit membership adds SET only for
-- the three ownership transfers below and is revoked immediately afterward.
GRANT restaurant_membership_context_reader TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

GRANT USAGE ON SCHEMA public TO restaurant_membership_context_reader;
GRANT SELECT (id, auth_user_id, login_status)
  ON TABLE public.restaurant_users
  TO restaurant_membership_context_reader;
GRANT SELECT (id, role_key, status)
  ON TABLE public.restaurant_roles
  TO restaurant_membership_context_reader;
GRANT SELECT (role_id, permission_key, permission_scope)
  ON TABLE public.role_permissions
  TO restaurant_membership_context_reader;
GRANT SELECT (id, restaurant_user_id, restaurant_id, role_id, status)
  ON TABLE public.restaurant_memberships
  TO restaurant_membership_context_reader;
GRANT SELECT (membership_id, branch_id, status)
  ON TABLE public.restaurant_membership_branch_scopes
  TO restaurant_membership_context_reader;
GRANT SELECT (id, restaurant_id)
  ON TABLE public.restaurant_branches
  TO restaurant_membership_context_reader;

-- PostgreSQL requires a prospective function owner to hold CREATE on the schema.
-- This privilege exists only while ownership is assigned and is revoked below.
GRANT CREATE ON SCHEMA public TO restaurant_membership_context_reader;

CREATE FUNCTION public.restaurant_current_access_context_v1()
RETURNS TABLE (
  restaurant_id text,
  role_key text,
  permission_key text,
  permission_scope text,
  branch_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH request_actor AS (
    SELECT COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (
        nullif(
          pg_catalog.current_setting('request.jwt.claims', true),
          ''
        )::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid AS auth_user_id
  )
  SELECT
    membership.restaurant_id,
    role.role_key,
    permission.permission_key,
    permission.permission_scope,
    CASE
      WHEN permission.permission_scope = 'branch' THEN branch_scope.branch_id
      ELSE NULL::text
    END AS branch_id
  FROM request_actor
  JOIN public.restaurant_users AS restaurant_user
    ON restaurant_user.auth_user_id = request_actor.auth_user_id
   AND restaurant_user.login_status = 'enabled'
  JOIN public.restaurant_memberships AS membership
    ON membership.restaurant_user_id = restaurant_user.id
   AND membership.status = 'active'
  JOIN public.restaurant_roles AS role
    ON role.id = membership.role_id
   AND role.status = 'active'
  JOIN public.role_permissions AS permission
    ON permission.role_id = role.id
  LEFT JOIN public.restaurant_membership_branch_scopes AS branch_scope
    ON branch_scope.membership_id = membership.id
   AND branch_scope.status = 'active'
   AND permission.permission_scope = 'branch'
  LEFT JOIN public.restaurant_branches AS branch
    ON branch.id = branch_scope.branch_id
   AND branch.restaurant_id = membership.restaurant_id
  WHERE (
      permission.permission_scope <> 'branch'
      OR branch.id IS NOT NULL
    );
$$;

CREATE FUNCTION public.restaurant_has_restaurant_permission(
  requested_restaurant_id text,
  requested_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH request_actor AS (
    SELECT COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (
        nullif(
          pg_catalog.current_setting('request.jwt.claims', true),
          ''
        )::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid AS auth_user_id
  )
  SELECT
    request_actor.auth_user_id IS NOT NULL
    AND requested_restaurant_id IS NOT NULL
    AND requested_permission_key IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_users AS restaurant_user
      JOIN public.restaurant_memberships AS membership
        ON membership.restaurant_user_id = restaurant_user.id
       AND membership.status = 'active'
      JOIN public.restaurant_roles AS role
        ON role.id = membership.role_id
       AND role.status = 'active'
      JOIN public.role_permissions AS permission
        ON permission.role_id = role.id
       AND permission.permission_scope = 'restaurant'
      WHERE restaurant_user.auth_user_id = request_actor.auth_user_id
        AND restaurant_user.login_status = 'enabled'
        AND membership.restaurant_id = requested_restaurant_id
        AND permission.permission_key = requested_permission_key
    )
  FROM request_actor;
$$;

CREATE FUNCTION public.restaurant_has_branch_permission(
  requested_restaurant_id text,
  requested_branch_id text,
  requested_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH request_actor AS (
    SELECT COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (
        nullif(
          pg_catalog.current_setting('request.jwt.claims', true),
          ''
        )::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid AS auth_user_id
  )
  SELECT
    request_actor.auth_user_id IS NOT NULL
    AND requested_restaurant_id IS NOT NULL
    AND requested_branch_id IS NOT NULL
    AND requested_permission_key IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.restaurant_users AS restaurant_user
      JOIN public.restaurant_memberships AS membership
        ON membership.restaurant_user_id = restaurant_user.id
       AND membership.status = 'active'
      JOIN public.restaurant_roles AS role
        ON role.id = membership.role_id
       AND role.status = 'active'
      JOIN public.role_permissions AS permission
        ON permission.role_id = role.id
       AND permission.permission_key = requested_permission_key
      JOIN public.restaurant_branches AS branch
        ON branch.id = requested_branch_id
       AND branch.restaurant_id = membership.restaurant_id
      WHERE restaurant_user.auth_user_id = request_actor.auth_user_id
        AND restaurant_user.login_status = 'enabled'
        AND membership.restaurant_id = requested_restaurant_id
        AND (
          permission.permission_scope = 'restaurant'
          OR (
            permission.permission_scope = 'branch'
            AND EXISTS (
              SELECT 1
              FROM public.restaurant_membership_branch_scopes AS branch_scope
              WHERE branch_scope.membership_id = membership.id
                AND branch_scope.branch_id = branch.id
                AND branch_scope.status = 'active'
            )
          )
        )
    )
  FROM request_actor;
$$;

ALTER FUNCTION public.restaurant_current_access_context_v1()
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_has_restaurant_permission(text, text)
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_has_branch_permission(text, text, text)
  OWNER TO restaurant_membership_context_reader;

REVOKE restaurant_membership_context_reader FROM postgres;

REVOKE CREATE ON SCHEMA public FROM restaurant_membership_context_reader;

REVOKE ALL ON FUNCTION public.enforce_restaurant_membership_branch_scope_consistency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.restaurant_current_access_context_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_has_restaurant_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_has_branch_permission(text, text, text) TO authenticated;

COMMIT;
