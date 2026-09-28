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
<a class="path" href="#heirs"><span class="path-number">02</span><span><strong>Set up your heirs</strong><span>Collect reusable public cards. Let any three of five custodians help recover the backup.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
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

The wallet package protects the **same recovery keys**. Its encryption key is split into five shares, one protected for each custodian. Any three custodians can release their shares and recover the bundle, in any order.

Each custodian creates a public card once. You reuse those cards for future backups.

[Set up your heirs →](#heirs)

## Which password?

| Password | Opens |
|---|---|
| Greenbox phrase | `owner.age` and, in this setup, `sign.key` |
| KeePass password | The database inside your backup |

Memory-only recovery also needs a way to find the encrypted kit. [Storage and discovery →](#keep)

<details class="technical"><summary>How does the wallet produce an encryption key?</summary><p>The wallet signs a fixed private message. Greenbox derives a separate encryption key from that signature. A different public signature proves which account registered the public card. The private signature stays in the trusted page's memory.</p><p>The derived key is reused across backups. Someone obtaining it can open that custodian's share in every package using the card; they still need enough other shares to recover.</p><a href="#ref-protocol">Protocol details →</a></details>
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

For the wallet route, start a fresh browser session and load the saved package and trusted receipt. This checks the downloaded files.

<div class="checkpoint"><strong>Result</strong><p>The saved kit produces a readable KeePass database.</p></div>
'''),
step('Open and check the password manager', r'''
Check the recovered database for the entries and attachments listed in `BACKUP-INFO.txt`.

During setup, compare the recovered owner copy with the original:

```sh
diff -rq private/payload restored/payload
```

No output means the folders match. Repeat recovery from each stored copy.

For the heirs route, also [check each custodian's restored wallet](#heirs/5).
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
     'One package. Five custodians. Any three can recover it, in any order.',
     'Build & recover', steps=[
step('Choose what the heirs should recover', r'''
The heirs route protects **`private/bundle.tar`** from owner setup. Any three of five custodians can recover its keys and open your vault without your passphrase.

Use five people, each with their own wallet. They can cooperate at any time; this setup does not enforce an inheritance date.

Hardware-wallet restoration still needs testing. [Compatibility details →](#ref-protocol!wallet-and-trezor-compatibility)

<p><a class="button primary" data-tool href="recovery.html" target="_blank" rel="noopener">Open the recovery tool ↗</a></p>
'''),
step('Each custodian makes a public card', r'''
Each custodian does this once:

1. Open **Make a key** in the recovery tool.
2. Select their Ethereum account in Rabby or MetaMask, then **Connect wallet**.
3. Choose **Readable message** for MetaMask + Trezor. Other supported accounts can use **Structured message** on Ethereum mainnet.
4. Click **Create my public key** and approve the three prompts.
5. **Download public key card** and send it to you.

The first two prompts create the private recovery key and check that it repeats. The third proves which account owns the public card. No transaction or payment is involved.

**Send only the public card. Wallet seed words never go into the page.**

<div class="checkpoint"><strong>Result</strong><p>Five public cards. Confirm each card's full account address with its custodian, then keep the cards for future backups.</p></div>

[Wallet signing help →](#help!trezor-will-not-sign-the-message)
'''),
step('Encrypt one recovery package', r'''
On your prepared offline computer, open **Build a package**. Bring the public cards there; your wallet is not needed.

1. **Add public key cards** — select the five cards.
2. Set the recovery rule to **3 of 5**.
3. Enter a backup name and select **`private/bundle.tar`**.
4. Click **Encrypt recovery package**.
5. Download the package and receipt. Put both in `kit/`.

The tool encrypts the bundle once, splits its encryption key into five shares, and protects one share for each custodian. Any three can recover it, in any order.

<div class="checkpoint"><strong>Result</strong><p>greenbox-package.json and its matching greenbox-receipt.json.</p></div>

Reuse the same public cards for future packages. Custodians do not need to sign again. [Updating a backup →](#keep)
'''),
step('Give the receipt a trusted home', r'''
Send **`greenbox-receipt.json` directly to each custodian through a trusted channel**. Keep a separate trusted copy too.

The receipt identifies the exact package you created. A receipt downloaded beside an unknown package does not establish who created it.

| Keep | Where |
|---|---|
| Complete `kit/`, handbook, and recovery tool | Your backup locations |
| Matching receipt | Kit and custodians' trusted copies |
| Public cards | You and the custodians |
| Wallet recovery material | Each custodian keeps their own |
'''),
step('Prove the heirs can recover', r'''
Follow [Recover with custodians](#recover-heirs) with any three people. Recover the bundle, verify and decrypt the vault, and open KeePass.

Also check each custodian using a spare or already-restored wallet:

1. Open **Make a key → Check a restored wallet**.
2. **Load existing public card**.
3. Connect the original account, with the same wallet passphrase and account path.
4. Click **Check this wallet against the card** and sign.
5. Release a share and complete recovery with two other custodians.

Use a spare device for this check; keep the working wallet intact.

<div class="checkpoint"><strong>Result</strong><p>The restored wallet reproduces its original key, and three custodians recover the backup without your Greenbox phrase.</p></div>
''')], source=None)

page('recover', 'Recover an existing backup',
     'Choose owner or custodian recovery.',
     'Build & recover', r'''
<div class="path-list recovery-paths">
<a class="path featured" href="#recover-owner"><span class="path-number">A</span><span><strong>I have the owner passphrase</strong><span>Open owner.age, recover the keys, verify the vault, and open KeePass.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
<a class="path" href="#recover-heirs"><span class="path-number">B</span><span><strong>Three custodians can help</strong><span>Use wallets to release shares, recover bundle.tar, and open the same vault.</span></span><span class="path-arrow" aria-hidden="true">→</span></a>
</div>

Both routes need `vault.age` and `vault.age.minisig`. Owner recovery also needs `owner.age`; custodian recovery needs the wallet package and its trusted receipt.

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
1. Connect the original registered wallet account.
2. Click **Use my wallet to open my share** and approve the private message.
3. Click **Download my secret share**.
4. Send that file **privately to the recovering person**.

The tool recreates the custodian's key and uses it to open their share.

<div class="checkpoint"><strong>Result</strong><p>One secret share from each custodian. Enough released shares can recover the package without the wallets.</p></div>
'''),
step('Combine any three and recover the file', r'''
The recovering person opens **Recover** and loads the same package and trusted receipt.

1. Confirm the receipt's source.
2. **Add recovery share files** — select three distinct shares, in any order.
3. Click **Recover original file**, then **Download recovered file**.

No wallet connection is needed for this step.

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
| `greenbox-package.json` | Optional wallet route to the same bundle | Keep in the kit; metadata is public |
| `greenbox-receipt.json` | Fingerprint of that exact wallet package | Keep in the kit **and** through a separately trusted route |

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

The private derivation signature and derived private encryption key exist in the trusted tool's memory. They are not included in public cards. Someone obtaining a private derivation signature can open that custodian's share.

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

## “No wallet appears”

Open the recovery tool in the browser profile where Rabby or MetaMask is installed and enabled. This guide can be read anywhere, but an in-app browser may not contain your wallet extension. Refresh before loading important work, select the extension explicitly, then connect.

## “Trezor will not sign the message”

Pair the device through the extension first. For a new **MetaMask + Trezor** enrollment, choose **Readable message**. Rabby structured signing depends on its installed integration. Safe 7 needs Suite and a current compatible Connect integration. Do not import a hardware seed into a software wallet to work around signing support.

## The recreated wallet key is different

Stop and keep the original public card. Check the exact registered account, hidden-wallet passphrase/account path, original signing method, and signing implementation.

Switching from structured to readable signing creates a different key. Replacing the card does not make an existing package decryptable. Test [restoration against the original card](#heirs/5).

## “The receipt does not match”

Find the correct package and its independently trusted matching receipt. Do not accept an unknown replacement receipt simply to get past the error. Every newly encrypted package gets a new receipt.

## “I have two shares but cannot recover”

A 3-of-5 package needs three **distinct** shares for that exact package. Adding the same share twice does not count twice. Public key cards are not released secret shares.

## Signature verification or a file comparison fails

Stop and preserve the inputs. Check you have a complete matching kit and the expected recovered verification key. Do not skip signature verification or use an untrusted replacement key.

## “I recovered the file but KeePass still asks for a password”

KeePass has its own encryption. For a full Greenbox recovery, read the recovered `UNLOCK.txt` and use any required key file. The page does not supply a database password.

## “The local tool will not open”

Open Terminal in the repository root and run:

```sh
node developer/guide/tools/serve.mjs
```

Open [127.0.0.1:8788](http://127.0.0.1:8788/) in your wallet browser. Keep Terminal open; **Control-C** stops the server. This needs Node.js, with no library installation. To read offline, open **index.html** directly.

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
| Master key or verification key | New bundle, owner wrapper, wallet package, and receipt |
| Custodians or threshold | New wallet package and receipt |
| A directly wallet-protected `.kdbx` | New wallet package and receipt |
| Custodian's wallet account or signing method | New public card and package |
| Wallet software or firmware | Check the restored wallet against its saved card |

**Reuse existing public cards for new packages. Custodians do not sign again.** Deliver each new receipt through the trusted channel.

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
## Completed with dummy data

<div class="proof-row"><span class="proof-symbol" aria-hidden="true">✓</span><div><h3>You opened the KeePass test</h3><p>The earlier owner recovery reached the actual database and you read its challenge value.</p></div></div>
<div class="proof-row"><span class="proof-symbol" aria-hidden="true">✓</span><div><h3>Every group of three recovered</h3><p>The wallet tests cover all 10 groups of three in all six possible orders for both package versions: 120 recovery cases. The suite contains 40 tests, including reusable cards, older-file compatibility, tampering, invalid inputs, and exclusion of test fixtures from the production build.</p></div></div>
<div class="proof-row"><span class="proof-symbol" aria-hidden="true">✓</span><div><h3>Recovery worked after a browser reload</h3><p>Saved dummy shares, package, and receipt recovered the original database without a connected wallet. KeePassXC opened it.</p></div></div>
<div class="proof-row"><span class="proof-symbol" aria-hidden="true">✓</span><div><h3>The full bundle route worked too</h3><p>The wallet package recovered bundle.tar, then minisign verified the vault, age decrypted it, and the dummy KeePass database opened.</p></div></div>

The owner and full-bundle results describe earlier rehearsals. The retained automated tests are rerun after project changes. These checks are not an independent audit of the cryptographic integration.

## Still to prove with your own setup

- Each intended Trezor Safe 3/5/7 and extension can recreate the same registered key after restoration.
- The five accounts correspond to your intended independent custodians, who can follow the procedure.
- Your real database opens using only recovered information, including all key files and dependencies.
- Both physical offline copies support complete recovery with available tools.
- Your remembered name finds a complete online kit without needing a saved login, if you adopt online discovery.

The wallet route is classical cryptography, even when it protects an age post-quantum identity. It does not enforce an inheritance date, revoke released shares, or recover missing ciphertext.

<div class="footer-links"><a href="#ref-verification">Full acceptance checklist →</a><a href="#ref-protocol">Protocol and assumptions →</a></div>
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
