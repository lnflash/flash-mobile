// Release-optimized engine-only probe. No user text, recording or network code.
#include "../../native/flash-speech/shared/Engine.hpp"
#include "../../native/flash-speech/third_party/nlohmann/json.hpp"
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <sys/resource.h>
#include <thread>

using Clock = std::chrono::steady_clock;
using json = nlohmann::json;
double ms(Clock::time_point start) {
  return std::chrono::duration<double, std::milli>(Clock::now() - start)
      .count();
}
long rss() {
  std::ifstream file("/proc/self/status");
  std::string line;
  while (std::getline(file, line)) {
    if (line.rfind("VmRSS:", 0) == 0) {
      std::istringstream input(line.substr(6));
      long value = 0;
      input >> value;
      return value;
    }
  }
  return 0;
}
long peak() {
  rusage value{};
  getrusage(RUSAGE_SELF, &value);
  return value.ru_maxrss;
}
double cpu() {
  rusage value{};
  getrusage(RUSAGE_SELF, &value);
  return (value.ru_utime.tv_sec + value.ru_stime.tv_sec) * 1000.0 +
         (value.ru_utime.tv_usec + value.ru_stime.tv_usec) / 1000.0;
}
void emit(json value) { std::cout << value.dump() << std::endl; }
int main(int argc, char **argv) {
  if (argc != 3)
    return 2;
  try {
    const int rounds = std::stoi(argv[2]);
    if (rounds < 1 || rounds > 10)
      return 2;
    emit({{"phase", "baseline"}, {"rssKiB", rss()}, {"cpuMs", cpu()}});
    const auto load = Clock::now();
    auto engine = std::make_unique<flashspeech::Engine>(argv[1]);
    emit({{"phase", "load"},
          {"wallMs", ms(load)},
          {"rssKiB", rss()},
          {"peakRssKiB", peak()}});
    const std::string phrases[] = {
        "Hello, I'm Flash. I can help you find your way around your wallet.",
        "To receive money, open Receive and share your Flash address or a "
        "payment request.",
        "Here is an example, not your wallet balance: twelve US dollars and "
        "fifty cents, and two thousand five hundred satoshis."};
    for (int round = 0; round < rounds; ++round) {
      for (const auto &voice : {"af_heart", "am_michael", "bf_emma"}) {
        const auto start = Clock::now();
        const double beforeCpu = cpu();
        double first = -1;
        size_t frames = 0;
        int chunks = 0;
        engine->render(phrases[round % 3], voice, 1,
                       [&](const auto &pcm, bool) {
                         if (first < 0)
                           first = ms(start);
                         frames += pcm.size();
                         ++chunks;
                         return true;
                       });
        const double wall = ms(start);
        emit({{"phase", "render"},
              {"round", round},
              {"phraseId", round % 3},
              {"voice", voice},
              {"firstPcmMs", first},
              {"wallMs", wall},
              {"cpuMs", cpu() - beforeCpu},
              {"audioMs", frames / 24.0},
              {"realTimeFactor", wall / (frames / 24.0)},
              {"chunks", chunks},
              {"rssKiB", rss()},
              {"peakRssKiB", peak()}});
      }
    }
    std::thread work([&] {
      try {
        engine->render(phrases[2], "af_heart", 1,
                       [](const auto &, bool) { return true; });
      } catch (const std::exception &) { /* Expected cancellation. */
      }
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    const auto stop = Clock::now();
    engine->cancel();
    work.join();
    emit({{"phase", "cancel"}, {"joinMs", ms(stop)}});
    engine.reset();
    emit({{"phase", "disposed"}, {"rssKiB", rss()}, {"peakRssKiB", peak()}});
  } catch (const std::exception &) {
    emit({{"phase", "error"}});
    return 1;
  }
}
