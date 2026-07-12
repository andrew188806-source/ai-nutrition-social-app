# Technical / AI / Data Q&A

## Q1. What is the technical architecture?
The repository specifies a mobile app, restaurant/admin web surfaces, backend services, database, storage, AI orchestration, analytics, QA, security, and deployment architecture. Specific implementation choices are documented in architecture and engineering folders.

## Q2. Is the AI model proprietary?
The core defensibility should not depend only on a proprietary base model. The stronger thesis is product-specific data: food corrections, personal taste memory, local restaurant/menu structures, recommendation feedback, and social meal context.

## Q3. How does Haocu reduce hallucination?
The system should use database-first logic where structured data exists, candidate outputs where uncertain, user correction, confidence levels, and conservative language.

## Q4. How is user correction used?
Corrections should update the meal record, improve the user's future preference/taste memory, and potentially improve structured food/menu mappings over time.

## Q5. What is the first AI evaluation plan?
Evaluate:

- meal identification candidate quality
- ingredient estimation reasonableness
- nutrition estimate error bands where reference data exists
- correction frequency and types
- recommendation acceptance
- cost per analysis
- latency and failure rate

## Q6. What are the biggest technical risks?
- inaccurate food recognition
- inconsistent portion estimation
- high AI inference cost
- low-quality restaurant data
- privacy/security handling of photos and health-adjacent data
- complex state synchronization across diary, recommendation, and social cards

## Q7. What technical evidence should investors see?
- architecture overview
- engineering backlog
- demo recording
- build/deployment logs
- AI evaluation plan
- cost-control plan
- privacy/security boundary summary
- pilot metrics once available

## Q8. What should remain confidential?
Detailed security implementation notes, credentials, private architecture vulnerabilities, sensitive prompt logic, raw data exports, and unreviewed IP/patent details should not be broadly shared.
