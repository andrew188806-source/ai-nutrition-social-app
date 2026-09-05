# RA-2D-P2 Restaurant Owner offering visibility control

This P2 activates the frozen RA-2D-P1 authority through one same-origin Restaurant Web route. It uses only the P1 preview and mutation RPCs, server-verified claims, strict bounded JSON, and a canonical refresh after every POST.

An Owner may move a branch-menu offering only between `available` and `hidden`. `discontinued` stays readable and is a hard no-mutation state. The UI labels are `暫時隱藏` and `恢復顯示`; recovery explains that public reappearance still depends on all existing restaurant, branch, menu, and supply conditions.

The flow neither reads nor writes price, sold-out state, or availability. The development harness is deliberately disabled until separately authorized acceptance; this freeze performs no Development action.
