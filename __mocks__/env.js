// Manual jest mock for the @env module (react-native-dotenv).
// Provides stub values for environment variables imported by app code so that
// modules importing from "@env" can be evaluated under jest.
export const API_KEY = "test-api-key"
export const BREEZ_LNURL_DOMAIN = "test.flashapp.me"
export const BREEZ_API_KEY = "test-breez-api-key"
export const MIGRATION_FEE_LNURL_W = "test-migration-fee-lnurl-w"
