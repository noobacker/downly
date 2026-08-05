# Downly PO-token provider

Vercel functions are short-lived, so the PO-token generator must run as a separate always-on service. This provider generates fresh YouTube proof-of-origin tokens automatically; Downly requests them per video through `YTDLP_POT_PROVIDER_URL`.

## Run the provider

On a small Docker host or a container service:

```bash
docker compose up -d
```

Expose the service over HTTPS at a URL such as `https://pot.example.com`. Do not expose port `4416` directly without TLS or a firewall. The provider endpoint is not a user-facing API.

## Connect Downly

Set this Vercel Production environment variable to the provider's HTTPS base URL:

```text
YTDLP_POT_PROVIDER_URL=https://pot.example.com
```

After redeploying Downly, the server automatically:

- loads the bundled `bgutil-ytdlp-pot-provider` yt-dlp plugin;
- selects yt-dlp's recommended `mweb` client;
- asks the provider for fresh tokens when a video is inspected or downloaded.

The old `YTDLP_COOKIES_BASE64` and `YTDLP_USER_AGENT` variables are no longer required for public videos once this is working. Remove them after verifying the provider, especially if they contain personal account cookies.

Downly does not use cookies by default. Keep `YTDLP_ALLOW_COOKIES` unset so user account sessions and browser data never enter the server process.

## Health check

The provider listens on port `4416`. From the Downly runtime, verify that the host is reachable before testing a download. Keep the provider and yt-dlp plugin versions aligned by rebuilding/redeploying when either project publishes a breaking release.
