"""Current reader-facing handbook. Extended references live in developer/docs."""

PAGES = []

def page(slug, title, subtitle, group, body='', steps=None, source=None):
    PAGES.append(dict(slug=slug, title=title, subtitle=subtitle, group=group,
                      body=body, steps=steps or [], source=source))

def step(title, body):
    return dict(title=title, body=body)

page('start', 'A backup you know how to open.',
     'Create a backup, add heirs, and check that recovery works.',
     'Start here', r'''
<div class="start-layout">
<div class="path-list">
<a class="path featured" href="#owner"><span class="path-number">01</span><span><span class="eyebrow">BUILD YOUR BACKUP</span><strong>Create your Greenbox</strong><span>Protect a KeePass backup with a key, then protect that key with your passphrase.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
<a class="path" href="#heirs"><span class="path-number">02</span><span><strong>Set up your heirs</strong><span>Collect reusable public age keys. Let any three of five custodians help recover the backup.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
<a class="path" href="#check-backup"><span class="path-number">03</span><span><strong>Verify your backup</strong><span>Recover from your saved files and confirm that the password manager opens.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
</div>
<aside class="orientation"><span class="eyebrow">THE WHOLE IDEA</span><img src="assets/diagrams/two-routes.png" alt="Two ways back in"><a href="#basics">See how the pieces fit →</a></aside>
</div>
<p><a href="#recover">Recover an existing backup →</a></p>

<div class="footer-links"><a href="#verification">What has been tested →</a><a href="#files">What every file does →</a></div>
''')

page('basics', 'How Greenbox fits together',
     'The keys open the backup. Your passphrase, or three custodians, gets you those keys.',
     'Start here', r'''
## Two packages, two jobs

**`vault.age` holds your backup:** the KeePass database and its unlock instructions.

**`owner.age` holds the recovery keys:** your Greenbox passphrase opens it.

![Owner recovery](assets/diagrams/owner-recovery.png)

Use `verify.pub` to check the vault's signature, then `master.key` to decrypt it. Open KeePass with the unlock instructions inside.

## What each tool does

| Tool | Job |
|---|---|
| `tar` | Packs files into one archive. No encryption or password. |
| `age` | Encrypts and decrypts. `master.recipient` is the public key; `master.key` is its private counterpart. |
| `minisign` | Signs and verifies. `sign.key` signs; `verify.pub` checks. These are a separate key pair. |

## Adding heirs

The heirs package protects the **same recovery keys**. Its encryption key is split into five shares, one protected for each custodian. Any three custodians can release their shares and recover the bundle, in any order.

Each custodian creates an age key once, keeps its private file, and sends you its public recipient. You reuse those recipients for future backups.

[Set up your heirs →](#heirs)

## Which password?

| Password | Opens |
|---|---|
| Greenbox phrase | `owner.age` and, in this setup, `sign.key` |
| KeePass password | The database inside your backup |

Memory-only recovery also needs a way to find the encrypted kit. [Storage and discovery →](#keep)

<details class="technical"><summary>How do the heirs’ keys work?</summary><p>Each heir generates a random post-quantum age key pair. You encrypt one Shamir share to their public recipient; they use their saved private key to open it. The key is restored from its saved file, not recreated from a wallet signature.</p><a href="#ref-protocol">Protocol details →</a></details>
''', source=None)

page('check-backup', 'Verify your backup',
     'Use your saved files to recover the password manager and confirm that it opens.',
     'Start here', steps=[
step('Choose the recovery route', r'''
Recover from your saved `kit/` files:

- [Owner recovery](#recover-owner): use your Greenbox passphrase.
- [Custodian recovery](#recover-heirs): collect shares from any three custodians.

Use a separate folder for recovered files.
'''),
step('Recover from the saved files', r'''
Follow your chosen recovery guide through to opening KeePass.

For the heirs route, start a fresh browser session and load the saved package and trusted receipt. This checks the downloaded files.

<div class="checkpoint"><strong>Result</strong><p>The saved kit produces a readable KeePass database.</p></div>
'''),
step('Open and check the password manager', r'''
Check the recovered database for the entries and attachments listed in `BACKUP-INFO.txt`.

During setup, compare the recovered owner copy with the original:

```sh
diff -rq private/payload restored/payload
```

No output means the folders match. Repeat recovery from each stored copy.

For the heirs route, also [check each custodian’s saved age key](#heirs/5).
''')])

page('owner', 'Create your Greenbox',
     'Create the keys, encrypt your backup, and check recovery.',
     'Build & recover', steps=[
step('Prepare the tools and folders', r'''
Open Terminal and check the tools:

```sh
age --version
age-keygen --help
minisign -v
```

The age help should list `-pq`. Installation: [age](https://github.com/FiloSottile/age) · [minisign](https://jedisct1.github.io/minisign/).

Create your working folders:

```sh
mkdir -m 700 "$HOME/greenbox-backup" &&
cd "$HOME/greenbox-backup" &&
umask 077 &&
mkdir -p private/bundle private/payload kit
```

`private/` holds your keys and working files. `kit/` will hold the encrypted backup. The permissions keep new files private to your account.

**Keep this Terminal window open and stay in this folder for the following steps.**
'''),
step('Prepare the KeePass copy', r'''
Save and close KeePass, then copy these files into `private/payload/`:

| File | Contents |
|---|---|
| Your `.kdbx` database | The password-manager backup |
| `UNLOCK.txt` | Database password and all other unlock requirements |
| Database key file | Include it for databases that use one |
| `BACKUP-INFO.txt` | Backup date, release number, and an entry to check after recovery |

The whole folder will be encrypted, including `UNLOCK.txt`.

<div class="checkpoint"><strong>Check</strong><p>Open the copied database using only the files and instructions in this folder.</p></div>
'''),
step('Choose the phrase you will remember', r'''
Choose **12 random words** using the [EFF dice method](https://www.eff.org/dice).

Use this Greenbox phrase for both:

- **`owner.age`** — the package containing your recovery keys.
- **`sign.key`** — the key used to sign future backups.

KeePass keeps its own database password.

Enter the phrase into Terminal's password prompts. Nothing appears as you type. Keep a secure written copy while learning it.
'''),
step('Create the encryption key pair', r'''
Generate the private key that will open your backup:

```sh
age-keygen -pq -o private/bundle/master.key
```

This creates `master.key`. `-pq` selects hybrid post-quantum encryption. No password is requested; the key file itself is secret.

Derive its matching public key:

```sh
age-keygen -y -o private/master.recipient private/bundle/master.key
```

`-y` exports the public key from the private key you just created.

<div class="checkpoint"><strong>Result</strong><p>master.recipient encrypts. master.key decrypts. They are one matching pair.</p></div>
'''),
step('Create the separate signing keys', r'''
Create the keys used to sign and verify your backup:

```sh
minisign -G -p private/bundle/verify.pub -s private/sign.key
```

Enter your Greenbox phrase twice to protect `sign.key`.

- **`sign.key`** signs backups. Keep it for future updates.
- **`verify.pub`** checks signatures. It goes in the recovery bundle.

These are separate from the age encryption keys. They verify the backup; they do not decrypt it.
'''),
step('Pack the keys, then protect them', r'''
Put the two recovery keys into one archive:

```sh
tar -cf private/bundle.tar -C private/bundle master.key verify.pub
```

This creates `bundle.tar` containing `master.key` and `verify.pub`. **Tar only packs files: no encryption or password.**

Encrypt that archive:

```sh
age -p -o kit/owner.age private/bundle.tar
```

Enter your Greenbox phrase twice. This reads `bundle.tar` and creates the encrypted output `kit/owner.age`.

Check that your phrase opens it:

```sh
age -d -o private/owner-check.tar kit/owner.age &&
cmp private/bundle.tar private/owner-check.tar
```

Enter the same phrase. `cmp` compares the recovered archive with the original.

<div class="checkpoint"><strong>Result</strong><p>Decryption succeeds and cmp prints nothing: your phrase recovers the original keys.</p></div>
'''),
step('Encrypt and sign the backup', r'''
Pack the database and unlock instructions:

```sh
tar -cf private/payload.tar -C private payload
```

Encrypt the archive using your public key:

```sh
age -R private/master.recipient -o kit/vault.age private/payload.tar
```

This creates `vault.age` without a password prompt. Your `master.key` opens it.

Sign the encrypted backup:

```sh
minisign -S -s private/sign.key -m kit/vault.age
```

Enter your signing-key password—the Greenbox phrase. This creates `vault.age.minisig`.

<div class="checkpoint"><strong>Result</strong><p>kit/ now contains owner.age, vault.age, and vault.age.minisig.</p></div>

Add a public `README.txt` with recovery instructions: [copy the template](#ref-owner!5-encrypt-and-sign-the-actual-password-manager-backup).
'''),
step('Recover it before trusting it', r'''
Follow [Recover with your passphrase](#recover-owner) to recover the keys and open KeePass from the encrypted kit.

Compare the recovered files with your originals:

```sh
diff -rq private/payload restored/payload
```

No output means the folders match.

<div class="checkpoint"><strong>Check</strong><p>Open the recovered database using its recovered unlock instructions. Find the entry listed in BACKUP-INFO.txt.</p></div>
'''),
step('Add heirs and keep complete copies', r'''
[Set up your heirs](#heirs) using **`private/bundle.tar`**. Add the resulting package and receipt to `kit/`.

Keep two complete copies of `kit/`, the handbook, recovery tool, and installers on USBs in separate locations. Test recovery from both.

Keep `sign.key` and `master.recipient` separately for future updates. **Keep `private/` and released secret shares out of the public kit.**

[Storage, updates, and finding a backup from memory →](#keep)
''')], source='docs/OWNER-REFERENCE.md')

page('heirs', 'Set up your heirs',
     'Five saved age keys. Any three people can recover. No invitation or wallet signing.',
     'Build & recover', steps=[
step('Choose five custodians', r'''
The heirs route protects **`private/bundle.tar`** from owner setup. Any three of five custodians can recover its keys and open your vault without your passphrase.

Choose five people who can keep a private key safely. Any three can cooperate at any time; this setup does not enforce an inheritance date.

Use your trusted local copy of the recovery tool for real files.

<p><a class="button primary" data-tool href="recovery.html" target="_blank" rel="noopener">Open the recovery tool ↗</a></p>
'''),
step('Each custodian creates an age key', r'''
Each person installs **age 1.3 or newer**. On a Mac:

```sh
brew install age
```

Then run in Terminal:

```sh
umask 077
mkdir greenbox-heir
cd greenbox-heir
age-keygen -pq -o heir.key
age-keygen -y -o heir.recipient heir.key
```

- `umask 077` limits access to new files.
- `mkdir` creates the folder; `cd` enters it.
- `age-keygen -pq` creates a random post-quantum private key in **heir.key**.
- `age-keygen -y` reads that key and writes its public counterpart to **heir.recipient**.

**Keep heir.key private.** Store two protected copies separately. Send only **heir.recipient** to the creator.

Name each public file after its heir, such as `Alice.recipient`. The creator loads the recipient and confirms its full fingerprint with its custodian through a trusted contact method. The tool displays this fingerprint when a recipient is loaded.

<div class="checkpoint"><strong>Result</strong><p>Five public recipient files. The heirs keep their private keys; you never need them to make a backup.</p></div>
'''),
step('Encrypt one recovery package', r'''
On your prepared offline computer, open **Build a package**:

1. **Add public recipient files** — select the five `.recipient` files.
2. Set **3 of 5**.
3. Enter a backup name and select **`private/bundle.tar`**.
4. Click **Encrypt recovery package**.
5. Download the package and receipt into `kit/`.

The tool encrypts the bundle once, splits its encryption key into five shares, and encrypts each share to one custodian. Any three can recover it in any order.

<div class="checkpoint"><strong>Result</strong><p>greenbox-package.json and its matching greenbox-receipt.json.</p></div>

Reuse the same recipients for later backups. Heirs do not generate new keys. [Updating a backup →](#keep)
'''),
step('Keep the right files', r'''
Send **`greenbox-receipt.json` directly to each custodian through a trusted channel**. It identifies the exact package you created. It is a fingerprint, not a signature proving who created it.

| File | Who keeps it |
|---|---|
| Complete `kit/`, handbook, recovery tool | Your backup locations |
| Matching receipt | Kit and each custodian’s trusted copy |
| Public `.recipient` files | You and the custodians; reusable |
| Private `.key` file | Only its custodian, with protected backups |

The encrypted package contains the public recipients too. No invitation file is involved.
'''),
step('Test the saved keys and full recovery', r'''
Each custodian checks a **saved backup copy** of their key:

1. Open **Make a key** in the recovery tool.
2. **Load heir.recipient**.
3. **Check saved heir.key** — select the restored private file.
4. Confirm the keys match.

Then follow [Recover with custodians](#recover-heirs) with any three people. Recover the bundle, verify and decrypt the vault, and open KeePass.

**Restore means copying back the saved key.** Running `age-keygen` again creates a different key and cannot restore the old one.

<div class="checkpoint"><strong>Result</strong><p>Saved keys match their recipients, and three custodians recover the database without your Greenbox phrase.</p></div>
''')], source=None)

page('recover', 'Recover an existing backup',
     'Choose owner or custodian recovery.',
     'Build & recover', r'''
<div class="path-list recovery-paths">
<a class="path featured" href="#recover-owner"><span class="path-number">A</span><span><strong>I have the owner passphrase</strong><span>Open owner.age, recover the keys, verify the vault, and open KeePass.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
<a class="path" href="#recover-heirs"><span class="path-number">B</span><span><strong>Three custodians can help</strong><span>Use saved age keys to release shares, recover bundle.tar, and open the same vault.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
</div>

Both routes need `vault.age` and `vault.age.minisig`. Owner recovery also needs `owner.age`; custodian recovery needs the heirs package and its trusted receipt.

''')

page('recover-owner', 'Recover with your passphrase',
     'The passphrase opens the keys. The keys verify and open the backup.',
     'Build & recover', steps=[
step('Prepare a recovery folder', r'''
Use Terminal in the folder containing your saved `kit/`. Have age, minisign, and KeePassXC installed.

Check the three input files:

```sh
ls -l kit/owner.age kit/vault.age kit/vault.age.minisig
```

Create the recovery folder:

```sh
umask 077 &&
mkdir -m 700 restored
```

Keep Terminal in this folder for the remaining steps.
'''),
step('Open the owner package', r'''
Decrypt the recovery bundle:

```sh
age -d -o restored/bundle.tar kit/owner.age
```

Enter your **Greenbox passphrase**.

Check the archive's contents:

```sh
tar -tvf restored/bundle.tar
```

Expect two regular files: `master.key` and `verify.pub`, with each listing line starting with `-`. Stop on unexpected contents.

Extract those keys:

```sh
tar -xf restored/bundle.tar -C restored master.key verify.pub
```

<div class="checkpoint"><strong>Result</strong><p>restored/master.key decrypts the vault. restored/verify.pub checks its signature.</p></div>
'''),
step('Verify, then decrypt the vault', r'''
Verify the signature using the recovered public key:

```sh
minisign -Vm kit/vault.age -p restored/verify.pub
```

Minisign reads the adjacent `vault.age.minisig`. **Continue after successful verification.**

Decrypt using the recovered private key:

```sh
age -d -i restored/master.key -o restored/payload.tar kit/vault.age
```

No password is needed here; `master.key` opens the vault.

<div class="checkpoint"><strong>Result</strong><p>restored/payload.tar contains the database and unlock instructions.</p></div>
'''),
step('Unpack and open KeePass', r'''
Check the archive:

```sh
tar -tvf restored/payload.tar
```

Expect your files under `payload/`. Stop on absolute paths, `..`, links, or unexpected files.

Extract it:

```sh
tar -xf restored/payload.tar -C restored
```

Read `restored/payload/UNLOCK.txt`. Use its password and key-file instructions to open the recovered `.kdbx` in KeePassXC.

<div class="checkpoint"><strong>Done</strong><p>Find the entry listed in BACKUP-INFO.txt and confirm the backup's date and release number.</p></div>
''')], source='docs/OWNER-REFERENCE.md')

page('recover-heirs', 'Recover with custodians',
     'Each custodian opens one share. The recovering person combines any three.',
     'Build & recover', steps=[
step('Each custodian identifies the package', r'''
Each participating custodian opens the recovery tool on their computer.

<p><a class="button primary" data-tool href="recovery.html" target="_blank" rel="noopener">Open the recovery tool ↗</a></p>

1. Choose **Recover**.
2. Load the **Encrypted package**.
3. Load the **Trusted public receipt** received directly from the creator or a trusted backup.
4. Confirm the receipt's source using the checkbox.

<div class="checkpoint"><strong>Check</strong><p>The package matches the trusted receipt. Everyone uses this same package.</p></div>
'''),
step('Each custodian releases their share', r'''
1. Click **Open my share with heir.key** and select the saved private key.
2. Click **Download my secret share**.
3. Send that file **privately to the recovering person**.

The private key opens only this custodian’s share. The downloaded share does not contain the private key.

<details class="technical"><summary>Prefer using age in Terminal?</summary>

In the tool, expand **Use age in Terminal instead**, select your name, and download your encrypted `.age` share. For share 1:

```sh
umask 077
age -d -i heir.key -o share-1.json share-1.age
```

Use your downloaded share number in both filenames. This reads `heir.key`, decrypts `share-1.age`, and writes the secret share into `share-1.json`. Send the JSON file privately to the recovering person.

</details>

<div class="checkpoint"><strong>Result</strong><p>One secret share from each custodian. Enough released shares can recover this package without their private keys.</p></div>
'''),
step('Combine any three and recover the file', r'''
The recovering person opens **Recover** and loads the same package and trusted receipt.

1. Confirm the receipt's source.
2. **Add recovery share files** — select three distinct shares, in any order.
3. Click **Recover original file**, then **Download recovered file**.

No private age keys are needed for this step.

<div class="checkpoint"><strong>Result</strong><p>bundle.tar, containing the keys to your Greenbox vault.</p></div>

<details class="technical"><summary>Recovering a database protected directly?</summary><p>The download is your .kdbx file. Open it with its KeePass password and key file. The bundle step below is for full Greenbox recovery.</p></details>
'''),
step('Use the bundle to open the full vault', r'''
Use Terminal in the folder containing your saved `kit/`. Create the recovery folder:

```sh
umask 077 &&
mkdir -m 700 restored-custodians
```

Move the downloaded `bundle.tar` into `restored-custodians/`.

Inspect it, then extract the two keys:

```sh
tar -tvf restored-custodians/bundle.tar
```

Expect only regular files `master.key` and `verify.pub` (lines starting with `-`). Stop on unexpected contents.

```sh
tar -xf restored-custodians/bundle.tar -C restored-custodians master.key verify.pub
```

Verify the signature, then decrypt:

```sh
minisign -Vm kit/vault.age -p restored-custodians/verify.pub &&
age -d -i restored-custodians/master.key -o restored-custodians/payload.tar kit/vault.age
```

The `&&` runs decryption only after successful verification.

Inspect the recovered archive:

```sh
tar -tvf restored-custodians/payload.tar
```

Expect your files under `payload/`. Stop on absolute paths, `..`, links, or unexpected files.

Extract it:

```sh
tar -xf restored-custodians/payload.tar -C restored-custodians
```

Open the recovered `.kdbx` in `restored-custodians/payload/`, using its `UNLOCK.txt` instructions.

<div class="checkpoint"><strong>Done</strong><p>The database opens without the owner's Greenbox passphrase. Check the entry and release number in BACKUP-INFO.txt.</p></div>
''')], source=None)

page('files', 'A field guide to the files',
     'What each file does, who keeps it, and which ones are safe to share.',
     'Reference', r'''
## The encrypted kit

| File | Purpose | Handling |
|---|---|---|
| `owner.age` | Phrase-encrypted recovery bundle | Keep in the kit |
| `vault.age` | Encrypted KeePass payload | Keep in the kit |
| `vault.age.minisig` | Signature on the encrypted vault | Keep beside the matching vault |
| `README.txt` | Public recovery instructions | Keep in the kit; no secrets |
| `greenbox-package.json` | Optional heirs route to the same bundle | Keep in the kit; metadata is public |
| `greenbox-receipt.json` | Fingerprint of that exact heirs package | Keep in the kit **and** through a separately trusted route |

## The owner's working files

| File | Purpose | Secret? |
|---|---|---|
| `master.key` | Decrypts the vault | **Yes** |
| `master.recipient` | Public counterpart used to encrypt | No |
| `sign.key` | Signs backups; protected by a password | **Yes** |
| `verify.pub` | Checks signatures; must come from a trusted source | No |
| `bundle.tar` | Unencrypted archive of master.key + verify.pub | **Yes** |
| `payload.tar` | Unencrypted archive of database and unlock instructions | **Yes** |
| `UNLOCK.txt` | Password and other information needed to open KeePass | **Yes** |

**`private/` stays outside the public kit.** The encrypted wrappers do not delete the plaintext working files automatically.

## The heirs' setup and recovery files

![Public cards and secret shares](assets/diagrams/cards-and-shares.png)

The public key card in the diagram is the plain-text **`.recipient` file**.

| File | Purpose | Secret? |
|---|---|---|
| `heir.key` | Opens one heir’s encrypted shares across backups | **Yes; keep protected copies** |
| `heir.recipient` | Encrypts shares for that heir; reusable | No |
| `share-1.age` | Encrypted share exported for age CLI recovery | No; its metadata is public |
| `share-1.json` | Released share for one package | **Yes; send privately** |

''', source=None)

page('help', 'When something is unclear',
     'Start with what you see. Fix the cause before continuing to the next step.',
     'Reference', r'''
## “kit/owner.age does not exist”

Before encryption, that is normal: `owner.age` is the **output**, not the input. The `kit/` folder must already exist. From the correct working folder, run:

```sh
pwd
mkdir -p kit
ls -l private/bundle.tar
```

If the archive exists, continue with the encryption step. Do not create an empty `owner.age` or `bundle.tar` to bypass an error.

## “private/bundle.tar does not exist”

Check `pwd`. All owner commands use the same working folder. You must first create `master.key` and `verify.pub`, then pack them with tar. Return to [Pack the keys, then protect them](#owner/6).

## “Which password is it asking for?”

| Where you are | Password |
|---|---|
| Creating `owner.age` with `age -p` | Chosen Greenbox passphrase, twice |
| Opening `owner.age` with `age -d` | Same Greenbox passphrase, once |
| Generating signing keys with `minisign -G` | Signing-key password; this guide chooses the Greenbox phrase |
| Signing with `minisign -S` | The password originally set on sign.key |
| Opening the recovered database in KeePassXC | The database password from UNLOCK.txt |
| Packing or extracting with tar | No password |

Hidden Terminal password entry displays no characters. Type the phrase and press Return.

## “A file or recovery folder already exists”

Keep it. Do not regenerate good keys or overwrite a successful backup simply to repeat a step. Resume at verification, or make a fresh empty working folder and use consistent paths throughout.

## “My private key is missing”

Restore `heir.key` from a protected backup. Its public `.recipient` cannot recreate it. In a 3-of-5 setup, the other heirs can still recover when three working keys remain.

## “Use a post-quantum age recipient”

Create keys with `age-keygen -pq`, using age 1.3 or newer. An ordinary `age1…` recipient is classical; this tool requires `age1pq1…` recipients. For an existing package, restore its original private key rather than generating a replacement.

## Legacy recovery

Old heirs packages use a different format. Keep their original tool and recovery material. To retrieve the previous tool from this repository’s Git history:

```sh
git show cd25eb09a1e025740562b3b3afb3d568e9f07a69:recovery.html > /tmp/greenbox-wallet-legacy.html
```

Open that file in the browser with the original wallet extension. Follow its saved signing method to recover the old package. Signature reproduction depends on the original signer; success is not guaranteed after changing wallet software. The owner passphrase route remains available when you have its matching kit and phrase.

Once recovered, create a new package using the heirs’ age recipients. Changing formats does not revoke old copies. The new tool never silently converts or accepts heirs packages.

## “The receipt does not match”

Find the correct package and its independently trusted matching receipt. Do not accept an unknown replacement receipt simply to get past the error. Every newly encrypted package gets a new receipt.

## “I have two shares but cannot recover”

A 3-of-5 package needs three **distinct** shares for that exact package. Adding the same share twice does not count twice. Public recipients are not released secret shares.

## Signature verification or a file comparison fails

Stop and preserve the inputs. Check you have a complete matching kit and the expected recovered verification key. Do not skip signature verification or use an untrusted replacement key.

## “I recovered the file but KeePass still asks for a password”

KeePass has its own encryption. For a full Greenbox recovery, read the recovered `UNLOCK.txt` and use any required key file. The page does not supply a database password.

## “The local tool will not open”

Open Terminal in the repository root and run:

```sh
node developer/guide/tools/serve.mjs
```

Open [127.0.0.1:8788](http://127.0.0.1:8788/) in your browser. Keep Terminal open; **Control-C** stops the server. This needs Node.js, with no library installation. To read offline, open **index.html** directly.

The **developer** folder contains the sources, automated tests, and optional references. You do not need to open it to follow this handbook. Keep your actual backup kits in a separate private workspace.
''')

page('keep', 'Store it. Keep it recoverable.',
     'A verified kit needs surviving copies, available tools, and a way to find it again.',
     'Build & recover', r'''
## Keep two complete copies

Put the encrypted `kit/`, handbook, recovery tool, and installers on two USBs in separate locations. Test recovery from each.

Keep `sign.key` and `master.recipient` separately for future updates. Plaintext keys and released shares stay out of the public kit.

## Updating your backup

| Change | What to create |
|---|---|
| KeePass contents | New payload, `vault.age`, and signature. Keep the existing wrappers for unchanged recovery keys. |
| Master key or verification key | New bundle, owner wrapper, heirs package, and receipt |
| Custodians or threshold | New heirs package and receipt |
| A directly heirs-protected `.kdbx` | New heirs package and receipt |
| Custodian’s key is replaced | New recipient, heirs package, and receipt |
| Custodian restores a saved key | Check it against the existing recipient; no new package |

**Reuse existing public recipients for new packages. Heirs do not create new keys.** Deliver each new receipt through the trusted channel.

Build each release separately and verify it before replacing your stored copies.

## Finding the kit from memory

The proposed route is a remembered ENS name pointing to a complete encrypted kit on IPFS. **Online storage and ENS are not configured by this project.**

1. Store the complete encrypted kit with two independent providers.
2. Retrieve every file without saved logins or your local publishing node.
3. Verify the files and recover offline.
4. Point the ENS name to the tested directory.
5. Repeat recovery starting with only the name and your phrase.

[Storage details and sources →](#ref-owner!7-make-complete-copies-then-test-discovery)

## Keep it working

Recheck phrase recall, stored copies, custodian contacts, and full recovery at least yearly. Keep online storage and ENS renewed.

<details class="technical"><summary>Old copies and backup freshness</summary><p>A new phrase or package does not revoke old copies held with their old recovery keys. A valid signature proves authenticity, not that a backup is the latest. Compare its release number with a separately recorded checkpoint.</p><p>Deleting plaintext from an SSD does not guarantee erasure. Prepare the offline environment before handling real keys.</p></details>
''', source='docs/OWNER-REFERENCE.md')

page('verification', 'What has actually been proved',
     'Keep the software rehearsal results separate from the tests your real setup still needs.',
     'Reference', r'''
## Automated checks

- All ten groups of three recover in all six orders: **60 recovery cases**.
- Browser-created encrypted shares decrypt with the age command-line tool; CLI-created keys and shares work in the browser implementation.
- Updated backups reuse the same public recipients and receive fresh file keys, shares, and receipts.
- Wrong keys, duplicate shares, mixed packages, changed files, and classical recipients are rejected.
- The production page excludes test fixtures, wallet connections, and simulated recovery controls.

[Latest verification results and acceptance checklist →](#ref-verification)

## Test your own setup

- Each heir restores a saved private key and checks it against their public recipient.
- Any three intended heirs recover the database and open it with the recovered unlock instructions.
- Both offline copies contain the complete kit and working tools.
- Your remembered name finds a complete online kit without a saved login, if you adopt online discovery.

The age share envelopes use hybrid post-quantum encryption. This does not make every Greenbox route equally resistant: age uses 128-bit internal file keys, the owner phrase must resist guessing, and minisign uses classical signatures. This integration has not had an independent security audit.

''', source='docs/VERIFICATION.md')

REFERENCE_DOCS = [
    ('ref-owner', 'Owner commands: full reference', 'docs/OWNER-REFERENCE.md', 'Extended instructions'),
    ('ref-protocol', 'Protocol and security details', 'docs/PROTOCOL.md', 'Technical details'),
    ('ref-verification', 'Verification and acceptance checklist', 'docs/VERIFICATION.md', 'Verification'),
    ('ref-notices', 'Third-party notices', 'docs/THIRD-PARTY-NOTICES.md', 'Technical details'),
]

page('library', 'The complete reference',
     'Optional detail for the current setup. The guided paths above are enough to get started.',
     'Reference', '\n\n'.join(
         f'### {group}\n\n' + '\n'.join(f'- [{title}](#{slug})' for slug,title,path,g in REFERENCE_DOCS if g==group)
         for group in dict.fromkeys(doc[3] for doc in REFERENCE_DOCS)))
