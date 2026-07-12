# 014 Analytics and Audit Backend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document separates analytics from audit logging.

## Analytics

Analytics records product behavior and funnel performance.

Examples:

- AI analysis started.
- AI analysis confirmed.
- Meal record created.
- Restaurant card opened.
- Meal Buddy card created.
- Invitation sent.
- Chat started.
- Premium gate viewed.

Analytics should minimize sensitive content.

## Audit

Audit records accountability for sensitive or administrative actions.

Examples:

- Admin approves restaurant.
- Admin rejects nutrition disclosure.
- Admin resolves abuse report.
- User privacy request processed.
- Premium entitlement manually changed.

Audit logs should include:

- actor ID.
- actor role.
- target type.
- target ID.
- action.
- timestamp.
- reason or note where applicable.

## Separation Rule

Do not use analytics as compliance audit. Do not use audit logs as product analytics. They serve different purposes and have different access controls.

## Access Control

- Product analytics: limited internal access.
- Audit logs: admin/security access only.
- User-specific privacy logs: exportable or reviewable in privacy workflows if legally required.
