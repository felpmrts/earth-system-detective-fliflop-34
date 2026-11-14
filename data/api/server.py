"""Servidor HTTP REST leve (stdlib) do backend de dados para o frontend React/Vite.

Endpoints:
- GET  /api/health
- GET  /api/catalog
- POST /api/analyze        (Contrato oficial `RegionAnalysisRequest -> RegionAnalysisResponse`)
- POST /api/location/fetch
- POST /api/compare

Execução:
    python3 -m data.api.server --port 8000
"""

from __future__ import annotations

import argparse
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from data.cache.store import CellCacheStore
from data.catalog.environmental_catalog import get_catalog_tree
from data.models.contracts import LocationQuery
from data.services.comparison_service import (
    ContractSemanticError,
    analyze_regions_contract,
    compare_locations_multi_variable,
    compare_locations_single_variable,
)
from data.services.ingestion_service import (
    fetch_location_multiple_variables,
    fetch_location_single_variable,
)


class BackendRouter:
    """Roteador puro (sem dependência de socket) para facilitar testes unitários e HTTP."""

    def __init__(self, cache: CellCacheStore | None = None) -> None:
        self.cache = cache or CellCacheStore()

    def handle_get(self, path: str) -> tuple[int, dict[str, Any]]:
        if path == "/api/health":
            return HTTPStatus.OK, {"status": "OK", "service": "earth-system-detective-data-backend"}
        if path == "/api/catalog":
            return HTTPStatus.OK, get_catalog_tree()
        return HTTPStatus.NOT_FOUND, {"error": f"Rota GET desconhecida: {path}"}

    def handle_post(self, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        try:
            if path == "/api/analyze":
                return HTTPStatus.OK, analyze_regions_contract(body, cache=self.cache)

            start_year = int(body.get("start_year", 2001))
            end_year = int(body.get("end_year", 2023))

            if path == "/api/location/fetch":
                loc = LocationQuery.from_dict(body.get("location", body), default_name="Local")
                vars_list = loc.get_variables()
                if len(vars_list) == 1:
                    return HTTPStatus.OK, fetch_location_single_variable(
                        loc, start_year, end_year, cache=self.cache, label=loc.name
                    )
                return HTTPStatus.OK, fetch_location_multiple_variables(
                    loc, start_year, end_year, cache=self.cache, label=loc.name
                )

            if path == "/api/compare":
                if "region_a" in body:
                    return HTTPStatus.OK, analyze_regions_contract(body, cache=self.cache)
                loc_a = LocationQuery.from_dict(body["location_a"], default_name="Local A")
                loc_b = LocationQuery.from_dict(body["location_b"], default_name="Local B")
                if len(loc_a.get_variables()) == 1 and len(loc_b.get_variables()) == 1:
                    return HTTPStatus.OK, compare_locations_single_variable(
                        loc_a, loc_b, start_year, end_year, cache=self.cache
                    )
                return HTTPStatus.OK, compare_locations_multi_variable(
                    loc_a, loc_b, start_year, end_year, cache=self.cache
                )

            return HTTPStatus.NOT_FOUND, {"error": f"Rota POST desconhecida: {path}"}
        except ContractSemanticError as exc:
            return exc.status_code, {"code": exc.code, "error": str(exc)}
        except (KeyError, TypeError, ValueError) as exc:
            return HTTPStatus.BAD_REQUEST, {"error": str(exc)}


class _RequestHandler(BaseHTTPRequestHandler):
    router = BackendRouter()
    max_body_bytes = int(os.environ.get("DATA_API_MAX_BODY_BYTES", str(1024 * 1024)))
    cors_allow_origin = os.environ.get("DATA_API_CORS_ORIGIN", "*").strip() or "*"

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Access-Control-Allow-Origin", self.cors_allow_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(HTTPStatus.NO_CONTENT, {})

    def do_GET(self) -> None:  # noqa: N802
        status_code, payload = self.router.handle_get(self.path.split("?", 1)[0])
        self._send_json(status_code, payload)

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Content-Length inválido."})
            return
        if length < 0 or length > self.max_body_bytes:
            self._send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"error": f"Payload excede o limite de {self.max_body_bytes} bytes."},
            )
            return
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": f"JSON inválido: {exc}"})
            return
        status_code, payload = self.router.handle_post(self.path.split("?", 1)[0], body)
        self._send_json(status_code, payload)


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Inicia o servidor HTTP REST local para o frontend."""
    server = ThreadingHTTPServer((host, port), _RequestHandler)
    print(f"Servidor de dados ativo em http://{host}:{port} (Ctrl+C para encerrar)")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Servidor REST do Backend de Dados")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
