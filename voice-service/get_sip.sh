#!/bin/bash
set -e
# Try direct versioned URL
curl -fL -o /tmp/livekit-sip-dl.tar.gz \
  "https://github.com/livekit/sip/releases/download/v1.4.3/livekit-sip_1.4.3_linux_amd64.tar.gz" \
  && echo "Downloaded v1.4.3" || {
  
  # Fallback: try v1.3.0
  curl -fL -o /tmp/livekit-sip-dl.tar.gz \
    "https://github.com/livekit/sip/releases/download/v1.3.0/livekit-sip_1.3.0_linux_amd64.tar.gz" \
    && echo "Downloaded v1.3.0"
}

ls -lh /tmp/livekit-sip-dl.tar.gz
tar xzf /tmp/livekit-sip-dl.tar.gz -C /tmp/
ls /tmp/livekit-sip 2>/dev/null && mv /tmp/livekit-sip /opt/cortex/sip/ && echo "SIP installed" || echo "Binary not found after extraction"
