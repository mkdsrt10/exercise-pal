#!/bin/zsh
# Asks for a Gemini API key without echoing it and stores it in .env.
set -e
cd "${0:A:h}/.."
[[ -f .env ]] || cp .env.example .env
read -rs "key?Paste your Gemini API key and press Enter: "
echo
[[ -n "$key" ]] || { echo "No key entered, nothing changed."; exit 1; }
KEY="$key" python3 - <<'EOF'
import os, re
p = ".env"
s = open(p).read()
line = "GEMINI_API_KEY=" + os.environ["KEY"].strip()
s = re.sub(r"^GEMINI_API_KEY=.*$", lambda _: line, s, flags=re.M) if re.search(r"^GEMINI_API_KEY=", s, re.M) else s + "\n" + line + "\n"
open(p, "w").write(s)
EOF
unset key
chmod 600 .env
echo "Saved. You can close this tab."
