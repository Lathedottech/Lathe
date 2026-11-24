#!/bin/sh
# Writes the generated tinyproxy config and filter (base64 in env) to the tmpfs
# and runs tinyproxy in the foreground. Fails closed when either is missing.
set -eu
: "${TINYPROXY_CONF_B64:?missing config}"
: "${TINYPROXY_FILTER_B64:?missing filter}"
printf '%s' "$TINYPROXY_CONF_B64" | base64 -d > /tmp/tinyproxy.conf
printf '%s' "$TINYPROXY_FILTER_B64" | base64 -d > /tmp/tinyproxy.filter
exec tinyproxy -d -c /tmp/tinyproxy.conf
