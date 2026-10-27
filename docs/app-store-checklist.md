# Getting the games onto the App Store and Google Play

Everything in the code is ready for all three games: the iPhone and Android
projects, icons, launch screens, store text and screenshots. These are the
steps only the account owner can do. Most are five-minute forms; the waits are
Apple's and Google's.

Part 1 is Apple, part 2 is Google, both written for Humongous Fungus. They
don't depend on each other, so you can do both at once. Start Google early:
new accounts must run a 14-day test before they can publish. Parts 3 and 4
add Sporemonger and Hammygotchi, which reuse the accounts, keys and secrets
from parts 1 and 2.

# Part 1: Apple App Store

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

- The pages in `site/humongous-fungus/` list northfieldhemp@gmail.com as the
  contact address. Ask Claude to swap it if you set up a dedicated address.
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

# Part 2: Google Play

## A. Create a Google Play developer account

- Go to [play.google.com/console/signup](https://play.google.com/console/signup)
  and sign in with a Google account.
- Choose a **personal** account. Pay the one-time $25 fee and verify your
  identity with a government ID. Google may also ask you to confirm you own an
  Android phone by installing the Play Console app on it.
- Verification can take a few days.

## B. Create the app

- Play Console → Create app. Name: `Humongous Fungus`. Language: English (US).
  App or game: Game. Free. Accept the declarations.
- The package name is set by the first upload: `com.muffindevelopment.humongousfungus`.

## C. Give GitHub your upload key

Claude made an upload key and sent it to you as two files:
`humongous-fungus-upload.jks` (the key) and `android-upload-key.txt`
(its password and the text to paste). **Keep both somewhere safe**, such as a
password manager. If the key is ever lost, Play Console support can reset it,
because Google holds the real app signing key.

On GitHub: Settings → Secrets and variables → Actions → New repository secret.

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The long block of text in `android-upload-key.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | The password in `android-upload-key.txt` |
| `ANDROID_KEY_PASSWORD` | The same password |
| `ANDROID_KEY_ALIAS` | `upload` |

## D. Build the app bundle

- GitHub → Actions → **Android · Humongous Fungus** → Run workflow (leave
  "upload" off). Like the iPhone build, this button appears once the workflow
  is on `main`.
- When it finishes (about 5 minutes), open the run and download
  `humongous-fungus-<number>.aab` from Artifacts. It downloads as a zip;
  unzip it to get the .aab file.

## E. Start the 14-day closed test

New personal accounts must have **12 testers opted in for 14 days in a row**
before Google allows a public release.

- Play Console → Test and release → Testing → Closed testing → Create track.
- Upload the .aab, give the release a name like `1.0 (1)`, and save.
- Testers: add a list of email addresses (12 or more Google accounts:
  friends, family). Copy the opt-in link and send it to them. Each tester
  opens the link, joins, and installs the game from Play.
- Start the rollout to the closed track. The 14 days count from when 12
  testers have opted in.

## F. Fill in the store page (during the 14 days)

Everything to paste is in `games/fungus/store/play/listing.md`:

- Main store listing: name, short and full description, icon, feature
  graphic, phone screenshots.
- App content: privacy policy URL, ads (none), app access (no login),
  content rating questionnaire, target audience, data safety (no data
  collected or shared).

## G. Go live

- After 14 days, Play Console → Dashboard → Apply for production. Answer
  Google's questions about the test (what testers said, what you changed).
- Once approved: Production → Create new release → add the .aab (or promote
  the closed-test release) → Roll out. Review usually takes a few days for a
  new app.

## Optional: upload straight from GitHub

After the first manual upload, the workflow can upload new versions itself.
Play Console → Setup → API access → create a Google Cloud service account,
grant it Release manager in Play Console, download its JSON key, and save it
as the repository secret `PLAY_SERVICE_ACCOUNT_JSON`. Then run the workflow
with "upload" ticked: the bundle arrives as a draft on the chosen track.

## After launch

- **Updates:** Claude bumps the version (for example 1.0 → 1.1) and you run
  the workflow again. Build numbers count up by themselves.
- **Android updates** work the same way: run the Android workflow, then
  upload the new .aab (or let the workflow upload it).

# Part 3: Sporemonger

Sporemonger is set up the same way: its own app on each store, built by its
own workflows (**iOS · Sporemonger** and **Android · Sporemonger**). The
developer accounts, the App Store Connect key, the Android upload key and all
GitHub secrets from parts 1 and 2 are shared, so there is nothing new to set
up in GitHub.

## Apple

- **Register the app's ID** (step 2): Description `Sporemonger`, Bundle ID
  `com.muffindevelopment.sporemonger`.
- **Create the app** (step 3): Name `Sporemonger`, SKU `sporemonger-ios`. If
  the name is taken, try `Sporemonger: Night Market`.
- **Build** (step 6): Actions → **iOS · Sporemonger** → Run workflow, then
  install it from TestFlight. On the phone, check that buying something asks
  to allow notifications, and that leaving the app while holding stock brings
  a reminder later when it's up.
- **Pages** (step 7): `site/sporemonger/privacy.html` and `support.html`,
  hosted along with the rest of `site/`.
- **Store page** (step 8): everything to paste is in
  `games/sporemonger/store/listing.md`, screenshots in
  `games/sporemonger/store/screenshots/`. App Privacy, age rating and pricing
  get the same answers as Humongous Fungus.

## Google

- **Create the app** (step B): Name `Sporemonger`, Game, Free. The package name
  is `com.muffindevelopment.sporemonger`.
- **Build** (step D): Actions → **Android · Sporemonger** → Run workflow, and
  download `sporemonger-<number>.aab`. It is signed with the same upload key
  as Humongous Fungus, which Google allows.
- **Closed test** (step E): every new app on a personal account needs its own
  14 days with 12 testers. The same testers can join both games' tests at
  once.
- **Store page** (step F): everything to paste is in
  `games/sporemonger/store/play/listing.md`.

# Part 4: Hammygotchi

Same as Sporemonger: its own app on each store, its own workflows
(**iOS · Hammygotchi** and **Android · Hammygotchi**), and the same accounts,
keys and GitHub secrets. Nothing new to set up in GitHub.

## Apple

- **Register the app's ID** (step 2): Description `Hammygotchi`, Bundle ID
  `com.muffindevelopment.hammygotchi`.
- **Create the app** (step 3): Name `Hammygotchi`, SKU `hammygotchi-ios`. The
  name nods to a famous toy; if it's taken or Apple pushes back, use
  `Hammy: A Pet Who Is A Lot` (and tell Claude, so `appName` in
  `games/hammygotchi/capacitor.config.json` matches).
- **Build** (step 6): Actions → **iOS · Hammygotchi** → Run workflow, then
  install it from TestFlight. On the phone, check that ordering food asks to
  allow notifications, that leaving the app brings Hammy's next text as a
  notification, that farts give a heavy buzz, and that the toy bar scrolls.
- **Pages** (step 7): `site/hammygotchi/privacy.html` and `support.html`,
  hosted along with the rest of `site/`.
- **Store page** (step 8): everything to paste is in
  `games/hammygotchi/store/listing.md`, screenshots in
  `games/hammygotchi/store/screenshots/`. App Privacy and pricing get the same
  answers as the other games. **Age rating is different:** answer
  Infrequent/Mild for cartoon violence and for crude humor (see `listing.md`).

## Google

- **Create the app** (step B): Name `Hammygotchi`, Game, Free. The package name
  is `com.muffindevelopment.hammygotchi`.
- **Build** (step D): Actions → **Android · Hammygotchi** → Run workflow, and
  download `hammygotchi-<number>.aab`. Same upload key as the other games.
- **Closed test** (step E): its own 14 days with 12 testers; the same testers
  can join all three tests.
- **Store page** (step F): everything to paste is in
  `games/hammygotchi/store/play/listing.md`. The content rating questionnaire
  gets cartoon violence and crude humor (see that file).

## Regenerating the art

- Icon and launch screen: start the game's dev server (`npm run dev` for
  Humongous Fungus, `npm run dev:sporemonger` for Sporemonger,
  `npm run dev:hammygotchi` for Hammygotchi), then
  `node scripts/make-art.mjs <fungus|sporemonger|hammygotchi>`
  (needs Playwright). Then in the game's folder, with its background colour
  (`#16110d` for Humongous Fungus, `#0d1120` for Sporemonger, `#1a1026` for
  Hammygotchi):
  `npx capacitor-assets generate --ios --android --iconBackgroundColor '<colour>' --iconBackgroundColorDark '<colour>' --splashBackgroundColor '<colour>' --splashBackgroundColorDark '<colour>'`
- Screenshots: 440×956 browser window at 3× scale for Apple (1320×2868), and
  360×640 at 3× for Google Play (1080×1920), saved as RGB PNGs.
