#include "../shared/Engine.hpp"
#include "../shared/Pack.hpp"
#include <jni.h>
#include <string>
static std::string string(JNIEnv *env, jstring value) {
  const char *chars = env->GetStringUTFChars(value, nullptr);
  std::string out(chars);
  env->ReleaseStringUTFChars(value, chars);
  return out;
}
static void fail(JNIEnv *env) {
  env->ThrowNew(env->FindClass("java/lang/RuntimeException"),
                "Offline speech generation failed");
}
extern "C" JNIEXPORT jlong JNICALL
Java_com_lnflash_speech_NeuralRenderer_nativeCreate(JNIEnv *env, jclass,
                                                    jstring root) {
  try {
    return reinterpret_cast<jlong>(new flashspeech::Engine(string(env, root)));
  } catch (...) {
    fail(env);
    return 0;
  }
}
extern "C" JNIEXPORT void JNICALL
Java_com_lnflash_speech_NeuralRenderer_nativeDestroy(JNIEnv *, jclass,
                                                     jlong handle) {
  delete reinterpret_cast<flashspeech::Engine *>(handle);
}
extern "C" JNIEXPORT void JNICALL
Java_com_lnflash_speech_NeuralRenderer_nativeCancel(JNIEnv *, jclass,
                                                    jlong handle) {
  reinterpret_cast<flashspeech::Engine *>(handle)->cancel();
}
extern "C" JNIEXPORT void JNICALL
Java_com_lnflash_speech_NeuralRenderer_nativeRender(JNIEnv *env, jclass,
                                                    jlong handle, jstring text,
                                                    jstring voice, jfloat rate,
                                                    jobject listener) {
  try {
    jclass cls = env->GetObjectClass(listener);
    jmethodID chunk = env->GetMethodID(cls, "chunk", "([FZ)Z");
    if (!chunk) {
      fail(env);
      return;
    }
    reinterpret_cast<flashspeech::Engine *>(handle)->render(
        string(env, text), string(env, voice), rate,
        [&](const std::vector<float> &pcm, bool last) {
          jfloatArray data = env->NewFloatArray(pcm.size());
          if (!data)
            return false;
          env->SetFloatArrayRegion(data, 0, pcm.size(), pcm.data());
          jboolean result =
              env->CallBooleanMethod(listener, chunk, data, jboolean(last));
          env->DeleteLocalRef(data);
          return !env->ExceptionCheck() && result;
        });
    env->DeleteLocalRef(cls);
  } catch (...) {
    if (!env->ExceptionCheck())
      fail(env);
  }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lnflash_speech_NeuralRenderer_packManifest(JNIEnv *env, jclass) {
  return env->NewStringUTF(flashspeech::packManifest);
}
