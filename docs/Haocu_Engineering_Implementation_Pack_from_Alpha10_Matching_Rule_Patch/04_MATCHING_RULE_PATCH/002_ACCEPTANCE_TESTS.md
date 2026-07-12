# 002 Candidate Deduplication Acceptance Tests

## Test A — Accepted Match Hard Exclusion

Given current user A and candidate B have an accepted match  
When A requests new Meal Buddy candidates  
Then B is not returned in the candidate list

## Test B — Active One-on-One Chat Hard Exclusion

Given current user A and candidate B share an active one-on-one chat  
When A requests new Meal Buddy candidates  
Then B is not returned even if B has a compatible active card

## Test C — Existing Chat List Exclusion

Given B appears in A's active chat list  
When A creates a new card from AI analysis or restaurant card  
Then B is excluded from new-candidate discovery

## Test D — Unaccepted Invitation Strong Penalty

Given A previously invited B and B did not accept  
And no accepted match or active chat exists  
When A requests candidates  
Then B may appear but should rank below comparable fresh candidates

## Test E — Declined / Expired Invitation Cooldown

Given A previously invited B and invitation declined or expired  
When cooldown is active  
Then B should not appear or should rank very low according to configured policy

## Test F — Passive Impression Light Penalty

Given B was previously shown to A and A took no action  
And no hard exclusion exists  
When A requests candidates  
Then B may appear but with a light repeat penalty

## Test G — Free / Premium Trim After Deduplication

Given free user can see 3 candidates and premium user can see 5 candidates  
When ranking completes  
Then the trim happens after hard exclusions and soft penalties, not before

## Test H — No Hidden Reason Leakage

Given B is down-ranked due to prior non-acceptance or no-action impression  
When B appears  
Then the UI reason tags do not mention penalty state or negative interaction history
