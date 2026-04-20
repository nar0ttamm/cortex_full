#!/bin/bash
echo "=== External IP ==="
curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip'
echo

echo "=== Testing port 7880 from external ==="
curl -s --max-time 3 http://34.14.176.60:7880 && echo "PORT 7880: OPEN" || echo "PORT 7880: BLOCKED"

echo "=== What is listening ==="
ss -tlnup | grep -E '7880|5090|5000|5060|5080' | head -20

echo "=== GCP project ==="
curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/project/project-id'
echo
