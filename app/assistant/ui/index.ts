// The Ask Flash thread: the one thing the rest of the app may import from
// app/assistant (ENG-689). The root navigator registers the screen behind
// its gate (ask-flash-gate.tsx); the module-boundary spec allows that one
// import and no other.
export { AskFlashGate } from "./ask-flash-gate"
export { AskFlashScreen } from "./ask-flash-screen"
