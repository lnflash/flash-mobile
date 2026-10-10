// Stacking order for the app-wide overlay layers mounted inside
// AppUpdateBoundary in app.tsx. Both hosts render inline (no native modal
// host), so what wins is zIndex (iOS) / elevation (Android), and the two
// values live together here so they cannot drift apart in separate files.
//
// - The toast layer sits above the navigator so a top toast is not drawn
//   behind a stack screen's header on iOS (react-native-screens lifts the
//   active screen above later siblings that have no zIndex).
// - The forced-update gate sits above the toast layer. A hard-blocked user has
//   nothing but the gate to look at, and the gate renders its own failures
//   inline precisely because a toast cannot be relied on to show over it —
//   keeping the gate on top keeps that reasoning (and the docblocks in
//   app-update.tsx / app-update-boundary.tsx) true.

export const TOAST_LAYER_Z = 9999
export const APP_UPDATE_GATE_LAYER_Z = TOAST_LAYER_Z + 1
