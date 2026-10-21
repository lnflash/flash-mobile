// Offline integration check: run with a verified pack path; no network or user
// data.
#include "../../native/flash-speech/shared/Engine.hpp"
#include "../../native/flash-speech/third_party/nlohmann/json.hpp"
#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace flashspeech;
void require(bool value) {
  if (!value)
    throw std::runtime_error("Engine check failed");
}
int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  try {
#ifdef __ANDROID__
    // Replacing a canceled renderer can overlap the previous model's loading.
    // Exercise both constructors before any provider allocator is initialized.
    std::atomic<int> loaded{0};
    auto load = [&] {
      try {
        Engine candidate(argv[1]);
        ++loaded;
      } catch (const std::exception &) {
      }
    };
    std::thread first(load), second(load);
    first.join();
    second.join();
    require(loaded == 2);
#endif
    Engine engine(argv[1]);
    // Dynamic financial precision must preserve every fractional zero and group
    // separators.
    require(engine.phonemize("12.50 USD", false) ==
            engine.phonemize("twelve point five zero USD", false));
    require(engine.phonemize("2,500 sats", false) ==
            engine.phonemize("two thousand five hundred sats", false));
    require(engine.phonemize("0.0005 Bitcoin", true) ==
            engine.phonemize("zero point zero zero zero five Bitcoin", true));
    require(engine.phonemize("0012", false) ==
            engine.phonemize("zero zero one two", false));
    for (bool british : {false, true}) {
      require(engine.phonemize("Your balance is -12.50 US dollars.", british) ==
              engine.phonemize(
                  "Your balance is minus twelve point five zero US dollars.",
                  british));
      require(
          engine.phonemize("−2,500 sats", british) ==
          engine.phonemize("minus two thousand five hundred sats", british));
      require(engine.phonemize("code-12", british) ==
              engine.phonemize("code dash twelve", british));
    }
    require(!engine.phonemize("Gwendolyn", true).empty());
    nlohmann::json frontend;
    std::ifstream(std::string(argv[1]) + "/frontend.json") >> frontend;
    const std::string sample =
        "Hello, I'm Flash. I can help you find your way around your wallet.";
    require(engine.phonemize(sample, false) ==
            frontend["sentences"]["us"][sample]);
    require(engine.phonemize(sample, true) ==
            frontend["sentences"]["gb"][sample]);
    for (const auto &voice : {"af_heart", "am_michael", "bf_emma"}) {
      size_t frames = 0;
      bool final = false;
      engine.render(sample, voice, 1,
                    [&](const std::vector<float> &pcm, bool last) {
                      require(!pcm.empty());
                      for (float value : pcm)
                        require(std::isfinite(value) && std::abs(value) <= 1);
                      frames += pcm.size();
                      final = last;
                      return true;
                    });
      require(final && frames > 24000);
    }
    // A callback declining a chunk must prevent all further chunk delivery.
    int delivered = 0;
    engine.render(sample + " " + sample, "af_heart", 1,
                  [&](const auto &, bool) {
                    ++delivered;
                    return false;
                  });
    require(delivered == 1);
    // Cancel an active inference; then a fresh render must work normally.
    std::atomic<bool> started{false};
    std::atomic<int> callbacks{0};
    std::thread worker([&] {
      started = true;
      try {
        engine.render(sample + " " + sample, "af_heart", 1,
                      [&](const auto &, bool) {
                        ++callbacks;
                        return true;
                      });
      } catch (const std::exception &) {
      }
    });
    while (!started)
      std::this_thread::yield();
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    engine.cancel();
    worker.join();
    require(callbacks == 0);
    bool recovered = false;
    engine.render("Hello.", "af_heart", 1, [&](const auto &, bool last) {
      recovered = last;
      return true;
    });
    require(recovered);
    std::cout << "PASS precision, accents, reference frontend, three voices, "
                 "chunk cancellation, inference cancellation, recovery\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
