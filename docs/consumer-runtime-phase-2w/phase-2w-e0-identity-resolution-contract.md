# Phase 2W-E0 Identity and Resolution Contract

- Restaurants, branches, and menu items use opaque server-generated IDs. Canonical and registered provisional targets both have an ID.
- Raw names, photos, addresses, and locations are observation evidence only. They are never identifiers. A local Mobile `mealId` is not a database UUID or catalog identity.
- A user submission first creates an observation. Resolution links it to an existing target or registers a provisional target; observations are not silently promoted into entities.
- Target references carry `kind`, `targetId`, resolution status, identity provenance, and optional restaurant/branch parent IDs. Menu-item resolution is scoped by restaurant and, by default, branch.
- Canonical ID, Place ID, consistent verified address+phone, verified official source, and verified partner source are strong identity evidence.
- Name, fuzzy-name, photo, and location similarity only rank candidates. Photo-only and similar-name-only evidence cannot auto-resolve.
- Two independent verified observers may support `community_supported` only when evidence is consistent, abuse signals are absent, and no partner/canonical conflict exists. Community support is not nutrition verification.
- Partner-suspected input enters `partner_review`; a partner rejection plus strong conflict enters `admin_review`.
- Merge produces an alias/redirect and preserves references and history. Raw hard deletion is not an ordinary lifecycle action.
- Consumer projection deliberately omits internal resolution and governance status.

