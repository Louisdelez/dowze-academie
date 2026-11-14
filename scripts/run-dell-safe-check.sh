#!/usr/bin/env bash
# Isolate notebook checks from Codex and the user's desktop on the 8 GB Dell.
set -euo pipefail
check_source_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
check_unit_node=/home/louis/.local/bin/node

check_profile=heavy
check_min_kib=3145728
check_memory_max=900M
check_memory_high=700M
check_swap_max=64M
check_heap=512
check_cpu=25%
check_duration=300
case ${1:-} in
  --unit)
    shift
    check_profile=unit
    check_min_kib=2621440
    check_memory_max=256M
    check_memory_high=192M
    check_swap_max=0
    check_heap=128
    check_duration=120
    ;;
  --probe)
    shift
    if (( $# != 0 )); then printf 'The probe profile accepts no command.\n' >&2; exit 64; fi
    check_profile=probe
    check_min_kib=2097152
    check_memory_max=96M
    check_memory_high=64M
    check_swap_max=0
    check_heap=32
    check_cpu=10%
    check_duration=15
    set -- /usr/bin/python3 -I -c 'import os,pathlib,json; p=pathlib.Path("/sys/fs/cgroup"+pathlib.Path("/proc/self/cgroup").read_text().strip().split(":",2)[2]); values={key:(p/key).read_text().strip() for key in ["memory.max","memory.high","memory.swap.max","cpu.max"]}; print(json.dumps({"unit":p.name,"limits":values,"node_options":os.environ.get("NODE_OPTIONS")})); assert p.name.startswith("dowze-dell-check-"); assert values["memory.max"]==str(96*1024*1024); assert values["memory.high"]==str(64*1024*1024); assert values["memory.swap.max"]=="0"; quota,period=map(int,values["cpu.max"].split()); assert quota/period==0.1; assert os.environ.get("NODE_OPTIONS")=="--max-old-space-size=32"; print("GUARD_PROBE_EXIT_0")'
    ;;
esac
# A diagnostic may shorten the full-profile deadline; it cannot raise a cap.
if [[ $check_profile == heavy && -n ${DOWZE_CHECK_MAX_SECONDS:-} ]]; then
  if [[ ! $DOWZE_CHECK_MAX_SECONDS =~ ^[0-9]+$ ]] || (( 10#$DOWZE_CHECK_MAX_SECONDS < 15 || 10#$DOWZE_CHECK_MAX_SECONDS > 300 )); then
    printf 'Check refused: diagnostic deadline must be between 15 and 300 seconds.\n' >&2
    exit 64
  fi
  check_duration=$((10#$DOWZE_CHECK_MAX_SECONDS))
fi
if [[ ${1:-} == -- ]]; then shift; fi
if (( $# == 0 )); then
  printf 'Usage: %s -- command [arguments…]\n' "$0" >&2
  exit 64
fi
if [[ $check_profile == unit ]]; then
  if (( $# < 3 )) || [[ $2 != --test ]] || [[ $(pwd -P) != "$check_source_root" ]] ||
      [[ $(realpath "$(command -v "$1")") != $(realpath "$check_unit_node") ]]; then
    printf 'The unit profile accepts only node --test tests/*.test.{ts,mjs,js}.\n' >&2
    exit 64
  fi
  for check_file in "${@:3}"; do
    if [[ ! -f $check_file ]] || [[ $check_file != tests/*.test.ts && $check_file != tests/*.test.mjs && $check_file != tests/*.test.js ]]; then
      printf 'Unit check refused: expected an existing test file in tests/.\n' >&2
      exit 64
    fi
    check_real_file=$(realpath "$check_file")
    case $check_real_file in
      "$check_source_root"/tests/*) ;;
      *) printf 'Unit check refused: file is outside the source tests directory.\n' >&2; exit 64 ;;
    esac
    if [[ $check_real_file != *.test.ts && $check_real_file != *.test.mjs && $check_real_file != *.test.js ]]; then
      printf 'Unit check refused: resolved file is not a unit test.\n' >&2
      exit 64
    fi
  done
  set -- "$check_unit_node" --test --test-concurrency=1 "${@:3}"
fi
if [[ $(uname -s) != Linux ]] || [[ ! -r /sys/fs/cgroup/cgroup.controllers ]]; then
  printf 'Check refused: the Dell cgroup v2 isolation is unavailable.\n' >&2
  exit 69
fi
for required in systemd-run systemctl flock; do
  command -v "$required" >/dev/null || { printf 'Check refused: %s is unavailable.\n' "$required" >&2; exit 69; }
done
systemctl --user show-environment >/dev/null || {
  printf 'Check refused: the user systemd manager is unavailable. Do not run the command unbounded.\n' >&2
  exit 69
}

# All agents and all mounted/unit/build runners share this lock. An interrupted
# client cannot allow overlap: the systemd service also retains the same lock.
exec 9>/tmp/dowze-notebook-heavy-check.lock
flock --nonblock 9 || { printf 'Check deferred: another notebook check is active.\n' >&2; exit 75; }
available_kib=$(awk '$1 == "MemAvailable:" { print $2 }' /proc/meminfo)
if [[ ! $available_kib =~ ^[0-9]+$ ]] || (( available_kib < check_min_kib )); then
  printf 'Check deferred: profile %s requires %s KiB available memory.\n' "$check_profile" "$check_min_kib" >&2
  exit 75
fi

check_unit="dowze-dell-check-$$-$(date +%s)"
# Transfer the lock to the isolated service. systemd-run --wait waits for the
# authoritative exit, and the unit dies after five minutes even if Codex exits.
# The lock is reacquired inside the service; this brief release is safe because
# a competing service causes this invocation to fail closed with flock exit 75.
flock --unlock 9
exec systemd-run --user --quiet --wait --pipe --collect --unit="$check_unit" \
  --property=CPUQuota="$check_cpu" \
  --property=MemoryHigh="$check_memory_high" \
  --property=MemoryMax="$check_memory_max" \
  --property=MemorySwapMax="$check_swap_max" \
  --property=OOMPolicy=kill \
  --property=RuntimeMaxSec="$check_duration" \
  --property=TimeoutStopSec=3 \
  --property=FinalKillSignal=SIGKILL \
  --property=LimitCORE=0 \
  --property=KillMode=control-group \
  --property=WorkingDirectory="$PWD" \
  --setenv=NODE_OPTIONS=--max-old-space-size="$check_heap" \
  --setenv=UV_THREADPOOL_SIZE=1 \
  --setenv=GOMAXPROCS=2 \
  --setenv=CARGO_BUILD_JOBS=1 \
  --setenv=RAYON_NUM_THREADS=1 \
  --setenv=PATH="$PATH" \
  flock --nonblock --conflict-exit-code=75 /tmp/dowze-notebook-heavy-check.lock "$@"
