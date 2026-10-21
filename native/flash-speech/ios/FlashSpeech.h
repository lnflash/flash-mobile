#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
/// Lazy, off-main synthesis. All callbacks run on the private synthesis queue.
@interface FlashSpeech : NSObject
+ (NSString *)packManifest;
- (instancetype)initWithRoot:(NSString *)root;
- (void)render:(NSString *)text
         voice:(NSString *)voice
          rate:(float)rate
       onChunk:(BOOL (^)(NSData *samples, BOOL last))onChunk
          done:(void (^)(NSError *_Nullable error))done;
- (void)cancel;
@end
NS_ASSUME_NONNULL_END
