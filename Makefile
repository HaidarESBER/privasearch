# PrivaSearch helper targets. (Windows users without `make`: use the
# equivalent `npm run <target>` scripts in package.json.)

# Pull the model named in .env if present, else the default.
MODEL ?= $(shell sed -n 's/^OLLAMA_MODEL=//p' .env 2>/dev/null || true)
MODEL := $(if $(MODEL),$(MODEL),llama3.1:8b)

VPN_FILES := -f docker-compose.yml -f docker-compose.vpn.yml
TOR_FILES := -f docker-compose.yml -f docker-compose.tor.yml

.PHONY: help setup up up-vpn up-tor down down-vpn down-tor vpn-ip tor-ip logs pull-model rebuild ps

help:
	@echo "make setup       - generate .env + random SearXNG secret_key (one-time)"
	@echo "make pull-model  - download the Ollama model ($(MODEL))"
	@echo "make up          - setup + build + start everything (detached)"
	@echo "make up-vpn      - route SearXNG through a VPN (needs .env VPN creds)"
	@echo "make up-tor      - route SearXNG through Tor (FREE, no account, zero setup)"
	@echo "make vpn-ip      - print the exit IP via the VPN (verify it)"
	@echo "make tor-ip      - print the exit IP via Tor (verify it)"
	@echo "make down        - stop and remove containers"
	@echo "make down-vpn    - stop the VPN-enabled stack"
	@echo "make down-tor    - stop the Tor-enabled stack"
	@echo "make logs        - tail logs from all services"
	@echo "make ps          - show service status"

setup:
	node scripts/gen-secret.mjs

up: setup
	docker compose up -d --build
	@echo ""
	@echo "PrivaSearch is up -> http://localhost:$${FRONTEND_PORT:-8080}"

up-vpn: setup
	docker compose $(VPN_FILES) up -d --build
	@echo ""
	@echo "PrivaSearch (VPN) is up -> http://localhost:$${FRONTEND_PORT:-8080}"
	@echo "Verify the exit IP with: make vpn-ip"

up-tor: setup
	docker compose $(TOR_FILES) up -d --build
	@echo ""
	@echo "PrivaSearch (Tor) is up -> http://localhost:$${FRONTEND_PORT:-8080}"
	@echo "Verify the exit IP with: make tor-ip"

vpn-ip:
	docker compose $(VPN_FILES) exec gluetun sh -c "wget -qO- https://ipinfo.io/ip"

tor-ip:
	docker run --rm --network privasearch_privanet curlimages/curl:latest -s --socks5-hostname tor:9050 https://ipinfo.io/ip

down:
	docker compose down

down-vpn:
	docker compose $(VPN_FILES) down

down-tor:
	docker compose $(TOR_FILES) down

logs:
	docker compose logs -f --tail=100

pull-model:
	docker compose up -d ollama
	docker compose exec ollama ollama pull $(MODEL)

rebuild:
	docker compose up -d --build

ps:
	docker compose ps
