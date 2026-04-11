# ENG-299 Dark Tab Indicator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the active bottom tab state visible in dark mode without changing navigation behavior or layout.

**Architecture:** Keep the fix in theme tokens, not in the navigator. Update the dark tab active color so React Navigation’s existing `tabBarActiveTintColor` renders a visible selected state across tab labels and any tint-driven icons. This preserves the current component structure and limits the blast radius to one palette value.

**Tech Stack:** React Native, React Navigation bottom tabs, RNEUI theme tokens.

---

### Task 1: Update dark tab active color

**Files:**
- Modify: `app/rne-theme/colors.ts`

**Step 1: Inspect the current tab colors**

Confirm `dark.tabActive` is effectively black/dark green on a black background.

**Step 2: Write the minimal fix**

Change `dark.tabActive` to a high-contrast value that works on black, while leaving `tabInactive` unchanged.

**Step 3: Verify the value is used by the bottom tabs**

Confirm `app/navigation/root-navigator.tsx` already consumes `colors.tabActive` via `tabBarActiveTintColor`.

**Step 4: Commit**

```bash
git add app/rne-theme/colors.ts docs/plans/2026-04-11-eng-299-dark-tab-indicator.md
git commit -m "fix: improve dark tab active contrast"
```
