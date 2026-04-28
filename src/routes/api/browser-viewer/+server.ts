import { env } from "$env/dynamic/private";
import { error } from "@sveltejs/kit";

// Proxy the Steel session viewer HTML, rewriting the hardcoded container-internal
// WebSocket URL (ws://0.0.0.0:3000) to the host-accessible address so the browser
// can actually connect to the Steel cast WebSocket.
export async function GET() {
	const baseURL = (env.STEEL_BASE_URL ?? "").replace(/\/$/, "");
	if (!baseURL) {
		error(503, "Steel browser not configured");
	}

	const viewerUrl = `${baseURL}/v1/sessions/debug`;
	let html: string;
	try {
		const res = await fetch(viewerUrl);
		if (!res.ok) {
			error(502, `Steel viewer returned ${res.status}`);
		}
		html = await res.text();
	} catch (err) {
		error(502, `Could not reach Steel viewer: ${err instanceof Error ? err.message : err}`);
	}

	// Derive the host-accessible WebSocket base URL from STEEL_BASE_URL
	// e.g. http://localhost:3001 → ws://localhost:3001
	const wsBase = baseURL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
	html = html.replace(/ws:\/\/0\.0\.0\.0:\d+/g, wsBase);

	// The Steel viewer canvas uses height:100%/width:auto, causing it to overflow the
	// panel width when the session viewport (1920×1080) is wider than the panel.
	// Override canvas sizing so it scales to fit the panel width instead.
	const cssOverride = `<style>
.canvas-container { overflow: hidden !important; }
.canvas {
  position: static !important;
  left: auto !important;
  transform: none !important;
  width: 100% !important;
  height: auto !important;
}
</style>`;
	html = html.replace("</head>", cssOverride + "</head>");

	return new Response(html, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}
