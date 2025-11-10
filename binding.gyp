{
  "targets": [
    {
      "target_name": "keymonitor",
      "sources": [
        "src/native/key-monitor.mm"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        [
          "OS=='mac'",
          {
            "xcode_settings": {
              "OTHER_CPLUSPLUSFLAGS": [
                "-std=c++17",
                "-stdlib=libc++"
              ],
              "OTHER_LDFLAGS": [
                "-framework CoreFoundation",
                "-framework IOKit",
                "-framework Carbon"
              ],
              "MACOSX_DEPLOYMENT_TARGET": "10.13"
            }
          }
        ]
      ]
    }
  ]
}
