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
 * Second, `app.tsx` cannot be rendered under jest — it pulls in Firebase,
 * reanimated and a pile of native modules at import time — so the wiring is only
 * testable once it lives somewhere that can be mounted on its own.
 *
 * The sibling ordering above only governs inline content. `CustomModal` renders `<Modal>` with
 * the default `coverScreen`, so it goes through RCTModalHostView and paints
 * above the entire inline root no matter where it sits in the tree — and
 * `NotificationsProvider`'s `notifyModal` is exactly that. Such a modal can
 * cover the gate. It is dismissible and the gate is still underneath afterwards,
 * so nobody is stranded. Note that moving this boundary above
 * `NotificationsProvider` would NOT fix it: a native-host modal outranks inline
 * content regardless of sibling order. The two fixes that would work are passing
 * `coverScreen={false}` to the notification `CustomModal` so it renders inline
 * and obeys sibling order, or gating `notifyModal` on the update gate not being
 * active. Neither is in scope here (#704).
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
