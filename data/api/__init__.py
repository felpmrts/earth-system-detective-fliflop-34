"""Camada HTTP REST para integração do backend de dados com o frontend."""

from .server import BackendRouter, run_server

__all__ = ["BackendRouter", "run_server"]
