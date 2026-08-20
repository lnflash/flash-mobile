export default {
  getReadableVersion: jest.fn(() => "1.0.0"),
  getBuildNumber: jest.fn(() => "1234"),
  // AppUpdate scopes the version gate to this bundle — see GATED_BUNDLE_ID in
  // app/components/app-update/app-update.tsx. Leaving it undefined would
  // silently disable the gate in every screen test that mounts the provider.
  getBundleId: jest.fn(() => "com.lnflash"),
}
