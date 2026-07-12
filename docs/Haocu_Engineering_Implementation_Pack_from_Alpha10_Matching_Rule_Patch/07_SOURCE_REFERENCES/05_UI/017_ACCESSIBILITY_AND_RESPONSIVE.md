# Accessibility and Responsive Requirements

## Purpose
Ensure Haocu is usable across mobile devices and accessible enough for public MVP.

## Mobile Layout

- Support common iPhone and Android screen sizes.
- Avoid placing primary actions below unreachable areas.
- Keep bottom safe area spacing.
- Avoid tiny tap targets.
- Use scroll views for long correction forms.

## Tap Targets

Minimum recommended touch target: 44x44 points.

Critical actions such as save, invite, accept, and cancel should not be cramped.

## Text Readability

- Use clear font size hierarchy.
- Avoid long dense paragraphs inside cards.
- Use section labels.
- Keep Traditional Chinese line breaks readable.

## Color and Contrast

- CTAs must have sufficient contrast.
- Do not rely only on color for status.
- Badges should include text labels.

## Screen Reader Basics

- Buttons have meaningful labels.
- Images/avatars have accessible labels where appropriate.
- Decorative mascot images can be hidden from screen readers.

## Responsive Web Demo

Expo web demo should remain acceptable on desktop browser for sharing link:

- app container centered
- no broken horizontal overflow
- screenshots look clean
- camera/upload fallback works on web

## Acceptance Criteria

1. Primary CTAs are tappable on mobile.
2. Cards do not overflow narrow screens.
3. Important status is not color-only.
4. Web demo layout is presentable.
5. Long forms remain scrollable and saveable.
