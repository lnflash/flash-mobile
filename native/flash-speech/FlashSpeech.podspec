Pod::Spec.new do |s|
  s.name = 'FlashSpeech'
  s.version = '0.1.0'
  s.summary = 'First-party offline speech engine for Ask Flash'
  s.homepage = 'https://github.com/lnflash/flash-mobile'
  s.license = { :type => 'MIT' }
  s.author = 'Flash'
  s.source = { :git => 'https://github.com/lnflash/flash-mobile.git', :tag => s.version.to_s }
  s.ios.deployment_target = '15.1'
  s.static_framework = true
  s.source_files = 'ios/*.{h,mm}', 'shared/*.{hpp,cpp}', 'third_party/**/*.{h,hpp}'
  s.public_header_files = 'ios/FlashSpeech.h'
  s.private_header_files = 'shared/*.hpp', 'third_party/**/*.{h,hpp}'
  s.resource_bundles = { 'FlashSpeechNotices' => ['notices/*.txt'] }
  s.frameworks = 'Foundation'
  s.libraries = 'c++'
  s.dependency 'onnxruntime-c', '1.23.0'
  s.pod_target_xcconfig = { 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17', 'DEFINES_MODULE' => 'YES' }
end
