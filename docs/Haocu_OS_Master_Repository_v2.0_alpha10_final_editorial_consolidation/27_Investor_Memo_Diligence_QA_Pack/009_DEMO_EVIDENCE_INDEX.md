# Demo Evidence Index

> Use: Evidence registry for product demos, screenshots, videos, build logs, and walkthroughs.  
> Important: Do not claim live traction from demo evidence. Label it correctly.

## Evidence Categories

| Category | Examples | Evidence Level |
|---|---|---|
| Screen Recording | 3-minute product walkthrough, user flow recording. | Demo |
| Screenshots | AI analysis result, restaurant card, meal buddy card, diary. | Demo |
| Build Log | Vercel deployment, Expo web demo, typecheck/build output. | Demo / Verified if exported directly. |
| User Test Note | Notes from someone using demo. | Pilot if real user; Demo if guided walkthrough. |
| Prototype Script | Founder-led story walkthrough. | Planned / Demo |

## Required Demo Evidence Set

| Evidence Item | Why It Matters | Status | File / Link | Owner |
|---|---|---|---|---|
| 3-minute founder demo video | Fast investor review. | To capture |  |  |
| AI meal analysis screenshot | Shows core utility. | To capture |  |  |
| User correction flow screenshot | Shows human-in-the-loop AI. | To capture |  |  |
| Food diary / today's intake screenshot | Shows memory loop. | To capture |  |  |
| Next-meal recommendation screenshot | Shows personalization thesis. | To capture |  |  |
| Restaurant card / menu data screenshot | Shows restaurant layer. | To capture |  |  |
| Meal-buddy card creation screenshot | Shows social loop. | To capture |  |  |
| Chat / invite bounded flow screenshot | Shows trust/safety boundary. | To capture |  |  |
| Build/deployment proof | Shows engineering progress. | To capture |  |  |

## Demo Script Evidence Map

| Demo Moment | Claim Supported | Evidence Needed |
|---|---|---|
| User uploads meal | Meal analysis workflow exists. | Screen recording + screenshot. |
| User corrects meal | AI is editable and can learn from correction. | Screen recording + correction log. |
| Diary updates | Meal memory exists. | Screenshot before/after. |
| Recommendation appears | Next-meal logic exists in demo. | Screenshot + explanation of rule/mock/live source. |
| Meal-buddy card created | Social intent can be generated from meal context. | Screenshot + card data source. |
| Restaurant selected | Restaurant discovery loop exists. | Screenshot + restaurant data status. |

## Evidence Naming Convention

Use this pattern:

`YYYY-MM-DD_demo_[flow]_[short-description].[png/mp4/pdf/md]`

Examples:

- `2026-07-08_demo_ai-analysis_meal-result.png`
- `2026-07-08_demo_meal-buddy_card-created.mp4`
- `2026-07-08_demo_build_vercel-deployment-log.md`

## Investor Use Guidance

When sharing demo evidence, say:

> "This is demo evidence from the current product walkthrough. It demonstrates the intended user flow and interface. We are tracking pilot evidence separately."
