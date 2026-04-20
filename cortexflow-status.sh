#!/bin/bash
# CortexFlow — Post-boot status check
# Run this after VM starts to verify all services are up and get the IP to paste in Vercel

RESET='\033[0m'; BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'

echo -e "${BOLD}${CYAN}╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║      CortexFlow System Status        ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${RESET}"
echo ""

echo -e "${BOLD}PM2 Services:${RESET}"
pm2 list --no-color 2>/dev/null | grep -E 'cortex' | while read line; do
  if echo "$line" | grep -q 'online'; then
    echo -e "  ${GREEN}✓${RESET} $(echo $line | awk '{print $2, $18}')"
  else
    echo -e "  ${RED}✗${RESET} $line"
  fi
done

echo ""
echo -e "${BOLD}Docker Containers:${RESET}"
docker ps --format '  {{.Names}}: {{.Status}}' 2>/dev/null

echo ""
EXTERNAL_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null)
if [ -z "$EXTERNAL_IP" ]; then
  EXTERNAL_IP=$(curl -s --max-time 5 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip' -H 'Metadata-Flavor: Google' 2>/dev/null)
fi

echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}External IP:  ${GREEN}${EXTERNAL_IP:-unknown}${RESET}"
echo -e ""
echo -e "Update this in Vercel env vars:"
echo -e "  ${CYAN}VOICE_SERVICE_URL = http://${EXTERNAL_IP:-<YOUR_IP>}:5000${RESET}"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "Voice service health:"
curl -s --max-time 5 http://localhost:5000/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  Not reachable yet — wait 10s and retry"
