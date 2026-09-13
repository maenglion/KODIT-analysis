"""Shared parser failure taxonomy, independent from parser outcomes."""

from __future__ import annotations

from dataclasses import dataclass

from parser_runtime import RuntimeContractError


class DependencyImportFailed(RuntimeError):
    pass


class Sha256Mismatch(ValueError):
    pass


class MagicMismatch(ValueError):
    pass


class DocumentParseFailed(RuntimeError):
    def __init__(self, message: str, code: str = "PARSE_FAILED") -> None:
        super().__init__(message)
        self.failure_code = code


class TextExtractionFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class FailureTaxonomy:
    domain: str
    code: str


def classify_failure(exc: BaseException) -> FailureTaxonomy:
    if isinstance(exc, DependencyImportFailed):
        return FailureTaxonomy("ENVIRONMENT", "DEPENDENCY_IMPORT_FAILED")
    if isinstance(exc, RuntimeContractError):
        return FailureTaxonomy("ENVIRONMENT", "RUNTIME_CONTRACT_FAILED")
    if isinstance(exc, Sha256Mismatch):
        return FailureTaxonomy("INPUT_INTEGRITY", "SHA256_MISMATCH")
    if isinstance(exc, MagicMismatch):
        return FailureTaxonomy("INPUT_INTEGRITY", "MAGIC_MISMATCH")
    if isinstance(exc, TextExtractionFailed):
        return FailureTaxonomy("EXTRACTION", "TEXT_EXTRACTION_FAILED")
    if isinstance(exc, DocumentParseFailed):
        return FailureTaxonomy("DOCUMENT", exc.failure_code)
    return FailureTaxonomy("DOCUMENT", "PARSE_FAILED")
