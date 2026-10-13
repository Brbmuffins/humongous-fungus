# Getting Humongous Fungus onto the App Store

Everything in the code is ready: the iPhone project, icon, launch screen,
privacy manifest, store text and screenshots. These are the steps only the
account owner can do. Most are five-minute forms; the waits are Apple's.

## 1. Join the Apple Developer Program

- Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/)
  and sign in with your Apple ID. It needs two-factor authentication turned on.
- Enroll as an **individual**. Apple puts sole developers without a company
  here. Use your legal name exactly as it appears on your ID.
- Pay $99 for the year. Approval usually takes a day or two.

The App Store will show your legal name as the seller. To show "Muffin
Development" instead, you would need a registered company (an LLC) and a free
D-U-N-S number; an app can be transferred to a company account later.

## 2. Register the app's ID

- [developer.apple.com/account](https://developer.apple.com/account) →
  Certificates, Identifiers & Profiles → Identifiers → **+**
- App IDs → App → Continue.
- Description: `Humongous Fungus`. Bundle ID: **Explicit**,
  `com.muffindevelopment.humongousfungus`. No extra capabilities are needed.
- Register.

## 3. Create the app in App Store Connect

- [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Apps → **+** → New App.
- Platform: iOS. Name: `Humongous Fungus`. Primary language: English (U.S.).
  Bundle ID: the one from step 2. SKU: `humongous-fungus-ios`. User access: Full.
- If the name is taken, try `Humongous Fungus: Idle Jar`, or tell Claude and
  pick another.

## 4. Make a key for the build robot

- App Store Connect → Users and Access → Integrations → App Store Connect API
  → Team Keys. (The first time, click Request Access and accept.)
- Generate API Key. Name: `GitHub builds`. Access: **Admin**.
- **Download the .p8 file now.** Apple only lets you download it once.
- Note the **Key ID** (in the table) and the **Issuer ID** (above the table).
- Your **Team ID** is at developer.apple.com/account → Membership details.

## 5. Give the key to GitHub

On GitHub, open this repository → Settings → Secrets and variables → Actions →
New repository secret. Add four secrets:

| Name | Value |
|---|---|
| `ASC_KEY_ID` | Key ID from step 4 |
| `ASC_ISSUER_ID` | Issuer ID from step 4 |
| `ASC_KEY_P8` | Open the .p8 file in a text editor and paste all of it, including the BEGIN and END lines |
| `APPLE_TEAM_ID` | Team ID from step 4 |

Secrets are encrypted; nobody can read them back, including Claude.

## 6. Build it and play it on your iPhone

- The build button only appears once the workflow file is on the `main`
  branch, so merge the work branch into `main` first (Claude can open the
  pull request).
- GitHub → Actions → **iOS · Humongous Fungus** → Run workflow.
- It takes about 15 minutes, on a Mac in GitHub's cloud. Then Apple processes
  the upload for 10–30 minutes.
- App Store Connect → your app → TestFlight. The build appears there. Create
  an Internal Testing group and add yourself.
- Install **TestFlight** from the App Store on your iPhone, accept the invite,
  and play.

macOS build minutes count ten times against GitHub's free allowance on private
repositories, so a private repo gets roughly a dozen builds a month for free.
Public repositories build for free.

### Things to check on the phone

- The top bar clears the notch and the tabs clear the home bar.
- Planting the first specimen asks whether to allow notifications.
- Leave the app with a specimen growing: the reminder arrives when it's ready.
- Taps give a light vibration.
- Force-quit and reopen: progress is still there, with a welcome-back screen.

## 7. Put up the privacy policy and support pages

Apple needs a public URL for each.

- In `site/humongous-fungus/privacy.html` and `support.html`, replace
  `SUPPORT_EMAIL` with the address you want players to write to.
- Host the `site/` folder anywhere free. The quickest is to drag it onto
  [app.netlify.com/drop](https://app.netlify.com/drop). GitHub Pages also
  works if the repository is public.

## 8. Fill in the store page and submit

Everything to paste is in `games/fungus/store/listing.md`.

- **Version page:** subtitle, promotional text, description, keywords,
  support URL, the five screenshots from `games/fungus/store/screenshots/`,
  and the build from step 6.
- **App Privacy:** Get Started → "No, we do not collect data from this app".
  Add the privacy policy URL.
- **Age Rating:** answer None to everything. It comes out 4+.
- **Pricing and Availability:** Free, all countries.
- **App Review Information:** your contact details, and the review notes from
  `listing.md`. No sign-in is needed.
- **Add for Review → Submit.** Reviews usually take a day or two. If Apple
  asks for changes, paste their message to Claude.

## After launch

- **Updates:** Claude bumps the version (for example 1.0 → 1.1) and you run
  the workflow again. Build numbers count up by themselves.
- **Google Play** ($25, once): new personal accounts must run a closed test
  with 12 testers for 14 days before the public release, so recruit friends
  early. The Android project is already in `games/fungus/android`.

## Regenerating the art

- Icon and launch screen: `npm run dev`, then
  `node scripts/make-art.mjs` (needs Playwright), then in `games/fungus`:
  `npx capacitor-assets generate --ios --android --iconBackgroundColor '#16110d' --iconBackgroundColorDark '#16110d' --splashBackgroundColor '#16110d' --splashBackgroundColorDark '#16110d'`
- Screenshots: 440×956 browser window at 3× scale, saved as RGB PNGs at
  1320×2868.
