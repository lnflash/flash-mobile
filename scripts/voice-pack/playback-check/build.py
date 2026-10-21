#!/usr/bin/env python3
"""Build a separate tiny device regression app using the compiled production PCM writer.

First run :app:compileDebugKotlin. Requires ANDROID_HOME (or Android local.properties),
SDK build-tools and a JDK. The APK never accesses Flash data or the network.
"""
import argparse
import os
import pathlib
import re
import subprocess
import tempfile
import zipfile


def build(output):
    repo = pathlib.Path(__file__).resolve().parents[3]
    source = pathlib.Path(__file__).with_name('PlaybackCheckActivity.java')
    sdk_path = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk_path:
        properties = (repo / 'android/local.properties').read_text()
        sdk_path = re.search(r'^sdk.dir=(.+)$', properties, re.M)[1]
    sdk = pathlib.Path(sdk_path)
    config = (repo / 'android/build.gradle').read_text()
    kotlin = re.search(r'kotlinVersion = "([^"]+)"', config)[1]
    api = re.search(r'compileSdkVersion = (\d+)', config)[1]
    android = sdk / ('platforms/android-' + api) / 'android.jar'
    tools = sdk / 'build-tools' / re.search(r'buildToolsVersion = "([^"]+)"', config)[1]
    stdlib = next((pathlib.Path.home() / '.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib' / kotlin).glob('*/kotlin-stdlib-' + kotlin + '.jar'))
    compiled = repo / 'android/app/build/tmp/kotlin-classes/debug'
    helper = compiled / 'com/lnflash/assistant/NeuralPcmWriter.class'
    if not helper.exists():
        raise RuntimeError('Run :app:compileDebugKotlin first')
    output = pathlib.Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    key = output.parent / 'playback-check-debug.keystore'
    if not key.exists():
        subprocess.run(['keytool', '-genkeypair', '-alias', 'playbackcheck', '-keyalg', 'RSA',
                        '-keysize', '2048', '-validity', '365', '-keystore', str(key),
                        '-storepass', 'android', '-keypass', 'android', '-dname', 'CN=Flash Playback Check'], check=True)
    with tempfile.TemporaryDirectory(prefix='flash-playback-check-') as folder:
        work = pathlib.Path(folder)
        classes = work / 'classes'; classes.mkdir()
        subprocess.run(['javac', '--release', '8', '-cp', os.pathsep.join(map(str, [android, stdlib, compiled])), '-d', str(classes), str(source)], check=True)
        with zipfile.ZipFile(work / 'helper.jar', 'w') as archive:
            archive.write(helper, 'com/lnflash/assistant/NeuralPcmWriter.class')
        dex = work / 'dex'; dex.mkdir()
        subprocess.run([str(tools / 'd8'), '--min-api', '26', '--lib', str(android), '--output', str(dex),
                        str(work / 'helper.jar'), str(stdlib), *map(str, classes.rglob('*.class'))], check=True)
        manifest = work / 'AndroidManifest.xml'
        manifest.write_text('''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.lnflash.voiceplayercheck">
<application android:label="Voice playback check" android:debuggable="true" android:allowBackup="false">
<activity android:name="com.lnflash.assistant.PlaybackCheckActivity" android:exported="true" />
</application></manifest>''')
        apk = work / 'unsigned.apk'
        subprocess.run([str(tools / 'aapt2'), 'link', '-I', str(android), '--manifest', str(manifest), '-o', str(apk), '--min-sdk-version', '26', '--target-sdk-version', api], check=True)
        with zipfile.ZipFile(apk, 'a') as archive:
            archive.write(dex / 'classes.dex', 'classes.dex')
        aligned = work / 'aligned.apk'
        subprocess.run([str(tools / 'zipalign'), '-f', '4', str(apk), str(aligned)], check=True)
        # Separate public test key; never reads Flash's app/store signing keys.
        subprocess.run([str(tools / 'apksigner'), 'sign', '--ks', str(key),
                        '--ks-key-alias', 'playbackcheck', '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
                        '--out', str(output), str(aligned)], check=True)
    print('Built isolated playback check:', output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    build(parser.parse_args().output)
