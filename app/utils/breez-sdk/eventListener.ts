import { DeviceEventEmitter } from "react-native"
import { addEventListener } from "@breeztech/react-native-breez-sdk"

export function initializeBreezSdkListener() {
  return DeviceEventEmitter.addListener("breezSdkEvent", (event) => {
    console.log("Received breezSdkEvent with data:", event)
    // Handle the event data here...
  })
}
