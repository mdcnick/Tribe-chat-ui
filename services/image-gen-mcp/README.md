# Image Gen MCP

Standalone MCP server for Chat UI that generates images with Hugging Face diffusion models and serves the resulting images over HTTP.

## What It Exposes

- `generate_image`: turns a text prompt into an image using FLUX or any HF text-to-image model
- `image_to_image`: transforms an existing image based on a new prompt (style transfer, variations)
- `edit_image`: instruction-based editing of an existing image using a model like InstructPix2Pix
- `/mcp`: stateless MCP endpoint for Chat UI
- `/media/<file>`: public image hosting for generated images
- `/healthcheck`: Railway health endpoint

The tool returns:

- `image_url`
- `chat_ui_markdown`
- `mime_type`
- `model`

The `chat_ui_markdown` field is designed for Chat UI's markdown renderer:

```md
![Generated image](https://your-service/media/image.png)
```

That renders as an inline image in this repo's chat UI with click-to-lightbox support.

## Environment

Copy `.env.example` and set:

- `HUGGINGFACE_API_KEY`: required
- `DEFAULT_MODEL_ID`: default text-to-image model (default: `black-forest-labs/FLUX.1-schnell`)
- `IMG2IMG_MODEL_ID`: default image-to-image model (default: `stabilityai/stable-diffusion-xl-base-1.0`)
- `EDIT_MODEL_ID`: default instruction-editing model (default: `timbrooks/instruct-pix2pix`)
- `PUBLIC_BASE_URL`: public base URL used in returned `image_url` values
- `PORT`: default `3000`

## Local Run

```bash
cd services/image-gen-mcp
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/healthcheck
```

## Railway

Create a separate Railway service with its root directory set to:

```text
services/image-gen-mcp
```

Set these Railway variables:

- `HUGGINGFACE_API_KEY`
- `DEFAULT_MODEL_ID`
- `IMG2IMG_MODEL_ID`
- `EDIT_MODEL_ID`
- `PUBLIC_BASE_URL`

If Railway provides `RAILWAY_PUBLIC_DOMAIN`, the service can derive its public URL automatically, but setting `PUBLIC_BASE_URL` explicitly is safer.

### Watch Paths

To prevent the chat-ui service from rebuilding when image-gen files change, set the image-gen service's Watch Paths to:

```
services/image-gen-mcp/**
```

## Chat UI Wiring

Once deployed, add the MCP server URL to Chat UI:

```env
MCP_SERVERS=[
  {"name":"Image Gen","url":"https://your-image-gen-service.up.railway.app/mcp"}
]
```

Then enable the server in Chat UI's MCP Servers panel.

## Notes

- The service stores generated image files under `storage/generated`.
- For production, attach persistent storage or move finished files to object storage.
- `generate_image` uses the HF inference router and defaults to `black-forest-labs/FLUX.1-schnell`.
- `image_to_image` and `edit_image` download the source image from the provided URL, process it, and return the result.
- All three tools return markdown that Chat UI renders inline with full lightbox support.
