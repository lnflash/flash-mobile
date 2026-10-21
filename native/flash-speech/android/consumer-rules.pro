# JNI exports and callbacks use these names in Release builds.
-keep class com.lnflash.speech.NeuralRenderer { *; }
-keep interface com.lnflash.speech.NeuralRenderer$Listener { *; }
-keepclassmembers class * implements com.lnflash.speech.NeuralRenderer$Listener {
    public boolean chunk(float[], boolean);
    public void done(boolean);
}
