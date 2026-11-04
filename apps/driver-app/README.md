# Send Koro Driver (Flutter, iOS + Android)

One Flutter codebase for both stores. Matches the Driver iOS and Android designs in `docs/DESIGNS.md`: offers show distance, total time and locked pay; two orders on one route; Stripe payout setup; the NYC pay guarantee.

## Run it

You need Flutter 3.29 or newer (`flutter --version`).

```bash
cd apps/driver-app
./tool/bootstrap.sh          # once: creates android/ and ios/ with location permissions
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:3001/v1     # Android emulator → local API
# iOS simulator:  --dart-define=API_URL=http://localhost:3001/v1
# Production:     --dart-define=API_URL=https://api.sendkoro.com/v1
```

Sign-in codes print in the API log while `SMS_PROVIDER=console`. A new driver must be approved in the admin console (Drivers) and finish Stripe payout setup before going online.

Commit the generated `android/` and `ios/` folders after the first bootstrap, so store builds use your signing settings.

## Screens

| Screen | What it does |
|---|---|
| Sign in | Phone number → 6-digit code (one flow for new and returning drivers) |
| Apply | Name, email, vehicle (bike, e-bike, car, on foot). No subscription, no fees |
| Almost ready | Stripe payout setup (opens Stripe), approval status, "Check again" |
| Drive | Online switch. Location is sent while online. **Offer card:** locked pay, distance, total time, stops, 45-second countdown, accept or decline. **Trip:** pick up every order, then deliver; navigate (Google Maps), call, "I'm at the restaurant", "Picked up", "Mark delivered" |
| Earnings | This week: offer pay, tips (100% yours), NYC minimum top-up, total; how the minimum was checked; recent deliveries |
| Account | Profile, Stripe payouts, support, sign out |

## How it talks to the server

- **Endpoints:** everything in `lib/api/api_client.dart` maps to `/v1/driver/*` in `docs/API.md`.
- **Polling:** while online, the app checks for offers every 4 seconds and refreshes the trip. The server re-offers every 10 seconds and hands orders nobody accepts to Uber Direct or DoorDash.
- **Payment on delivery:** "Mark delivered" makes the payments service transfer exactly the locked pay plus the whole tip to the driver's Stripe account.
- **Session storage:** the session is kept in `shared_preferences`. Move it to the Keychain/Keystore (`flutter_secure_storage`) before the store release.

## Checks

GitHub Actions runs `flutter analyze`, `flutter test` and a debug APK build on every push (`.github/workflows/ci.yml`, job "driver-app").

## Not built yet

- **Push notifications** for offers (FCM/APNs). The app polls while open.
- **Background location** (the app uses foreground location only).
- **Proof-of-delivery photo.** The API accepts a URL, but upload storage isn't set up.
- **In-app map.** Navigation opens Google Maps.
