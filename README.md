# F1 Championship — Android screenshot scorer

An Android app for the custom 22-driver F1 championship. **George Russell = Shloak** and **Lewis Hamilton = Rishi** by default. Players can be added, renamed, removed, or assigned to another F1 driver at any time. Human players and AI drivers appear on **the same standings table**.

## What's included

- All **22 drivers** and their original teams, with **Race 1, Race 2, and Race 3** already entered from the supplied screenshots and spreadsheet.
- Combined driver's championship, constructors' championship, points gap, race wins, podiums, and countback tie-breaking.
- **Camera/gallery photo import** through Android's image picker.
- **Improved dual-pass on-device OCR** using Google's bundled ML Kit model (Latin): scans the original image, then isolates/enlarges/enhances the dark score table and scans again. Combines the results using row geometry and fuzzy driver-name matching. No screenshot ever leaves your device.
- Scan **two or more overlapping images of the same race**: the OCR merges the detected drivers and positions. Conflicts, uncertain matches and inferred ranks are flagged for review; two drivers cannot receive the same position.
- Always **review/correct the OCR result**, then confirm the race. Points update instantly and persist on the phone. Optional DNF marking.
- Both Grand Prix scoring (25–18–15–12–10–8–6–4–2–1) and Sprint scoring (8–7–6–5–4–3–2–1). No fastest-lap bonus.
- **PLAYERS tab:** add human racers, rename them, reassign them to F1 seats, or remove their human assignment. Removing a player returns that seat to AI without deleting historic race results. Previously used names remain OCR aliases after a rename.
- Export cumulative standings plus per-race points to a **CSV that opens in Excel**.
- No user account, no external photo service, no internet permission in the installed app.

## Build the installable APK (Android Studio)

**Requirements:** Android Studio with JDK 17 and an internet connection for Gradle's first dependency download.

1. Extract this project ZIP and open its `F1ChampionshipAndroid` folder in Android Studio (**Open Existing Project**).
2. Allow Gradle to sync and install Android SDK 35 if prompted.
3. Choose **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Find the installable APK at `app/build/outputs/apk/debug/app-debug.apk`.
5. Transfer the APK to your Android phone and install it. Android may ask you to allow installs from that source.

**Important:** Championship/position-parser unit tests run in Node and GitHub Actions compiles the APK. OCR uses the same bundled model as the previous APK; photo accuracy is image-dependent and real-device recognition still needs checking with sample photographs.

## Build APK in GitHub Actions (no Android Studio needed)

1. Create a fresh GitHub repository. Extract this ZIP and upload/push **the files inside the `F1ChampionshipAndroid` folder** to the root of the repository's `main` branch (including `.github/workflows/build-apk.yml`).
2. Open **Actions → Build F1 Championship APK → latest successful run**.
3. Download the `F1-Championship-APK` artifact. Unzip it to get `app-debug.apk`.

The workflow sets up Java 17, Android SDK 35, Gradle 8.9, tests the championship parser, and builds the debug APK. Do not publish a debug APK to the Play Store; create a release-signed build for distribution.

## How to add Race 4 and later

1. Open **ADD RACE** and tap **CHOOSE SCREENSHOT / PHOTO**.
2. Choose the top-half image of a finished F1 race results screen. OCR fills in the drivers it recognizes.
3. Tap the same button and choose a bottom-half screenshot. Overlapping rows are merged.
4. The app runs original + enhanced OCR, then shows how many of the 22 finishers were recognized. It flags uncertain/estimated positions. Manually fix unclear/missing positions or DNF flags; manual corrections remain locked against subsequent OCR scans.
5. Enter a race name, choose Grand Prix/Sprint, and tap **CONFIRM RACE**.
6. View the newly calculated combined championship and optionally **EXPORT CSV**.

**Note:** Camera photos of a monitor are harder for OCR than clean digital screenshots. Crop out the keyboard/wall if needed, keep the results table large and sharp, and always verify the finish order before confirming. Wrong OCR is never silently accepted into standings.

## Test the scoring and OCR parsing logic

On any system with Node.js v18+:

```sh
node --test tests/*.test.cjs
```

This verifies the seeded 22-player race results, official points, team standings, CSV output, position recognition, and adding a new race.

## Project layout

- `app/src/main/java/com/f1championship/tracker/MainActivity.java`: native Android image picker, bundled ML Kit OCR, local state storage, CSV export.
- `app/src/main/assets/index.html`: offline WebView screen.
- `app/src/main/assets/style.css`: F1-themed mobile UI.
- `app/src/main/assets/app.js`: standings, race review, editing, and saving.
- `app/src/main/assets/core.js`: pure F1 scoring, tie-breakers, and OCR result matching.
- `app/src/main/assets/data.js`: seeded results from Races 1–3.
- `.github/workflows/build-apk.yml`: cloud APK build workflow.

## Player names, positions and historical scoring

The app **always saves results using official F1 driver IDs**, never a custom player's name. A rename changes every live leaderboard, constructors stay tied to the F1 cars, and earlier race results are not altered. Previously used names remain available as OCR aliases.

Adding a player to an unoccupied F1 car makes them the human controlling that car. Their displayed championship total is that car's accumulated points (including earlier races); the app does not retroactively invent scores for human participants. Removing a player returns the car to AI and preserves its results. The original Shloak/Russell and Rishi/Hamilton assignments are editable.

## Better photo recognition

- The native scanner performs one pass on the original image and another on an enhanced high-contrast view of the dark race-results panel. It does not depend on an OpenCV download or a cloud API.
- The scorer associates positions to driver names by bounding-box geometry, OCR typo recovery, and consensus between scans. It explicitly ignores player-seat badges such as P1 and P2.
- Rows missing an OCR rank are only inferred when a small gap is bracketed by two known ranks and the number/spacing of names exactly fits; these rows are marked **VERIFY**.
- Upload top and bottom images as separate scans of the same unsaved race. Duplicate positions or contradictory readings are flagged and never automatically entered twice.
- For best accuracy use a direct game screenshot instead of a phone photo of a monitor, or crop close around the dark table. The results must still be reviewed before confirming a race.

**Package size** should remain far below 200 MB because only the Latin bundled ML Kit model is used. The signed debug APK is a development package, not a Play Store release.