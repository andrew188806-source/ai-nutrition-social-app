# Phase 2W-E0 Governance State Machine

The shared status vocabulary is: `received`, `resolving`, `resolved_existing`, `pending_resolution`, `externally_supported`, `community_supported`, `partner_review`, `admin_review`, `active`, `inactive_suspected`, `archived`, `rejected`, and `merged`.

`received` proceeds to resolution or rejection. Resolution may link an existing target, remain pending, gain external/community support, or enter partner/admin review. Only reviewed/supported paths become active. `inactive_suspected` and `archived` are reversible; `merged` retains an alias redirect and history. Ordinary lifecycle never hard-deletes a target.

Catalog existence, current availability, partner relationship, and nutrition verification are independent dimensions. Changing one must not imply a change in another. The pure transition policy is authoritative for E0 static behavior; persistence, actor authorization, and audit storage are deferred.

