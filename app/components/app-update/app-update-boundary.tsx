import * as React from "react"

import { AppUpdateGate, AppUpdateProvider } from "./app-update"

/**
 * The app-wide half of the version gate: one shared version check for the whole
 * tree, plus the blocking modal pinned as the LAST sibling inside it.
 *
 * It is a component rather than three lines inlined in `app.tsx` for two
 * reasons. First, sibling order is load-bearing: the gate's modal renders with
 * `coverScreen={false}` (RCTModalHostView is broken under Fabric on Android, see
 * #545), so paint order follows sibling order and anything mounted after the
 * gate would draw over a block that has no dismiss. Keeping the gate inside this
 * component means a later edit to `app.tsx` cannot reorder it by accident.
 *
 * That ordering only governs THIS subtree. A modal from an ancestor provider
 * that uses the default `coverScreen` goes through the native modal host and
 * paints above inline content whatever the sibling order — `NotificationsProvider`
 * wraps this boundary in `app.tsx` and its `CustomModal` does exactly that. Such
 * a modal can cover the gate. It is dismissible and the gate is still underneath
 * afterwards, so nobody is stranded; putting the gate genuinely on top would mean
 * hoisting it above `NotificationsProvider`, which is a structural change that
 * deserves its own PR and its own argument (#704).
 * Second, `app.tsx` cannot be rendered under jest — it pulls in Firebase,
 * reanimated and a pile of native modules at import time — so the wiring is only
 * testable once it lives somewhere that can be mounted on its own.
 *
 * The soft "update available" banner is mounted separately, on the home screen.
 * The gate lives here so deep-link cold starts that never render Home cannot
 * bypass it.
 */
export const AppUpdateBoundary: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AppUpdateProvider>
    {children}
    <AppUpdateGate />
  </AppUpdateProvider>
)
