#import "FlashSpeech.h"
#include "../shared/Engine.hpp"
#include "../shared/Pack.hpp"
#include <memory>
#include <mutex>
@implementation FlashSpeech {
  NSString *_root;
  dispatch_queue_t _queue;
  std::mutex _mutex;
  uint64_t _generation;
  std::shared_ptr<flashspeech::Engine> _engine;
}
+ (NSString *)packManifest {
  return [NSString stringWithUTF8String:flashspeech::packManifest];
}
- (instancetype)initWithRoot:(NSString *)root {
  if ((self = [super init])) {
    _root = [root copy];
    _queue =
        dispatch_queue_create("flash.speech.synthesis", DISPATCH_QUEUE_SERIAL);
    _generation = 0;
  }
  return self;
}
- (void)cancel {
  std::shared_ptr<flashspeech::Engine> engine;
  {
    std::lock_guard<std::mutex> lock(_mutex);
    ++_generation;
    engine = _engine;
  }
  if (engine)
    engine->cancel();
}
- (void)render:(NSString *)text
         voice:(NSString *)voice
          rate:(float)rate
       onChunk:(BOOL (^)(NSData *, BOOL))chunk
          done:(void (^)(NSError *_Nullable))done {
  uint64_t generation;
  {
    std::lock_guard<std::mutex> lock(_mutex);
    generation = ++_generation;
  }
  dispatch_async(_queue, ^{
    try {
      std::shared_ptr<flashspeech::Engine> engine;
      {
        std::lock_guard<std::mutex> lock(self->_mutex);
        if (self->_generation != generation)
          return;
        engine = self->_engine;
      }
      if (!engine) {
        engine =
            std::make_shared<flashspeech::Engine>([self->_root UTF8String]);
        std::lock_guard<std::mutex> lock(self->_mutex);
        if (self->_generation != generation)
          return;
        self->_engine = engine;
      }
      engine->render(
          [text UTF8String], [voice UTF8String], rate,
          [&](const std::vector<float> &samples, bool last) {
            {
              std::lock_guard<std::mutex> lock(self->_mutex);
              if (self->_generation != generation)
                return false;
            }
            @autoreleasepool {
              return bool(
                  chunk([NSData dataWithBytes:samples.data()
                                       length:samples.size() * sizeof(float)],
                        last));
            }
          });
      {
        std::lock_guard<std::mutex> lock(self->_mutex);
        if (self->_generation != generation)
          return;
      }
      done(nil);
    } catch (const std::exception &) {
      {
        std::lock_guard<std::mutex> lock(self->_mutex);
        if (self->_generation != generation)
          return;
      }
      done([NSError errorWithDomain:@"FlashSpeech"
                               code:1
                           userInfo:@{
                             NSLocalizedDescriptionKey :
                                 @"Offline speech generation failed"
                           }]);
    }
  });
}
@end
