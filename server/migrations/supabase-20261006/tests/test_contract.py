from pathlib import Path

import yaml


def test_openapi_contract_exists_and_declares_required_routes_before_runtime():
    contract = yaml.safe_load(Path("openapi.yaml").read_text(encoding="utf-8"))
    assert contract["openapi"] == "3.1.0"
    assert set(contract["paths"]) >= {
        "/health",
        "/v1/accounts",
        "/v1/sessions",
        "/v1/me",
        "/v1/csrf",
        "/v1/spaces",
        "/v1/spaces/{space_id}",
        "/v1/spaces/{space_id}/changes",
        "/v1/spaces/{space_id}/documents/{document_type}/{document_id}",
        "/v1/spaces/{space_id}/blobs",
        "/v1/spaces/{space_id}/blobs/{blob_id}",
        "/v1/catalog",
        "/v1/catalog/{formation_id}/{version}/manifest",
        "/v1/catalog/{formation_id}/{version}/content",
        "/v1/catalog/{formation_id}/{version}/package",
    }
    document = contract["paths"]["/v1/spaces/{space_id}/documents/{document_type}/{document_id}"]
    assert set(document["put"]["responses"]) == {"200", "400", "401", "403", "404", "409", "413", "422", "429"}
    assert set(document["delete"]["responses"]) == {"200", "400", "401", "403", "404", "409", "413", "422", "429"}
    assert document["put"]["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("DocumentInput")
    assert contract["components"]["schemas"]["DocumentInput"]["required"] == ["base_version", "content"]
