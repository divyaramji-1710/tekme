"""Pydantic request / response models."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from backend.core.config import MAX_MESSAGE_CHARS
from backend.services.mutations import MUTATION_TYPES


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_MESSAGE_CHARS, description="One SMS / WhatsApp message")

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message is empty")
        return v


class Span(BaseModel):
    text: str
    start: int
    end: int


class TacticOut(BaseModel):
    id: str
    label: str
    description: str
    strength: Literal["weak", "moderate", "strong"]
    rationale: str
    evidence: list[Span]


class SignalOut(BaseModel):
    id: str
    label: str
    severity: Literal["info", "low", "medium", "high"]
    detail: str
    evidence: list[Span]


class Highlight(BaseModel):
    start: int
    end: int
    kind: Literal["tactic", "signal", "benign", "term"]
    label: str
    text: str


class KeyFactor(BaseModel):
    feature: str
    label: str
    contribution: float
    direction: str


class ConfidenceInterpretation(BaseModel):
    level: str
    text: str


class PredictResponse(BaseModel):
    verdict: Literal["SCAM", "SAFE"]
    category: Literal["KYC_BANK", "LOTTERY_PRIZE", "LOAN_CREDIT", "JOB_INVESTMENT", "OTHER"] | None
    category_label: str | None
    confidence: float = Field(..., ge=0, le=1, description="Calibrated probability of the predicted verdict")
    scam_probability: float = Field(..., ge=0, le=1)
    borderline: bool
    language: str
    normalized_text: str
    tactics: list[TacticOut]
    risk_signals: list[SignalOut]
    benign: dict
    category_probabilities: dict[str, float] | None
    obfuscation: dict[str, int]
    explanation: str
    confidence_interpretation: ConfidenceInterpretation
    key_factors: list[KeyFactor]
    semantic_terms: list[dict]
    highlights: list[Highlight]
    evidence_note: str
    latency_ms: float


class MutateRequest(PredictRequest):
    types: list[str] | None = Field(None, description=f"Subset of: {', '.join(MUTATION_TYPES)}")
    variants_per_type: int = Field(1, ge=1, le=3)
    seed: int = Field(0, ge=0, le=10_000)

    @field_validator("types")
    @classmethod
    def known_types(cls, v):
        if v is not None:
            bad = [t for t in v if t not in MUTATION_TYPES]
            if bad:
                raise ValueError(f"unknown mutation types: {bad}")
            if not v:
                raise ValueError("types must not be empty")
        return v


class MutationOut(BaseModel):
    type: str
    description: str
    text: str
    changed: bool


class EvaluateMutationsRequest(MutateRequest):
    expected_label: Literal["SCAM", "SAFE"] | None = Field(
        None, description="Ground truth, if known. Without it only prediction consistency is reported.")


class MutationResult(MutationOut):
    verdict: Literal["SCAM", "SAFE"]
    confidence: float
    scam_probability: float
    category: str | None
    verdict_changed: bool


class MutationSummary(BaseModel):
    n_variants: int
    n_changed_text: int
    consistency: float = Field(..., description="Share of variants with the same verdict as the original")
    verdict_flips: int
    mean_confidence: float
    min_scam_probability: float
    max_scam_probability: float
    accuracy_vs_expected: float | None = Field(None, description="Only when expected_label is given")
    metric_note: str


class EvaluateMutationsResponse(BaseModel):
    original: dict
    variants: list[MutationResult]
    summary: MutationSummary
