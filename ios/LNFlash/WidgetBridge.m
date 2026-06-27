//
//  WidgetBridge.m
//  LNFlash
//
//  Exposes the Swift `WidgetBridge` class to the React Native bridge.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetBridge, NSObject)

RCT_EXTERN_METHOD(setPriceData:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
