#!/usr/bin/env bash
# Emulator-only install/launch check. Never enters recovery words, passwords or payments.
set -Eeuo pipefail

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo 'Usage: bash scripts/android-install-smoke.sh /path/to/signed-fresh.apk' >&2
  exit 2
fi
fresh_apk="$1"
legacy_package='technology.cpay.wallet'
fresh_package='technology.cpay.wallet.fresh'
component="$fresh_package/technology.cpay.wallet.MainActivity"
original_url='https://github.com/parvezmosharafvu/cpay-wallet/releases/download/v0.6.0-android/CPay.apk'
original_sha256='750c34bfef6f0a7226af3210b2b349cbcac5eb00c7afc0868eefab3224ba996d'
output='smoke-output'

for tool in adb curl python3 sha256sum timeout; do
  command -v "$tool" >/dev/null || { echo "Required smoke-test tool is missing: $tool" >&2; exit 2; }
done

# Refuse physical devices: this test installs applications and grants their camera permission.
timeout 30 adb wait-for-device
if [ "$(adb shell getprop ro.kernel.qemu | tr -d '\r\n')" != '1' ]; then
  echo 'Android install smoke must run on an emulator, never a user phone.' >&2
  exit 2
fi

mkdir -p "$output"
scratch="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/cpay-install-smoke.XXXXXX")"
original_apk="$scratch/CPay-1.4.apk"
remote_ui="/sdcard/cpay-install-smoke-${RANDOM}.xml"
initial_pid=''
render_verified=false
both_installed=false
export CPAY_SMOKE_APK="$fresh_apk"

capture_evidence() {
  result=$?
  trap - EXIT
  set +e
  timeout 10 adb exec-out screencap -p > "$output/screenshot.png"
  timeout 10 adb logcat -d -v threadtime > "$output/logcat.txt"
  timeout 10 adb shell dumpsys activity activities > "$output/activities.txt"
  timeout 10 adb shell dumpsys package "$legacy_package" > "$output/package-original.txt"
  timeout 10 adb shell dumpsys package "$fresh_package" > "$output/package-fresh.txt"
  timeout 10 adb shell getprop > "$output/device-properties.txt"
  CPAY_SMOKE_EXIT="$result" CPAY_SMOKE_PID="$initial_pid" \
  CPAY_SMOKE_RENDER="$render_verified" CPAY_SMOKE_BOTH="$both_installed" python3 - <<'PY'
import hashlib, json, os, pathlib
apk = pathlib.Path(os.environ['CPAY_SMOKE_APK'])
report = {
    'passed': os.environ['CPAY_SMOKE_EXIT'] == '0',
    'exitCode': int(os.environ['CPAY_SMOKE_EXIT']),
    'originalPackage': 'technology.cpay.wallet',
    'freshPackage': 'technology.cpay.wallet.fresh',
    'bothPackagesInstalled': os.environ['CPAY_SMOKE_BOTH'] == 'true',
    'vaultScreenRendered': os.environ['CPAY_SMOKE_RENDER'] == 'true',
    'launchPid': os.environ['CPAY_SMOKE_PID'],
    'freshApkSha256': hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest(),
    'createdOrImportedWallet': False,
    'scope': 'Emulator installation, side-by-side package presence, launch and visible vault screen only; no funded transaction or physical-device validation.',
}
pathlib.Path('smoke-output/install-smoke.json').write_text(json.dumps(report, indent=2) + '\n')
PY
  exit "$result"
}
trap capture_evidence EXIT

vault_screen_visible() {
  python3 - "$output/android-ui.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except (ET.ParseError, OSError):
    raise SystemExit(1)
app = [n for n in root.iter('node') if n.get('package') == 'technology.cpay.wallet.fresh']
def label(node):
    return node.get('text', '') + ' ' + node.get('content-desc', '')
labels = ' '.join(label(n) for n in app)
has_webview = any('WebView' in n.get('class', '') for n in app)
new_vault = 'Protect your wallet' in labels and 'Create encrypted vault' in labels
locked_vault = 'Unlock your wallet' in labels and 'Unlock' in labels
ready_button = any(n.get('clickable') == 'true' and n.get('enabled') == 'true' and
                   ('Create encrypted vault' in label(n) or label(n).strip() == 'Unlock') for n in app)
storage_error = any(message in labels for message in ['Storage unavailable', 'Secure browser storage is unavailable'])
if not (has_webview and 'Vault password' in labels and ready_button and (new_vault or locked_vault) and not storage_error):
    raise SystemExit(1)
PY
}

curl --fail --location --retry 3 --connect-timeout 15 --max-time 120 \
  "$original_url" --output "$original_apk"
printf '%s  %s\n' "$original_sha256" "$original_apk" | sha256sum --check -

# -r preserves an existing emulator install's data; -g avoids a startup permission dialog.
# There is intentionally no uninstall, pm clear, wallet creation or recovery import.
timeout 90 adb install -r -g "$original_apk" | tee "$output/install-original.txt"
timeout 90 adb install -r -g "$fresh_apk" | tee "$output/install-fresh.txt"
adb shell pm list packages | tr -d '\r' > "$output/packages.txt"
grep -Fx "package:$legacy_package" "$output/packages.txt" >/dev/null
grep -Fx "package:$fresh_package" "$output/packages.txt" >/dev/null
both_installed=true

adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell am force-stop "$fresh_package"
adb logcat -c
timeout 20 adb shell am start -W -n "$component" | tee "$output/launch.txt"
if grep -Eq '(^Error:|Exception|Status: timeout)' "$output/launch.txt"; then
  echo 'The fresh APK activity did not launch successfully.' >&2
  exit 1
fi

deadline=$((SECONDS + 30))
while [ "$SECONDS" -lt "$deadline" ]; do
  pid="$(adb shell pidof "$fresh_package" | tr -d '\r\n' || true)"
  if [ -z "$pid" ]; then
    echo 'Fresh application process exited before the vault screen rendered.' >&2
    exit 1
  fi
  if [ -z "$initial_pid" ]; then initial_pid="$pid"; fi
  if [ "$pid" != "$initial_pid" ]; then
    echo 'Fresh application restarted unexpectedly during launch.' >&2
    exit 1
  fi
  if timeout 5 adb shell uiautomator dump "$remote_ui" >> "$output/uiautomator.txt" 2>&1 && \
     timeout 5 adb exec-out cat "$remote_ui" > "$output/android-ui.xml" 2>> "$output/uiautomator.txt"; then
    if vault_screen_visible; then
      render_verified=true
      break
    fi
  fi
  sleep 1
done
if [ "$render_verified" != true ]; then
  echo 'No accessible CPay vault screen appeared within 30 seconds; blank/splash/permission screens do not pass.' >&2
  exit 1
fi

# Require the same process to remain alive after rendering, not just a transient launch frame.
sleep 5
if [ "$(adb shell pidof "$fresh_package" | tr -d '\r\n' || true)" != "$initial_pid" ]; then
  echo 'Fresh application did not survive the post-render observation period.' >&2
  exit 1
fi
timeout 5 adb shell uiautomator dump "$remote_ui" >> "$output/uiautomator.txt" 2>&1
timeout 5 adb exec-out cat "$remote_ui" > "$output/android-ui.xml"
if ! vault_screen_visible; then
  render_verified=false
  echo 'The vault screen disappeared during the post-render observation period.' >&2
  exit 1
fi
adb logcat -d --pid "$initial_pid" -v threadtime > "$output/app-logcat.txt"
if grep -Eq 'FATAL EXCEPTION|Fatal signal [0-9]+|ANR in technology\.cpay\.wallet\.fresh' "$output/app-logcat.txt"; then
  echo 'Fresh application reported a native/Java crash or ANR.' >&2
  exit 1
fi
echo 'CPay 1.4 and fresh CPay 1.5 are installed side by side; fresh vault screen rendered and process survived.'
