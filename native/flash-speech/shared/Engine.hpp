#pragma once
#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
namespace flashspeech {
class Engine {
public:
  explicit Engine(const std::string &root);
  ~Engine();
  Engine(const Engine &) = delete;
  Engine &operator=(const Engine &) = delete;
  // One render at a time on a worker. cancel() is thread-safe and interrupts
  // ORT.
  void
  render(const std::string &text, const std::string &voice, float speed,
         const std::function<bool(const std::vector<float> &, bool)> &chunk);
  void cancel();
  std::string phonemize(const std::string &text, bool british);

private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};
} // namespace flashspeech
