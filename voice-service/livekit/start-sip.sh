#!/bin/bash
# Start LiveKit SIP service via Docker
# Stops any existing container first, then runs fresh

docker stop cortex-sip-container 2>/dev/null || true
docker rm cortex-sip-container 2>/dev/null || true

exec docker run --rm \
  --name cortex-sip-container \
  --net=host \
  -v /opt/cortex/sip/sip.yaml:/sip.yaml \
  livekit/sip:latest \
  --config /sip.yaml
