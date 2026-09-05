# RA-2C-P2 Price application activation

The Restaurant menu surface calls only the fixed price preview and mutation RPCs through the server. Preview and expected price remain exact decimal strings; new prices are whole TWD strings from 1 through 999999. The legacy `0.00` preview is observable and repairable, never presented as free. Price changes are independently confirmed, reconciled by GET after stale or uncertain outcomes, and do not call or modify sold-out or availability authority.

The Development harness is intentionally prepared but disabled. It performs no credential, database, or live HTTP activity in P2.
