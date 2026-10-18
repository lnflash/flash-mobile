//
//  AssistantModelBridge.m
//  LNFlash
//
//  Exposes the Swift `AssistantModelBridge` class (the assistant's on-device
//  model, ENG-690) to the React Native bridge.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AssistantModelBridge, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(complete:(NSString *)promptJson
                  timeoutMs:(nonnull NSNumber *)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
