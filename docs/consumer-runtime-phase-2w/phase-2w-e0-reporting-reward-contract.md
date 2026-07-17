# Phase 2W-E0 Reporting and Reward Contract

Report types are `restaurant_closed`, `restaurant_temporarily_closed`, `menu_item_discontinued`, `menu_item_temporarily_unavailable`, `seasonal_item`, `wrong_branch`, `wrong_affiliation`, `duplicate`, `incorrect_name`, `incorrect_price`, and `incorrect_photo`.

Statuses are `submitted`, `under_review`, `partner_review`, `admin_review`, `confirmed`, `rejected`, and `reversed`. One report never hard-deletes data. Partner-linked reports enter partner review first; other reports use admin/community evidence. Confirmation may mark a target inactive or archived while preserving meal and rating references. Appeals can reopen/reverse decisions.

Reward states are `not_eligible`, `pending_review`, `approved`, `issued`, `rejected`, and `reversed`. `issued` is legal only after report confirmation. Future persistence must add rate limits, duplicate detection, fraud review, and competitor-abuse controls.

