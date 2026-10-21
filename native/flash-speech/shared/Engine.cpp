#include "Engine.hpp"
#define ORT_API_MANUAL_INIT
#include "../third_party/nlohmann/json.hpp"
#include "../third_party/onnxruntime/onnxruntime_cxx_api.h"
#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <fstream>
#include <map>
#include <regex>
#include <sstream>
#include <stdexcept>
#ifdef __ANDROID__
#include <dlfcn.h>
#endif
namespace flashspeech {
using json = nlohmann::json;
namespace {
std::u32string decode(const std::string &s) {
  std::u32string out;
  for (size_t i = 0; i < s.size();) {
    unsigned char c = s[i++];
    char32_t v = c;
    int n = 0;
    if (c >= 0xF0) {
      v = c & 7;
      n = 3;
    } else if (c >= 0xE0) {
      v = c & 15;
      n = 2;
    } else if (c >= 0xC0) {
      v = c & 31;
      n = 1;
    } else if (c >= 0x80)
      throw std::runtime_error("Invalid UTF8");
    for (int k = 0; k < n; k++) {
      if (i >= s.size() || (static_cast<unsigned char>(s[i]) & 0xC0) != 0x80)
        throw std::runtime_error("Invalid UTF8");
      v = (v << 6) | (s[i++] & 63);
    }
    if (v > 0x10FFFF)
      throw std::runtime_error("Invalid UTF8");
    out.push_back(v);
  }
  return out;
}
std::string encode(const std::u32string &s) {
  std::string out;
  for (auto c : s) {
    if (c < 128)
      out += char(c);
    else if (c < 2048) {
      out += char(0xC0 | (c >> 6));
      out += char(0x80 | (c & 63));
    } else if (c < 65536) {
      out += char(0xE0 | (c >> 12));
      out += char(0x80 | ((c >> 6) & 63));
      out += char(0x80 | (c & 63));
    } else {
      out += char(0xF0 | (c >> 18));
      out += char(0x80 | ((c >> 12) & 63));
      out += char(0x80 | ((c >> 6) & 63));
      out += char(0x80 | (c & 63));
    }
  }
  return out;
}
std::string lower(std::string s) {
  for (char &c : s)
    if (c >= 'A' && c <= 'Z')
      c += 32;
  return s;
}
bool letter(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
void replaceAll(std::string &s, const std::string &a, const std::string &b) {
  size_t i = 0;
  while ((i = s.find(a, i)) != std::string::npos) {
    s.replace(i, a.size(), b);
    i += b.size();
  }
}
const char *small[] = {"zero",    "one",       "two",      "three",
                       "four",    "five",      "six",      "seven",
                       "eight",   "nine",      "ten",      "eleven",
                       "twelve",  "thirteen",  "fourteen", "fifteen",
                       "sixteen", "seventeen", "eighteen", "nineteen"};
std::string integer(uint64_t n) {
  if (n < 20)
    return small[n];
  if (n < 100) {
    static const char *tens[] = {"",       "",      "twenty", "thirty",
                                 "forty",  "fifty", "sixty",  "seventy",
                                 "eighty", "ninety"};
    return std::string(tens[n / 10]) + (n % 10 ? " " + integer(n % 10) : "");
  }
  if (n < 1000)
    return integer(n / 100) + " hundred" +
           (n % 100 ? " " + integer(n % 100) : "");
  for (auto scale : std::array<std::pair<uint64_t, const char *>, 5>{
           {{1000000000000000ULL, "quadrillion"},
            {1000000000000ULL, "trillion"},
            {1000000000ULL, "billion"},
            {1000000ULL, "million"},
            {1000ULL, "thousand"}}})
    if (n >= scale.first)
      return integer(n / scale.first) + " " + scale.second +
             (n % scale.first ? " " + integer(n % scale.first) : "");
  throw std::runtime_error("Number out of range");
}
std::string normalize(std::string s) {
  replaceAll(s, "’", "'");
  replaceAll(s, "‘", "'");
  replaceAll(s, "“", "\"");
  replaceAll(s, "”", "\"");
  replaceAll(s, "—", ",");
  replaceAll(s, "–", ",");
  replaceAll(s, "…", "...");
  replaceAll(s, "−", "-");
  auto digit = [](char c) { return c >= '0' && c <= '9'; };
  std::string out;
  for (size_t i = 0; i < s.size();) {
    if (!digit(s[i])) {
      char c = s[i++];
      if (c == '/')
        out += " slash ";
      else if (c == '@')
        out += " at ";
      else if (c == '_')
        out += " underscore ";
      else if (c == '%')
        out += " percent ";
      else if (c == '&')
        out += " and ";
      else if (c == '$')
        out += " dollars ";
      else if (c == '-') {
        const bool numericSign =
            i < s.size() && digit(s[i]) &&
            (i == 1 || std::isspace(static_cast<unsigned char>(s[i - 2])) ||
             std::string("([{:=,$").find(s[i - 2]) != std::string::npos);
        out += numericSign ? " minus " : " dash ";
      } else
        out += c;
      continue;
    }
    size_t end = i;
    while (end < s.size() && (digit(s[end]) || s[end] == ','))
      end++;
    std::string run = s.substr(i, end - i);
    while (!run.empty() && run.back() == ',') {
      run.pop_back();
      end--;
    }
    bool grouped =
        std::regex_match(run, std::regex("[0-9]{1,3}(,[0-9]{3})+")) ||
        std::regex_match(run, std::regex("[0-9]{1,2}(,[0-9]{2})*,[0-9]{3}"));
    if (!grouped) {
      end = i;
      while (end < s.size() && digit(s[end]))
        end++;
      run = s.substr(i, end - i);
    } else
      run.erase(std::remove(run.begin(), run.end(), ','), run.end());
    i = end;
    if (!out.empty() && out.back() != ' ')
      out += ' ';
    if (run.size() > 16 || (run.size() > 1 && run[0] == '0')) {
      for (char c : run)
        out += std::string(small[c - '0']) + " ";
    } else
      out += integer(std::stoull(run));
    if (i + 1 < s.size() && s[i] == '.' && digit(s[i + 1])) {
      out += " point";
      i++;
      while (i < s.size() && digit(s[i])) {
        out += " ";
        out += small[s[i++] - '0'];
      }
    }
    out += ' ';
  }
  return out;
}
std::vector<std::string> words(const std::string &text) {
  std::vector<std::string> out;
  for (size_t i = 0; i < text.size();) {
    if (letter(text[i])) {
      auto start = i++;
      while (i < text.size() && (letter(text[i]) || text[i] == '\''))
        i++;
      out.push_back(text.substr(start, i - start));
    } else {
      if (std::string(";:,.!?()\"").find(text[i]) != std::string::npos)
        out.push_back(text.substr(i, 1));
      else if (static_cast<unsigned char>(text[i]) >= 128)
        throw std::runtime_error("Unsupported pronunciation character");
      i++;
    }
  }
  return out;
}
void initialize() {
  static std::once_flag once;
  std::call_once(once, [] {
#ifdef __ANDROID__
    auto lib = dlopen("libonnxruntime.so", RTLD_NOW | RTLD_LOCAL);
    if (!lib)
      throw std::runtime_error("Speech runtime unavailable");
    auto entry = reinterpret_cast<const OrtApiBase *(ORT_API_CALL *)()>(
        dlsym(lib, "OrtGetApiBase"));
    if (!entry)
      throw std::runtime_error("Speech runtime unavailable");
    Ort::InitApi(entry()->GetApi(ORT_API_VERSION));
#else
 Ort::InitApi(OrtGetApiBase()->GetApi(ORT_API_VERSION));
#endif
  });
}
std::vector<float> readStyle(const std::string &path) {
  std::ifstream f(path, std::ios::binary | std::ios::ate);
  if (!f || f.tellg() != 522240)
    throw std::runtime_error("Voice data unavailable");
  f.seekg(0);
  std::vector<float> v(522240 / 4);
  f.read(reinterpret_cast<char *>(v.data()), 522240);
  return v;
}
} // namespace
struct Engine::Impl {
  Ort::Env env{ORT_LOGGING_LEVEL_ERROR, "flash-speech"};
  Ort::SessionOptions options;
  std::unique_ptr<Ort::Session> speech, g2p;
  json front;
  std::map<std::string, std::vector<float>> styles;
  std::map<std::string, std::string> predictions;
  std::atomic<uint64_t> generation{0};
  uint64_t epoch = 0;
  std::mutex mutex;
  std::shared_ptr<Ort::RunOptions> running;
  explicit Impl(const std::string &root) {
#ifdef __ANDROID__
    // The pinned Android runtime already includes XNNPACK. Keep ORT's CPU
    // fallback pool single-threaded so it does not compete with XNNPACK.
    options.SetIntraOpNumThreads(1);
    options.AppendExecutionProvider("XNNPACK", {{"intra_op_num_threads", "2"}});
    options.AddConfigEntry("session.intra_op.allow_spinning", "0");
#else
    options.SetIntraOpNumThreads(2);
#endif
    options.SetInterOpNumThreads(1);
    options.DisableCpuMemArena();
    options.SetGraphOptimizationLevel(
        GraphOptimizationLevel::ORT_ENABLE_EXTENDED);
    std::ifstream file(root + "/frontend.json");
    if (!file)
      throw std::runtime_error("Pronunciation data unavailable");
    file >> front;
    if (front.at("format") != 1 || front.at("lexicons").size() != 2)
      throw std::runtime_error("Invalid pronunciation data");
    speech = std::make_unique<Ort::Session>(env, (root + "/model.onnx").c_str(),
                                            options);
    g2p = std::make_unique<Ort::Session>(env, (root + "/g2p.onnx").c_str(),
                                         options);
    for (auto id : {"af_heart", "am_michael", "bf_emma"})
      styles[id] = readStyle(root + "/" + id + ".bin");
  }
  void check() {
    if (epoch != generation.load())
      throw std::runtime_error("Canceled");
  }
  std::vector<Ort::Value> run(Ort::Session &session,
                              const std::vector<const char *> &names,
                              std::vector<Ort::Value> &feeds,
                              const char *output) {
    auto opts = std::make_shared<Ort::RunOptions>();
#ifdef __ANDROID__
    // XNNPACK's process-wide CPU arena otherwise retains the largest temporary
    // buffers even after the engine is disposed. Return unused regions per run.
    opts->AddConfigEntry("memory.enable_memory_arena_shrinkage", "cpu:0");
#endif
    {
      std::lock_guard<std::mutex> lock(mutex);
      check();
      running = opts;
    }
    try {
      auto values = session.Run(*opts, names.data(), feeds.data(), feeds.size(),
                                &output, 1);
      {
        std::lock_guard<std::mutex> lock(mutex);
        if (running == opts)
          running.reset();
      }
      check();
      return values;
    } catch (...) {
      std::lock_guard<std::mutex> lock(mutex);
      if (running == opts)
        running.reset();
      throw;
    }
  }
  std::string entry(const std::string &word, bool gb) {
    const auto &dict = front["lexicons"][gb ? "gb" : "us"];
    for (auto key : {word, lower(word)}) {
      auto it = dict.find(key);
      if (it != dict.end() && it->is_string())
        return it->get<std::string>();
    }
    return "";
  }
  std::string letters(const std::string &word, bool gb) {
    std::string out;
    for (char c : word) {
      if (!letter(c))
        continue;
      if (c >= 'a' && c <= 'z')
        c -= 32;
      auto ps = entry(std::string(1, c), gb);
      if (ps.empty())
        throw std::runtime_error("Pronunciation unavailable");
      out += ps + " ";
    }
    return out;
  }
  std::string predict(const std::string &word) {
    auto found = predictions.find(word);
    if (found != predictions.end())
      return found->second;
    const auto graphemes = front.at("graphemes").get<std::string>();
    const auto symbols = decode(front.at("phonemes").get<std::string>());
    std::vector<int64_t> ids{front.at("bos_id").get<int64_t>()};
    for (char c : word) {
      auto i = graphemes.find(c);
      ids.push_back(i == std::string::npos
                        ? front.at("unknown_id").get<int64_t>()
                        : static_cast<int64_t>(i));
    }
    ids.push_back(front.at("eos_id").get<int64_t>());
    std::vector<int64_t> decoder{front.at("start_id").get<int64_t>()};
    auto memory =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    for (int step = 0; step < 63; step++) {
      check();
      std::array<int64_t, 2> a{1, int64_t(ids.size())},
          b{1, int64_t(decoder.size())};
      std::vector<Ort::Value> feeds;
      feeds.push_back(Ort::Value::CreateTensor<int64_t>(
          memory, ids.data(), ids.size(), a.data(), 2));
      feeds.push_back(Ort::Value::CreateTensor<int64_t>(
          memory, decoder.data(), decoder.size(), b.data(), 2));
      auto result =
          run(*g2p, {"input_ids", "decoder_input_ids"}, feeds, "logits");
      auto shape = result[0].GetTensorTypeAndShapeInfo().GetShape();
      if (shape.size() != 3 || shape[0] != 1 ||
          shape[2] < int64_t(symbols.size()) || shape[2] > 256)
        throw std::runtime_error("Invalid pronunciation model output");
      auto row = result[0].GetTensorData<float>() + (shape[1] - 1) * shape[2];
      auto best = std::max_element(row, row + shape[2]) - row;
      if (best >= int64_t(symbols.size()))
        throw std::runtime_error("Invalid pronunciation symbol");
      decoder.push_back(best);
      if (best == front.at("eos_id").get<int64_t>())
        break;
    }
    std::u32string result;
    for (auto id : decoder)
      if (id > 3 && id < int64_t(symbols.size()))
        result += symbols[id];
    auto ps = encode(result);
    if (predictions.size() > 128)
      predictions.clear();
    predictions[word] = ps;
    return ps;
  }
  std::string word(const std::string &w, bool gb, const std::string &next) {
    if (w == "the" || w == "The") {
      auto ps = decode(entry(next, gb));
      while (ps.size() && (ps.front() == U'ˈ' || ps.front() == U'ˌ'))
        ps.erase(ps.begin());
      return ps.size() &&
                     std::u32string(U"AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ").find(ps.front()) !=
                         std::u32string::npos
                 ? "ði"
                 : "ðə";
    }
    if (w == "a" || w == "A")
      return next.empty() ? "ˈA" : "ɐ";
    if (w == "I")
      return "ˌI";
    if (w == "to" || w == "To")
      return next.empty() ? entry("to", gb) : "tə";
    if (w.size() > 1 && std::all_of(w.begin(), w.end(), [](char c) {
          return c >= 'A' && c <= 'Z';
        }))
      return letters(w, gb);
    auto ps = entry(w, gb);
    if (!ps.empty())
      return ps;
    auto low = lower(w);
    std::vector<std::pair<std::string, std::string>> stems;
    if (low.size() > 3 && low.back() == 's') {
      stems.push_back({low.substr(0, low.size() - 1), "s"});
      if (low.size() > 4 && low.substr(low.size() - 2) == "es")
        stems.push_back({low.substr(0, low.size() - 2), "s"});
      if (low.size() > 4 && low.substr(low.size() - 3) == "ies")
        stems.push_back({low.substr(0, low.size() - 3) + "y", "s"});
    }
    if (low.size() > 4 && low.substr(low.size() - 2) == "ed") {
      stems.push_back({low.substr(0, low.size() - 1), "ed"});
      stems.push_back({low.substr(0, low.size() - 2), "ed"});
    }
    if (low.size() > 5 && low.substr(low.size() - 3) == "ing") {
      stems.push_back({low.substr(0, low.size() - 3), "ing"});
      stems.push_back({low.substr(0, low.size() - 3) + "e", "ing"});
      stems.push_back({low.substr(0, low.size() - 4), "ing"});
    }
    for (auto &stem : stems) {
      ps = entry(stem.first, gb);
      if (ps.empty())
        continue;
      auto chars = decode(ps);
      auto last = chars.back();
      if (stem.second == "s")
        return ps +
               (std::u32string(U"ptkfθ").find(last) != std::u32string::npos
                    ? "s"
                : std::u32string(U"szʃʒʧʤ").find(last) != std::u32string::npos
                    ? (gb ? "ɪz" : "ᵻz")
                    : "z");
      if (stem.second == "ed")
        return ps +
               (last == U't' || last == U'd' ? "ᵻd"
                : std::u32string(U"pkfθʃsʧ").find(last) != std::u32string::npos
                    ? "t"
                    : "d");
      return ps + "ɪŋ";
    }
    if (w.size() > 24)
      return letters(w, gb);
    ps = predict(low);
    return ps.empty() ? letters(w, gb) : ps;
  }
  std::string phonemize(const std::string &text, bool gb) {
    const auto &cache = front["sentences"][gb ? "gb" : "us"];
    auto found = cache.find(text);
    if (found != cache.end())
      return found->get<std::string>();
    auto tokens = words(normalize(text));
    std::string result;
    for (size_t i = 0; i < tokens.size(); i++) {
      check();
      auto &token = tokens[i];
      if (!letter(token[0])) {
        result += token;
        continue;
      }
      std::string next = i + 1 < tokens.size() && letter(tokens[i + 1][0])
                             ? tokens[i + 1]
                             : "";
      if (result.size() && result.back() != '(' && result.back() != '\"')
        result += ' ';
      result += word(token, gb, next);
    }
    return result;
  }
};
Engine::Engine(const std::string &root) {
  initialize();
#ifdef __ANDROID__
  // A canceled renderer may still be loading when its replacement starts.
  // Serialize XNNPACK's lazy process-wide allocator initialization.
  static std::mutex creationMutex;
  std::lock_guard<std::mutex> lock(creationMutex);
#endif
  impl = std::make_unique<Impl>(root);
}
Engine::~Engine() = default;
void Engine::cancel() {
  impl->generation.fetch_add(1);
  std::lock_guard<std::mutex> lock(impl->mutex);
  if (impl->running)
    impl->running->SetTerminate();
}
std::string Engine::phonemize(const std::string &text, bool gb) {
  impl->epoch = impl->generation.load();
  return impl->phonemize(text, gb);
}
void Engine::render(
    const std::string &text, const std::string &voice, float speed,
    const std::function<bool(const std::vector<float> &, bool)> &callback) {
  if (text.empty() || text.size() > 16000 || !std::isfinite(speed) ||
      speed < 0.8f || speed > 1.2f || !impl->styles.count(voice))
    throw std::runtime_error("Unsupported speech request");
  impl->epoch = impl->generation.load();
  auto phonemes = decode(impl->phonemize(text, voice == "bf_emma"));
  if (phonemes.empty())
    throw std::runtime_error("Pronunciation unavailable");
  auto memory =
      Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
  size_t pos = 0;
  size_t totalSamples = 0;
  int chunks = 0;
  while (pos < phonemes.size()) {
    impl->check();
    size_t target = pos == 0 ? 100 : 180;
    size_t end = std::min(pos + target, phonemes.size());
    if (end < phonemes.size()) {
      size_t cut = end;
      for (size_t i = pos + std::min<size_t>(40, target / 2); i < end; i++)
        if (std::u32string(U".,!?;:").find(phonemes[i]) != std::u32string::npos)
          cut = i + 1;
      if (cut == end) {
        while (cut > pos + 30 && phonemes[cut - 1] != U' ')
          cut--;
      }
      if (cut > pos + 30)
        end = cut;
    }
    std::vector<int64_t> ids{0};
    for (size_t i = pos; i < end; i++) {
      auto key = encode(std::u32string(1, phonemes[i]));
      auto it = impl->front["kokoro_vocab"].find(key);
      if (it == impl->front["kokoro_vocab"].end())
        throw std::runtime_error("Unsupported pronunciation token");
      ids.push_back(it->get<int64_t>());
    }
    ids.push_back(0);
    std::array<int64_t, 2> inputShape{1, int64_t(ids.size())},
        styleShape{1, 256};
    std::array<int64_t, 1> speedShape{1};
    float *style = impl->styles.at(voice).data() + (ids.size() - 2) * 256;
    std::vector<Ort::Value> feeds;
    feeds.push_back(Ort::Value::CreateTensor<int64_t>(
        memory, ids.data(), ids.size(), inputShape.data(), 2));
    feeds.push_back(Ort::Value::CreateTensor<float>(memory, style, 256,
                                                    styleShape.data(), 2));
    feeds.push_back(Ort::Value::CreateTensor<float>(memory, &speed, 1,
                                                    speedShape.data(), 1));
    auto output = impl->run(*impl->speech, {"input_ids", "style", "speed"},
                            feeds, "waveform");
    auto count = output[0].GetTensorTypeAndShapeInfo().GetElementCount();
    if (count == 0 || count > 24000 * 30)
      throw std::runtime_error("Invalid generated audio");
    auto data = output[0].GetTensorData<float>();
    std::vector<float> samples(data, data + count);
    for (float &v : samples) {
      if (!std::isfinite(v))
        throw std::runtime_error("Invalid generated audio");
      v = std::max(-1.0f, std::min(1.0f, v));
    }
    totalSamples += count;
    if (totalSamples > 24000 * 120 || ++chunks > 32)
      throw std::runtime_error("Speech exceeds duration limit");
    impl->check();
    if (!callback(samples, end == phonemes.size())) {
      cancel();
      return;
    }
    pos = end;
  }
}
} // namespace flashspeech
