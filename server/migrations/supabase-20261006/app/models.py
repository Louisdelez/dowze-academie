from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=12, max_length=1024)

    @field_validator("password")
    @classmethod
    def reject_control_characters(cls, value: str) -> str:
        if any(ord(character) < 32 for character in value):
            raise ValueError("control characters are not allowed")
        return value


class AnnualSpaceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    formation_id: str = Field(min_length=1, max_length=64)
    academic_year: str = Field(pattern=r"^[0-9]{4}-[0-9]{4}$")
    title: str = Field(min_length=1, max_length=200)


class DocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_version: int = Field(ge=0)
    content: dict[str, Any]
