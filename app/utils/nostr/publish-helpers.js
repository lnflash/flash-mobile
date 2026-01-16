"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublishingRelays = exports.verifyEventOnRelays = exports.publishEventToRelays = void 0;
/**
 * Publishes an event to multiple relays and returns detailed results
 * Inspired by nostrudel's approach to event publishing
 */
async function publishEventToRelays(pool, event, relays, eventLabel = "Event") {
    console.log(`\n📤 Publishing ${eventLabel} to ${relays.length} relays...`);
    console.log(`Event kind: ${event.kind}, ID: ${event.id}`);
    console.log(`Relays: ${relays.join(", ")}`);
    const responses = [];
    const successfulRelays = [];
    const failedRelays = [];
    // Publish to each relay individually for better control
    const publishPromises = relays.map(async (relay) => {
        var _a;
        try {
            // Create a promise for this specific relay
            const publishResults = pool.publish([relay], event);
            // Wait for all sub-promises and validate responses
            const results = await Promise.allSettled(publishResults);
            // Check if we got a successful response
            let hasSuccess = false;
            let errorMessage = "";
            for (const result of results) {
                if (result.status === "fulfilled") {
                    const value = result.value;
                    // Different relays return different success indicators
                    if (value === true || value === "" || value === "OK") {
                        hasSuccess = true;
                        break;
                    }
                    else if (typeof value === "string") {
                        // Check for error indicators in string response
                        const lowerValue = value.toLowerCase();
                        if (lowerValue.includes("error") ||
                            lowerValue.includes("fail") ||
                            lowerValue.includes("reject") ||
                            lowerValue.includes("invalid") ||
                            lowerValue.includes("duplicate")) {
                            errorMessage = value;
                        }
                        else {
                            // Assume success if no error indicators
                            hasSuccess = true;
                            break;
                        }
                    }
                }
                else {
                    errorMessage = ((_a = result.reason) === null || _a === void 0 ? void 0 : _a.message) || "Unknown error";
                }
            }
            if (hasSuccess) {
                console.log(`  ✅ ${relay}: Successfully published`);
                successfulRelays.push(relay);
                responses.push({ relay, success: true });
            }
            else {
                const finalError = errorMessage || "No successful response";
                console.log(`  ❌ ${relay}: ${finalError}`);
                failedRelays.push(relay);
                responses.push({ relay, success: false, error: finalError });
            }
        }
        catch (error) {
            const errorMsg = (error === null || error === void 0 ? void 0 : error.message) || "Connection failed";
            console.log(`  ❌ ${relay}: ${errorMsg}`);
            failedRelays.push(relay);
            responses.push({ relay, success: false, error: errorMsg });
        }
    });
    // Wait for all publishing attempts to complete
    await Promise.allSettled(publishPromises);
    const result = {
        successCount: successfulRelays.length,
        failedCount: failedRelays.length,
        successfulRelays,
        failedRelays,
        responses,
    };
    console.log(`\n📊 ${eventLabel} Publishing Summary:`);
    console.log(`  ✅ Success: ${result.successCount}/${relays.length} relays`);
    if (result.successCount > 0) {
        console.log(`     Successful relays: ${successfulRelays.join(", ")}`);
    }
    if (result.failedCount > 0) {
        console.log(`  ❌ Failed: ${result.failedCount} relays`);
        console.log(`     Failed relays: ${failedRelays.join(", ")}`);
    }
    return result;
}
exports.publishEventToRelays = publishEventToRelays;
/**
 * Verifies that an event exists on specified relays
 * Useful for confirming successful propagation
 */
async function verifyEventOnRelays(pool, eventId, relays, eventKind) {
    console.log(`\n🔍 Verifying ${eventKind === 0 ? "profile" : "event"} ${eventId} on ${relays.length} relays...`);
    const foundOnRelays = [];
    const missingFromRelays = [];
    const verifyPromises = relays.map(async (relay) => {
        try {
            const filter = { ids: [eventId] };
            if (eventKind !== undefined) {
                filter.kinds = [eventKind];
            }
            const event = await pool.get([relay], filter);
            if (event && event.id === eventId) {
                console.log(`  ✅ Found on ${relay}`);
                foundOnRelays.push(relay);
            }
            else {
                console.log(`  ❌ Not found on ${relay}`);
                missingFromRelays.push(relay);
            }
        }
        catch (error) {
            console.log(`  ❌ Error checking ${relay}`);
            missingFromRelays.push(relay);
        }
    });
    await Promise.allSettled(verifyPromises);
    const result = {
        found: foundOnRelays.length > 0,
        foundOnRelays,
        missingFromRelays,
    };
    console.log(`\n📊 Verification Summary:`);
    console.log(`  Found on ${foundOnRelays.length}/${relays.length} relays`);
    if (foundOnRelays.length > 0) {
        console.log(`  Verified on: ${foundOnRelays.join(", ")}`);
    }
    return result;
}
exports.verifyEventOnRelays = verifyEventOnRelays;
/**
 * Gets the best relays for publishing based on purpose
 */
function getPublishingRelays(purpose) {
    const coreRelays = [
        "wss://relay.flashapp.me",
        "wss://relay.islandbitcoin.com",
    ];
    const majorPublicRelays = [
        "wss://relay.damus.io",
        "wss://relay.primal.net",
        "wss://relay.snort.social",
    ];
    const profileRelays = [
        "wss://purplepag.es",
        "wss://relay.nostr.band",
    ];
    const noteRelays = [
        "wss://relay.current.fyi",
        "wss://relay.nostrplebs.com",
    ];
    switch (purpose) {
        case "profile":
            return [...coreRelays, ...majorPublicRelays, ...profileRelays];
        case "note":
            return [...coreRelays, ...majorPublicRelays, ...noteRelays];
        case "general":
        default:
            return [...coreRelays, ...majorPublicRelays];
    }
}
exports.getPublishingRelays = getPublishingRelays;
//# sourceMappingURL=publish-helpers.js.map