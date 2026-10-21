cmake_minimum_required(VERSION 3.22.1)
project(flashspeech)
add_library(flashspeech SHARED NativeEngine.cpp ../shared/Engine.cpp)
target_compile_features(flashspeech PRIVATE cxx_std_17)
target_link_libraries(flashspeech dl log)

# NDK 27 otherwise emits 4 KB LOAD segments; support 16 KB Android devices.
target_link_options(flashspeech PRIVATE "-Wl,-z,max-page-size=16384")
