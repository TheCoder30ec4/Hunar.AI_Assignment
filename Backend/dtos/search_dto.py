"""Request/response contracts for the search endpoints.

ParseJdResponseDTO mirrors JD_parse_service's actual output shape field for
field — the model's SYSTEM_PROMPT in services/JD_Parse_service.py is the
source of truth for what these fields mean; this file is the source of truth
for what shape crosses the HTTP boundary. If the prompt changes what it
extracts, update both together.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field, model_validator

_LEADING_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


class LenientLLMFieldsBase(BaseModel):
    """The prompt's own OUTPUT KEYS spec types several fields as a single
    int (openings, size_min/max, office_days, travel_percent, min/max_years,
    leadership_years, skill years, compensation min/max) — but a JD often
    states these as a range ("25-40 percent", "5-10 years") or with a unit
    ("25-40%"), and the model sometimes writes that range straight into the
    single-int field instead of only using the paired min/max fields where
    one exists. Two normalisations happen here, once, for every nested DTO,
    rather than special-cased per field as new drift shows up:

    1. `null` for a list field the model considers empty, rather than `[]`.
    2. A numeric-range string in an int field — the leading number is kept
       ("25-40%" -> 25) since for a single-value field (no separate min/max
       counterpart, e.g. travel_percent) the low end is the safer estimate.
    """

    @model_validator(mode="before")
    @classmethod
    def _normalise_llm_quirks(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalised = {}
        for key, value in data.items():
            if value is None and _field_expects_list(cls, key):
                normalised[key] = []
            elif isinstance(value, str) and _field_expects_int(cls, key):
                match = _LEADING_NUMBER.search(value)
                normalised[key] = int(float(match.group())) if match else None
            else:
                normalised[key] = value
        return normalised


def _field_expects_list(model: type[BaseModel], field_name: str) -> bool:
    field = model.model_fields.get(field_name)
    if field is None:
        return False
    return getattr(field.annotation, "__origin__", None) is list


def _field_expects_int(model: type[BaseModel], field_name: str) -> bool:
    field = model.model_fields.get(field_name)
    if field is None:
        return False
    # int | None fields have annotation `int | None` -> args (int, NoneType).
    args = getattr(field.annotation, "__args__", (field.annotation,))
    return int in args


class ParseJdRequestDTO(BaseModel):
    jd_text: str = Field(min_length=1)


class RoleDTO(LenientLLMFieldsBase):
    title: str | None = None
    alternate_titles: list[str] = Field(default_factory=list)
    department: str | None = None
    team: str | None = None
    reports_to: str | None = None
    openings: int | None = None
    level: str | None = None


class CompanyDTO(LenientLLMFieldsBase):
    name: str | None = None
    industry: str | None = None
    size_text: str | None = None
    size_min: int | None = None
    size_max: int | None = None
    stage: str | None = None
    description: str | None = None
    website: str | None = None


class LocationDTO(LenientLLMFieldsBase):
    work_mode: str | None = None
    cities: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    office_days: int | None = None
    relocation_offered: bool | None = None
    visa_sponsorship: bool | None = None
    timezone_requirement: str | None = None


class EmploymentDTO(LenientLLMFieldsBase):
    type: str | None = None
    duration: str | None = None
    start_date: str | None = None
    notice_expectation: str | None = None
    shift: str | None = None
    travel_percent: int | None = None


class ExperienceDTO(LenientLLMFieldsBase):
    min_years: int | None = None
    max_years: int | None = None
    domain_experience: list[str] = Field(default_factory=list)
    leadership_required: bool | None = None
    leadership_years: int | None = None


class SkillDTO(LenientLLMFieldsBase):
    name: str
    category: str | None = None
    years: int | None = None
    evidence: str | None = None


class SkillsDTO(LenientLLMFieldsBase):
    must_have: list[SkillDTO] = Field(default_factory=list)
    nice_to_have: list[SkillDTO] = Field(default_factory=list)


class EducationDTO(LenientLLMFieldsBase):
    min_degree: str | None = None
    fields: list[str] = Field(default_factory=list)
    required: bool | None = None
    certifications: list[str] = Field(default_factory=list)


class LanguageRequirementDTO(BaseModel):
    language: str
    level: str | None = None


class CompensationDTO(LenientLLMFieldsBase):
    currency: str | None = None
    min: int | None = None
    max: int | None = None
    period: str | None = None
    equity: str | None = None
    bonus: str | None = None
    variable_pay: str | None = None
    stated_in_jd: bool | None = None


class ScreeningSignalDTO(BaseModel):
    topic: str
    why: str
    ask: str


class MetaDTO(LenientLLMFieldsBase):
    confidence: float | None = None
    assumptions: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    jd_quality: str | None = None
    extracted_at: str | None = None


class ParseJdResponseDTO(LenientLLMFieldsBase):
    role: RoleDTO
    company: CompanyDTO
    location: LocationDTO
    employment: EmploymentDTO
    experience: ExperienceDTO
    skills: SkillsDTO
    responsibilities: list[str] = Field(default_factory=list)
    education: EducationDTO
    languages: list[LanguageRequirementDTO] = Field(default_factory=list)
    compensation: CompensationDTO | None = None
    benefits: list[str] = Field(default_factory=list)
    screening_signals: list[ScreeningSignalDTO] = Field(default_factory=list)
    knockouts: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    meta: MetaDTO
