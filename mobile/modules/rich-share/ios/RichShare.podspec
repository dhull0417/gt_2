Pod::Spec.new do |s|
  s.name           = 'RichShare'
  s.version        = '1.0.0'
  s.summary        = 'Share sheet with a title and picture in its preview header'
  s.description    = 'Opens UIActivityViewController with a message and LPLinkMetadata for the header.'
  s.license        = 'UNLICENSED'
  s.author         = 'GroupThat'
  s.homepage       = 'https://groupthatapp.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'LinkPresentation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
