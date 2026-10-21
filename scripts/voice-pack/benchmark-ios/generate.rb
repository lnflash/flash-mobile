#!/usr/bin/env ruby
# Generate a separate local benchmark app; never modifies Flash's app targets.
require 'xcodeproj'
require 'fileutils'
output, assets = ARGV
abort 'usage: generate.rb OUTPUT_DIRECTORY VERIFIED_PACK_DIRECTORY' unless output && assets
output = File.expand_path(output)
assets = File.expand_path(assets)
repo = File.expand_path('../../..', __dir__)
abort 'pack directory must exist and be named pack' unless File.directory?(assets) && File.basename(assets) == 'pack'
abort 'output directory must not already exist' if File.exist?(output)
FileUtils.mkdir_p(output)
project = Xcodeproj::Project.new(File.join(output, 'FlashVoiceBench.xcodeproj'))
target = project.new_target(:application, 'FlashVoiceBench', :ios, '15.1')
source = project.main_group.new_file(File.join(__dir__, 'App.swift'))
target.source_build_phase.add_file_reference(source)
pack = project.main_group.new_file(assets)
pack.last_known_file_type = 'folder'
target.resources_build_phase.add_file_reference(pack)
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.lnflash.voicebench',
    'DEVELOPMENT_TEAM' => 'H7UAM79QQP', 'CODE_SIGN_STYLE' => 'Automatic',
    'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.0',
    'BUILD_LIBRARY_FOR_DISTRIBUTION' => 'NO',
    'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES',
    'INFOPLIST_KEY_CFBundleDisplayName' => 'Flash Voice Bench',
    'IPHONEOS_DEPLOYMENT_TARGET' => '15.1'
  })
end
project.save
File.write(File.join(output, 'Podfile'), <<~PODS)
  platform :ios, '15.1'
  use_frameworks! :linkage => :static
  target 'FlashVoiceBench' do
    pod 'FlashSpeech', :path => '#{repo}/native/flash-speech'
  end
PODS
puts "Generated isolated benchmark project: #{output}"
