#!/usr/bin/env ruby
# Isolated iOS downloader acceptance app; never changes Flash's app targets.
require 'xcodeproj'
require 'fileutils'
output = ARGV[0]
abort 'usage: generate.rb OUTPUT_DIRECTORY' unless output
output = File.expand_path(output)
repo = File.expand_path('../../..', __dir__)
abort 'output directory must not already exist' if File.exist?(output)
FileUtils.mkdir_p(output)
project = Xcodeproj::Project.new(File.join(output, 'FlashVoiceDeliveryCheck.xcodeproj'))
target = project.new_target(:application, 'FlashVoiceDeliveryCheck', :ios, '15.1')
[File.join(__dir__, 'App.swift'), File.join(repo, 'ios/LNFlash/SpeechPack.swift')].each do |path|
  target.source_build_phase.add_file_reference(project.main_group.new_file(path))
end
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.lnflash.voicedeliverycheck',
    'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.0',
    'BUILD_LIBRARY_FOR_DISTRIBUTION' => 'NO',
    'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES',
    'INFOPLIST_KEY_CFBundleDisplayName' => 'Flash Voice Delivery Check',
    'IPHONEOS_DEPLOYMENT_TARGET' => '15.1'
  })
end
project.save
File.write(File.join(output, 'Podfile'), <<~PODS)
  platform :ios, '15.1'
  use_frameworks! :linkage => :static
  target 'FlashVoiceDeliveryCheck' do
    pod 'FlashSpeech', :path => '#{repo}/native/flash-speech'
  end
PODS
puts "Generated isolated iOS delivery check: #{output}"
