"""Pluggable SSO adapter interface (stub for future IdP)."""

from abc import ABC, abstractmethod


class AuthAdapter(ABC):
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError
