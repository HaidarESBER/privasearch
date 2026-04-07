# 🔒 PrivaSearch

A **privacy-first AI search engine**. It pairs [SearXNG](https://docs.searxng.org/)
(a metasearch engine that strips trackers) with a **local LLM served by
[Ollama](https://ollama.com/)** to give you cited, synthesized answers —
**without any query, result, or answer ever leaving your machine.**

No CDNs. No Google Fonts. No analytics. No error-reporting SaaS. Everything is
self-hosted and offline-capable once the model is pulled.

---

## Architecture

```mermaid
flowchart LR
    User([👤 Browser]) -->|"only exposed port :8080"| FE

    subgraph docker["Docker internal network (privanet) — nothing else is exposed"]
        FE["🖥️ frontend<br/>nginx + React<br/>serves UI, proxies /api"]
        API["⚙️ api<br/>Node + Express<br/>RAG orchestration, SSE"]
        SX["🔎 searxng<br/>metasearch, JSON API"]
        OL["🧠 ollama<br/>local LLM (llama3.1:8b)"]

        FE -->|"/api/* (SSE)"| API
        API -->|"1 · /search?format=json"| SX
        API -->|"3 · /api/chat (stream)"| OL
    end

    SX -.->|"the ONLY outbound traffic:<br/>upstream engine queries"| Web((🌐 Search engines))

    API -->|"2 · top-N results as context"| API
```

**Request flow**

1. Browser posts the query to `/api/search` (same origin → nginx → API).
2. API queries **SearXNG's JSON API** and gets ranked, tracker-free results.
3. API sends the raw results back **immediately** (so they render even if the LLM is down),
   then builds a **RAG prompt** from the top N results.
4. API streams the LLM's answer token-by-token over **SSE**, with inline `[n]`
   **citations** that link to the original result URLs.

### Why Node.js + Express (not FastAPI)?

- **One language across the stack** (React frontend + API) → smaller cognitive
  and audit surface, which matters for a privacy project.
- **Node 20's built-in `fetch`** means the API needs **zero HTTP-client
  dependencies** — the only runtime dependency is Express itself. Every
  dependency is attack surface; here there is almost none.

---

## Quick start

**Prerequisites:** Docker + Docker Compose, and Node.js (only for the one-time
setup script). ~5 GB free disk for the default model.

```bash
# 1. One-time setup: creates .env and a random SearXNG secret_key
npm run setup            # or: make setup

# 2. Pull the LLM into Ollama (one-time; needs internet once)
npm run pull-model       # or: make pull-model

# 3. Start everything
docker compose up -d     # or: npm run up  /  make up
```

Then open **http://localhost:8080**.

> `npm run up` / `make up` also runs setup automatically, so the truly minimal
> path is: `make pull-model` then `make up`.

### Helper commands

| npm | make | Does |
|-----|------|------|
| `npm run setup` | `make setup` | Generate `.env` + random `secret_key` |
| `npm run pull-model` | `make pull-model` | Download the Ollama model |
| `npm run up` | `make up` | Setup + build + start (detached) |
| `npm run down` | `make down` | Stop and remove containers |
| `npm run logs` | `make logs` | Tail all service logs |
| `npm run ps` | `make ps` | Show service status |

---

## Configuration

All knobs live in `.env` (copied from `.env.example`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `FRONTEND_PORT` | `8080` | The **only** exposed host port |
| `OLLAMA_MODEL` | `llama3.1:8b` | Which local model answers |
| `LLM_TEMPERATURE` | `0.2` | Lower = more factual (good for RAG) |
| `RESULT_COUNT` | `5` | How many results feed the prompt (N) |

The SearXNG `secret_key` is **not** in `.env` — it's generated straight into
`searxng/settings.yml` by the setup script so it never lands in an env file.

### Swapping the LLM model

```bash
# 1. Pick any Ollama model tag, e.g. mistral, qwen2.5:7b, phi3, llama3.1:70b
# 2. Pull it:
docker compose exec ollama ollama pull mistral

# 3. Point PrivaSearch at it in .env:
#    OLLAMA_MODEL=mistral

# 4. Recreate the API so it reads the new value:
docker compose up -d api
```

Smaller models (e.g. `phi3`, `qwen2.5:3b`) run comfortably on CPU; larger ones
benefit from a GPU (uncomment the `deploy:` block for `ollama` in
`docker-compose.yml` for NVIDIA).

### ⚡ Performance on CPU (no GPU)

Without a GPU, `llama3.1:8b` is heavy: the **first** request loads ~5 GB into
RAM (can take minutes if RAM is tight), then generates at ~10 tokens/sec. Two
things help a lot:

- **Use a smaller model.** `llama3.2:3b` or `qwen2.5:3b` load faster and roughly
  double the speed:
  ```bash
  docker compose exec ollama ollama pull llama3.2:3b
  # set OLLAMA_MODEL=llama3.2:3b in .env, then:
  docker compose up -d api
  ```
- **Keep it warm.** The model is held in RAM for 30 min between requests
  (`OLLAMA_KEEP_ALIVE`, configurable) so you only pay the load cost once.
- If loads are extremely slow, raise Docker Desktop's memory limit (Settings →
  Resources) to at least 8 GB so the model doesn't swap.

### Pulling the model fully offline

Ollama caches weights in the `ollama-models` Docker volume. To run on an
air-gapped machine:

1. On a machine **with** internet: `docker compose up -d ollama` then
   `docker compose exec ollama ollama pull llama3.1:8b`.
2. Copy the named volume across (e.g.
   `docker run --rm -v privasearch_ollama-models:/data -v $PWD:/backup alpine tar czf /backup/models.tgz -C /data .`,
   then restore the tarball into the volume on the target machine).
3. From then on, **no internet is required** for inference.

---

## Categories & filters

Under the search bar you get SearXNG's full category set — **All, Images,
Videos, News, Science, Music, IT, Files, Map** — plus three filters: **time
range** (day/week/month/year), **SafeSearch** (off/moderate/strict), and
**language**. Images render as a grid, videos as cards with thumbnails; text
categories also get the streamed AI answer with citations. Changing any
category or filter re-runs the search immediately, and results are paginated.

**Image privacy:** result thumbnails never load from the remote host directly —
that would leak your browser's IP, referrer and fingerprint. Every image is
routed through `/api/image_proxy`, so your **browser only ever talks to your own
server**. SearXNG-signed thumbnails are fetched through SearXNG's egress (so
they respect Tor/VPN); other thumbnails are fetched server-side by the API. The
API refuses to proxy anything that isn't an image.

---

## 🛡️ Built-in VPN (optional)

For an extra layer, PrivaSearch can route **SearXNG's outbound traffic through a
VPN** so upstream search engines see the VPN's IP, never yours. It uses
[Gluetun](https://github.com/qdm12/gluetun), which supports 50+ providers plus
custom WireGuard. SearXNG runs *inside* the VPN's network namespace, and
Gluetun's **kill switch is on by default** — if the tunnel drops, SearXNG loses
all internet, so queries **fail closed** instead of leaking on your real IP.

> Ollama, the API and the frontend never make external calls, so only SearXNG
> needs tunnelling. The VPN is opt-in (it needs your credentials) but fully
> integrated — one command turns it on.

### Enable it

1. Fill in the **VPN block** of your `.env` for your provider (examples for
   custom WireGuard, Mullvad, Proton, and OpenVPN providers are all in
   `.env.example`). For a custom WireGuard `.conf`, copy the key/address/endpoint
   values across.

2. Start the stack with the VPN override:

   ```bash
   make up-vpn        # or: npm run up-vpn
   # equivalently:
   docker compose -f docker-compose.yml -f docker-compose.vpn.yml up -d --build
   ```

3. **Verify** the tunnel is actually carrying SearXNG's traffic:

   ```bash
   make vpn-ip        # or: npm run vpn-ip
   # prints the public IP SearXNG exits from — it should be the VPN's, not yours
   ```

Stop it with `make down-vpn`. Run plain `make up` any time to go back to the
no-VPN stack.

### Provider quick-reference

| Provider | Set in `.env` |
|----------|---------------|
| Custom / self-hosted WireGuard | `VPN_SERVICE_PROVIDER=custom` + the 5 `WIREGUARD_*` values |
| Mullvad | `VPN_SERVICE_PROVIDER=mullvad`, `WIREGUARD_PRIVATE_KEY`, `WIREGUARD_ADDRESSES` |
| Proton VPN | `VPN_SERVICE_PROVIDER=protonvpn`, `WIREGUARD_PRIVATE_KEY` |
| NordVPN / PIA / Surfshark | `VPN_SERVICE_PROVIDER=<name>`, `VPN_TYPE=openvpn`, `OPENVPN_USER/PASSWORD` |

> **Fail-open instead?** Not recommended, but if you'd rather search keep working
> when the VPN is down, add `FIREWALL=off` to the `gluetun` service. This
> disables the kill switch and can expose your real IP — leave it on unless you
> have a specific reason.

### Free option: Tor (no account, zero setup)

Don't have a VPN subscription? Route SearXNG through **Tor** instead. It's free,
needs **no account and no credentials**, and drops in with one command — the Tor
container requires zero configuration. It hides your IP from the upstream engines
just like a VPN, using SearXNG's native SOCKS proxy support (with `socks5h://`,
so DNS is resolved through Tor too — no DNS leak).

```bash
make up-tor         # or: npm run up-tor
make tor-ip         # verify: prints the Tor exit IP (not yours)
```

Stop with `make down-tor`. **Trade-offs:** Tor is slower (3 relay hops), and some
engines block or CAPTCHA Tor exit nodes — SearXNG simply skips those, so you may
get fewer results from certain engines. For most privacy-first searching that's a
fair trade for a free, trust-no-provider option.

> **VPN vs Tor at a glance:** a VPN is faster and less likely to be blocked, but
> costs money and means trusting one provider. Tor is free and trusts no single
> party, but is slower and sometimes blocked. Pick whichever fits — `make up-vpn`
> or `make up-tor`. (Running plain `make up` uses neither.)

---

