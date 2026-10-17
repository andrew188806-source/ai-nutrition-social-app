# Owner F2 decision — 2026-10-17 — C4
Status: APPROVED PRODUCT CONTRACT for local candidate implementation. Not Hosted activation.
Supersedes the C3 F2 OPEN_CONTRACT_GAP for the exact scope below; historical C2/C3 reports remain unchanged.

## Owner instructions (verbatim)
1. 目標使用者關閉被搜尋後，不得利用關閉前取得、尚未到期的搜尋憑證建立新的好友邀請。
2. 已送出的邀請不因此取消，既有好友不受影響。
3. 本決策不自動改變邀請碼或其他邀請管道。
4. 不自行增加「重新開啟後舊憑證永久失效」等額外規則。

## Scope and implementation
"Search" here is the phone-search path distinct from the explicitly excluded invitation-code/other paths. Code lookup and its existing searchable requirement stay unchanged; previously issued code/ordinary references keep their existing send semantics.
New phone-search references authenticate a fixed server-only source domain in AES-GCM AAD. The frozen scr1 envelope, actor binding, random IV, key and 24-hour TTL are reused without modifying the shared primitive. The request DTO has no source selector.
The actual relationship Edge service opens either domain and sends phone references through social_internal.send_phone_search_invite; the original code/ordinary send remains unchanged. A client cannot downgrade a phone reference into the ordinary domain.
The SQL wrapper uses the existing pair + participation + bidirectional block locks. Under that lock, pending/accepted are idempotent returns through the unchanged canonical authority. Absent/declined/cancelled are creation/reinvite and require current target searchable + explicit adulthood.
For creation, it then obtains the exact target ':friend_settings' transaction advisory lock used by lookup/toggle. The next statement reads committed settings, and the transaction retains both locks through canonical send, projection and commit. With the production READ COMMITTED transaction driver, an OFF commit that wins the setting lock prevents creation; a send that wins may commit first and the later OFF preserves that pending invite.
Resolve, reverse-send and unfriend use the same pair authority and cannot change classification mid-transaction.
Pending replay (either direction) does not create another invite, does not auto-accept, and keeps timestamps/state. Accepted replay preserves the accepted pair. Existing account/participation/block checks still apply.
Current searchable state is used; no epoch/revocation-generation or permanent invalidation is added. After re-enable, an unexpired old phone reference can create an invite again if all current checks allow it.

## Upgrade / activation boundary
C2/C3 never deployed these local social changes. Their phone and code references were indistinguishable ordinary scr1 values. Those historical synthetic references cannot be retroactively classified without also changing excluded channels. C4 issues source-authenticated phone references; ordinary references stay ordinary. No global key/TTL rotation is imposed. Before any future rollout, verify there are no already-issued undifferentiated phone references in the target environment; this candidate does not claim a deployed-token conversion.
New migration: 20261017154025_social_phone_invite_f2_c4_mvckab05.sql after the existing C2 social migration and before the separately maintained retention 20261018010000 tail. No old migration or retention interface is edited.

## F3 harness decision
C3 raw harness failed at consumer_demo_internal ownership (independent evidence). Apply the acceptor-proven native bootstrap: postgres NOSUPERUSER with BYPASSRLS installs Demo as postgres; Auth stub remains supplemented. Runtime and all authority roles stay NOSUPERUSER/NOBYPASSRLS; no production grant, RLS or guard is weakened by this test-only installer fixture.
Local tests must verify raw committed harness without an acceptor patch, hold the common resource lock, and record actual outcomes. Synthetic provider authentication does not verify Hosted/provider/Deno/device.
