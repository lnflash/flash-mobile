#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VoiceInputBridge, RCTEventEmitter)
RCT_EXTERN_METHOD(capability:(NSString *)locale
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(start:(NSString *)sessionId locale:(NSString *)locale)
RCT_EXTERN_METHOD(stop:(NSString *)sessionId)
RCT_EXTERN_METHOD(abort:(NSString *)sessionId)
@end
