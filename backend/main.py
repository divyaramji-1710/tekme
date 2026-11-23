"""TEKMĒ FastAPI application — optional local API and static host for the UI.

Run:  python -m backend.main          (binds 127.0.0.1:8000)

If ``frontend/dist`` exists (``npm run build``), the UI is served from the same
local origin, so a single process provides the complete offline application.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.core import config, privacy

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tekme")


@asynccontextmanager
async def lifespan(app: FastAPI):
    guarded = privacy.install_network_guard()
    log.info("network guard %s", "active" if guarded else "DISABLED")
    app.state.model = None
    app.state.load_error = None
    try:
        from backend.services.inference import TekmeModel
        app.state.model = TekmeModel.load(config.MODEL_BUNDLE)
        log.info("model loaded in %.2fs from %s", app.state.model.load_seconds, config.MODEL_BUNDLE.name)
    except FileNotFoundError:
        app.state.load_error = "model bundle not found - run scripts/train_all.ps1"
        log.error(app.state.load_error)
    except Exception as e:  # keep the API up so /health can report the problem
        app.state.load_error = f"model failed to load: {type(e).__name__}"
        log.exception("model failed to load")
    yield


def create_app() -> FastAPI:
    # Swagger/ReDoc pages load JavaScript from a public CDN, so they are disabled; /openapi.json remains.
    app = FastAPI(title="TEKMĒ", version="2.0.0", lifespan=lifespan, docs_url=None, redoc_url=None,
                  description="Offline, explainable scam-message detector. All inference is local.")
    app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"], allow_credentials=False)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Do not echo the submitted message back in error payloads.
        errs = [{"loc": [str(x) for x in e.get("loc", [])], "msg": e.get("msg", "invalid")} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": "Invalid request", "errors": errs})

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.error("unhandled %s on %s", type(exc).__name__, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal error while analysing the message."})

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; connect-src 'self' http://127.0.0.1:8000 http://localhost:8000; "
            "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; "
            "worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        return resp

    from backend.api.routes import router
    app.include_router(router)
    app.include_router(router, prefix="/api")

    dist = config.ROOT / "frontend" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="ui")
    return app


app = create_app()


def main() -> None:
    import uvicorn
    uvicorn.run("backend.main:app", host=config.HOST, port=config.PORT, log_level="info",
                access_log=True, proxy_headers=False, server_header=False)


if __name__ == "__main__":
    main()
