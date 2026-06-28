#import "AppDelegate.h"
#import "RNFBAppCheckModule.h"
#import "Firebase.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <RCTAppDependencyProvider.h>
#import <WatchConnectivity/WatchConnectivity.h>

#import "RNBootSplash.h"
#import "Flash-Swift.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [RNFBAppCheckModule sharedInstance];
  [FIRApp configure];
  [WatchConnectivityBridge activateSession];

  self.moduleName = @"LNFlash";
  self.dependencyProvider = [RCTAppDependencyProvider new];
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  [super application:application didFinishLaunchingWithOptions:launchOptions];

  [RNBootSplash initWithStoryboard:@"BootSplash" rootView:self.window.rootViewController.view];

  return YES;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}
 
- (NSURL *)bundleURL
{
  #if DEBUG
    return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
    //return [NSURL URLWithString:@"http://100.116.189.124:8081/index.bundle?platform=ios&dev=true"];
    // return [NSURL URLWithString:@"http://localhost:8081/index.bundle?platform=ios&dev=true"];
  #else
    return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  #endif
}

- (BOOL)application:(UIApplication *)application
   openURL:(NSURL *)url
   options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
}
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity
 restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
{
 return [RCTLinkingManager application:application
                  continueUserActivity:userActivity
                    restorationHandler:restorationHandler];
}

@end
