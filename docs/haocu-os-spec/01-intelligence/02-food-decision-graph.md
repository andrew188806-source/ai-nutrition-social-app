# Food Decision Graph

Status: Draft v1.0
Priority: P0 Core Intelligence

## Purpose

Food Decision Graph（FDG）描述 Haocu 如何將 Knowledge 轉換為 Decision。

## Decision Pipeline

Knowledge → Context → Candidate Generation → Filtering → Scoring → Ranking → Recommendation → Feedback → Learning

## Decision Context

- Current Time
- Meal Type
- Current Nutrition
- Health Goal
- Taste
- Location
- Dining Preference
- Availability

## MVP Scope

P0: Rule-based Candidate Generation, Rule-based Filtering, Rule-based Scoring, Rule-based Ranking, Recommendation Feedback.
