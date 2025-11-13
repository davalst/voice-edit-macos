/**
 * Native Key Monitor for macOS
 *
 * Uses IOKit to detect Fn and Ctrl key presses/releases.
 * This is necessary because the Fn key doesn't generate normal keyboard events.
 */

#include <napi.h>
#import <Foundation/Foundation.h>
#import <IOKit/hidsystem/IOHIDLib.h>
#import <IOKit/hidsystem/ev_keymap.h>
#import <Carbon/Carbon.h>

// Key state tracking
static bool fnKeyPressed = false;
static bool ctrlKeyPressed = false;
static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;

// JavaScript callback for key events
static Napi::ThreadSafeFunction tsfn;

/**
 * Event tap callback - intercepts all keyboard events
 */
CGEventRef eventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
  // Only process key down/up events
  if (type != kCGEventKeyDown && type != kCGEventKeyUp && type != kCGEventFlagsChanged) {
    return event;
  }

  CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  CGEventFlags flags = CGEventGetFlags(event);

  // Track Fn key state (keycode 63 or detected via flags)
  bool fnNowPressed = (flags & kCGEventFlagMaskSecondaryFn) != 0;

  // Track Ctrl key state
  bool ctrlNowPressed = (flags & kCGEventFlagMaskControl) != 0;

  // Detect state changes
  bool fnChanged = (fnNowPressed != fnKeyPressed);
  bool ctrlChanged = (ctrlNowPressed != ctrlKeyPressed);

  // CRITICAL FIX: Ignore arrow keys (123=left, 124=right, 125=down, 126=up)
  // Arrow keys with Fn pressed trigger Home/End/PageUp/PageDown, causing false Fn state changes
  if (keyCode == 123 || keyCode == 124 || keyCode == 125 || keyCode == 126) {
    return event; // Pass through arrow keys without triggering state change
  }

  // CRITICAL FIX: Only trigger on FlagsChanged events (modifier-only changes)
  // This prevents regular key presses from triggering false state changes
  if (type == kCGEventFlagsChanged && (fnChanged || ctrlChanged)) {
    fnKeyPressed = fnNowPressed;
    ctrlKeyPressed = ctrlNowPressed;

    // Prepare event data for JavaScript
    auto callback = [](Napi::Env env, Napi::Function jsCallback, bool* data) {
      bool fn = data[0];
      bool ctrl = data[1];

      Napi::Object eventObj = Napi::Object::New(env);
      eventObj.Set("fnPressed", Napi::Boolean::New(env, fn));
      eventObj.Set("ctrlPressed", Napi::Boolean::New(env, ctrl));
      eventObj.Set("timestamp", Napi::Number::New(env, CFAbsoluteTimeGetCurrent()));

      jsCallback.Call({eventObj});

      delete[] data;
    };

    // Send to JavaScript
    if (tsfn) {
      bool* data = new bool[2];
      data[0] = fnKeyPressed;
      data[1] = ctrlKeyPressed;
      tsfn.NonBlockingCall(data, callback);
    }

    // CRITICAL: Suppress Fn key to prevent macOS emoji picker
    // Return NULL to block the event from reaching other apps
    if (fnChanged) {
      return NULL;
    }
  }

  return event;
}

/**
 * Start monitoring key events
 */
Napi::Value StartMonitoring(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Create thread-safe function for callbacks
  tsfn = Napi::ThreadSafeFunction::New(
    env,
    info[0].As<Napi::Function>(),
    "KeyMonitorCallback",
    0,
    1
  );

  // Create event tap to monitor all keyboard events
  CGEventMask eventMask = (1 << kCGEventKeyDown) | (1 << kCGEventKeyUp) | (1 << kCGEventFlagsChanged);

  eventTap = CGEventTapCreate(
    kCGSessionEventTap,
    kCGHeadInsertEventTap,
    kCGEventTapOptionDefault,
    eventMask,
    eventTapCallback,
    NULL
  );

  if (!eventTap) {
    Napi::Error::New(env, "Failed to create event tap. Please grant Accessibility permissions.").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  // Add to run loop
  runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
  CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
  CGEventTapEnable(eventTap, true);

  return Napi::Boolean::New(env, true);
}

/**
 * Stop monitoring key events
 */
Napi::Value StopMonitoring(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (eventTap) {
    CGEventTapEnable(eventTap, false);
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
    CFRelease(runLoopSource);
    CFRelease(eventTap);
    eventTap = NULL;
    runLoopSource = NULL;
  }

  if (tsfn) {
    tsfn.Release();
  }

  fnKeyPressed = false;
  ctrlKeyPressed = false;

  return Napi::Boolean::New(env, true);
}

/**
 * Get current key states
 */
Napi::Value GetKeyStates(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  Napi::Object result = Napi::Object::New(env);
  result.Set("fnPressed", Napi::Boolean::New(env, fnKeyPressed));
  result.Set("ctrlPressed", Napi::Boolean::New(env, ctrlKeyPressed));

  return result;
}

/**
 * Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startMonitoring", Napi::Function::New(env, StartMonitoring));
  exports.Set("stopMonitoring", Napi::Function::New(env, StopMonitoring));
  exports.Set("getKeyStates", Napi::Function::New(env, GetKeyStates));

  return exports;
}

NODE_API_MODULE(keymonitor, Init)
