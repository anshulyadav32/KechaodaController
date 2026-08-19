# Kechaoda Controller

Kechaoda Controller is a React Native Bluetooth Low Energy (BLE) utility for discovering nearby devices and inspecting their GATT data. It provides a simple desktop-style interface for scanning, connecting, browsing services and characteristics, and monitoring Bluetooth events.

## Features

- Scan for nearby Bluetooth devices.
- Connect to and disconnect from discovered devices.
- View device names, identifiers, and signal strength.
- Discover primary and secondary GATT services.
- Inspect characteristic UUIDs and properties.
- Review connection, discovery, and error events in a live log.

## Requirements

- Node.js `>= 22.11.0`
- npm
- React Native development dependencies from the [official setup guide](https://reactnative.dev/docs/set-up-your-environment)
- A Bluetooth-capable Mac for the macOS target
- Android Studio and an Android device or emulator for Android development

## Setup

```sh
npm install
```

For Apple targets, install native dependencies after the first clone or whenever native dependencies change:

```sh
bundle install
bundle exec pod install --project-directory=ios
bundle exec pod install --project-directory=macos
```

## Run

Start Metro in one terminal:

```sh
npm start
```

Run the app on a connected device or emulator:

```sh
npm run android
npm run ios
```

The macOS app can be opened in Xcode from `macos/KechaodaController.xcworkspace` or run with the React Native CLI when the macOS development environment is configured.

## Development

```sh
npm test
npm run lint
```

Bluetooth access requires the appropriate platform permissions. On macOS, enable Bluetooth access for the app in **System Settings > Privacy & Security > Bluetooth**. Keep Bluetooth enabled and use a physical device when emulator support is unavailable.

## Project structure

- `App.tsx` - Bluetooth scanner and device inspector UI.
- `android/` - Android native project.
- `ios/` - iOS native project.
- `macos/` - macOS native project and Bluetooth bridge.
- `__tests__/` - Jest tests.

## License

No license has been declared yet. Add a `LICENSE` file before distributing this project publicly.
