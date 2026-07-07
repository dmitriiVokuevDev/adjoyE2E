# Android Emulator Setup

The test app is shipped as a signed APK. The app has a single **View ad** button on the home screen plus a small status panel showing what the app thinks it has sent. Tapping View ad opens a full-screen ad overlay; tapping the ad sends a click, and tapping the **X** in the corner dismisses the overlay.

We recommend running on an emulator rather than a physical device. The setup below is the one the task is calibrated against, using a significantly different profile may surface or hide bugs in ways we have not characterised.

## Recommended emulator profile

| Setting | Value |
|---|---|
| Device | Pixel 6 |
| System image | Android 13 (API level 33), Google APIs |
| ABI | x86_64 |
| RAM | 2048 MB or higher |
| Internal storage | 2 GB or higher |

### Creating the AVD

1. Open Android Studio.
2. **Tools → Device Manager → Create Device**.
3. Select **Pixel 6** → Next.
4. Select the **Tiramisu (API 33, x86_64, Google APIs)** system image. Download it if you don't have it cached.
5. Name the AVD anything you like. Finish.
6. Start the emulator from Device Manager.

## Installing the app

With the emulator running:

```sh
adb install android/app-release.apk
```

If you have multiple devices/emulators attached, target the emulator explicitly:

```sh
adb devices                  # find the emulator id, e.g. emulator-5554
adb -s emulator-5554 install android/app-release.apk
```

To reinstall after an update:

```sh
adb install -r android/app-release.apk
```

## Networking

An Android emulator does **not** see your host machine as `localhost`. It reaches your host on the special address `10.0.2.2`. The test app is pre-configured to call:

- Writer: `10.0.2.2:8081` (gRPC)
- Reader: `10.0.2.2:8082` (gRPC)
- Config: `10.0.2.2:8083` (REST, called once on app launch)

You do not need to run `adb reverse`. If you change the backend ports, you'll need to either rebuild the app or change ports back to the defaults.

The app fetches its client config from the config service on launch and caches the response for the rest of the session. See the OpenAPI spec (source: `backend/openapi.yaml`) for what the response looks like and how the SDK uses it. To pick up a fresh config, **fully restart the app**, not just background/foreground.

To confirm the emulator can reach the backend, from a shell inside the emulator (`adb shell`) or via the app's status panel:

```sh
adb shell
# inside the shell:
ping -c 2 10.0.2.2
```

## Launching the app

1. On the emulator home screen, find the **QA Test App** icon and tap to launch.
2. The app's status panel shows the configured backend URLs and an "events sent" counter.
3. Tap **View ad** to open the ad overlay. Tap the ad to send a click. Tap the **X** to close.

## Troubleshooting

- **Emulator very slow on macOS**: ensure hardware acceleration is enabled (HAXM on Intel, Hypervisor.framework on Apple Silicon, both default in modern Android Studio).
- **App immediately crashes**: capture a logcat and include it in your bug report.
