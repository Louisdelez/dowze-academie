"""Managed notebook admission, in-app invitations and reads.

All checks, including the live session and CSRF hash, run under the same write
transaction as receipt lookup/publication. This module never calls a sync helper
that would open a nested transaction. No mail, public link or shared writer exists
in this first candidate stage.
"""
from __future__ import annotations
from .notebook_metadata import project_metadata

from datetime import datetime, timedelta, timezone
import hashlib
import json
from uuid import uuid4

from .security import token_hash, verify_csrf
from .sync import canonical_json, request_digest
from .notebook_payload import decode_notebook_source, NotebookPayloadError

PROTOCOL = "dowze-managed-notebook@1"
MAX_VERSION = 9_007_199_254_740_991
MAX_RECEIPTS = 100_000
MAX_MEMBERS = 1_000


class NotebookError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(code)


def fail(status, code, message):
    raise NotebookError(status, code, message)


def timestamp(now):
    return now.astimezone(timezone.utc).isoformat()


def principal(connection, token, expected_account, csrf, now, *, mutation):
    """Never trust the middleware's earlier session observation."""
    if not token:
        fail(401, "invalid_session", "Authentication required")
    session = connection.execute(
        "SELECT s.id AS session_id,s.csrf_hash,s.expires_at,s.revoked_at,a.id "
        "FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?",
        (token_hash(token),),
    ).fetchone()
    if session is None or session["revoked_at"] is not None or datetime.fromisoformat(session["expires_at"]) <= now:
        fail(401, "invalid_session", "Authentication required")
    if not expected_account:
        fail(400, "expected_account_required", "The managed protocol requires the actor account")
    if session["id"] != expected_account:
        fail(409, "session_account_changed", "The active session belongs to another account")
    if mutation and not verify_csrf(session, csrf):
        fail(403, "csrf_rejected", "CSRF validation failed")
    return session["id"]


class RequestAuthority:
    """A server-owned clock is sampled only inside the acquired transaction."""
    def __init__(self, token, expected_account, csrf, clock, *, mutation=True):
        self.token, self.expected_account, self.csrf, self.clock, self.mutation = token, expected_account, csrf, clock, mutation

    def check(self, connection, *, expires_at=None):
        now = self.clock()
        actor = principal(connection, self.token, self.expected_account, self.csrf, now, mutation=self.mutation)
        if expires_at is not None and datetime.fromisoformat(expires_at) <= now:
            fail(410, "invitation_inactive", "Invitation is no longer active")
        return actor, now


def _next(value):
    if value >= MAX_VERSION:
        fail(409, "version_exhausted", "The resource requires an explicit migration")
    return value + 1


def _documents(connection, resource, source_policy=None):
    result = []
    for kind, field in (("whiteboard", "canonical_document_id"), ("notesMarkdown", "metadata_document_id")):
        row = connection.execute(
            "SELECT document_type,document_id,version,content_json,deleted,updated_at FROM sync_documents "
            "WHERE account_id=? AND space_id=? AND document_type=? AND document_id=?",
            (resource["owner_account_id"], resource["space_id"], kind, resource[field]),
        ).fetchone()
        if row is None or row["deleted"] or row["content_json"] is None:
            fail(409, "notebook_source_changed", "The registered notebook source is unavailable")
        content = json.loads(row["content_json"])
        if kind == "whiteboard":
            if source_policy is not None:
                try:
                    decode_notebook_source(connection, source_policy.blob_dir,
                        owner_account_id=resource["owner_account_id"], space_id=resource["space_id"], content=content,
                        expected_note_id=resource["note_id"], expected_lineage=resource["lineage"], max_blob_bytes=source_policy.max_blob_bytes)
                except NotebookPayloadError as failure:
                    fail(409, failure.code, failure.message)
            elif isinstance(content, dict) and content.get("notebookEnvelope") == 3:
                fail(409, "managed_notebook_envelope_requires_adapter", "The compressed notebook needs a verified managed adapter")
            if source_policy is None:
                collaboration = content.get("collaboration") if isinstance(content, dict) else None
                if not isinstance(content, dict) or content.get("notebookSchema") != 3 or content.get("noteId") != resource["note_id"] or not isinstance(collaboration, dict) or collaboration.get("schema") != 1 or collaboration.get("lineage") != resource["lineage"]:
                    fail(409, "notebook_source_changed", "The notebook incarnation no longer matches")
        elif project_metadata(resource, content) is None:
            fail(409, "notebook_source_changed", "The notebook metadata identity no longer matches")
        result.append({"document_type": kind, "document_id": row["document_id"], "version": row["version"], "content": content, "changed_at": row["updated_at"]})
    return result


def _resource(connection, resource_id, actor, *, owner=False, incarnation=None, source_policy=None, verify_source=True):
    row = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
    # Do not distinguish another account's unknown resource from a missing one.
    grant = None if row is None else connection.execute(
        "SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=? AND revoked_at IS NULL",
        (resource_id, actor),
    ).fetchone()
    if row is None or row["owner_account_id"] != actor and (owner or grant is None):
        fail(404, "notebook_not_found", "Notebook not found")
    if row["state"] != "active":
        fail(410, "notebook_inactive", "Notebook is not active")
    if incarnation is not None and row["incarnation"] != incarnation:
        fail(409, "notebook_incarnation_changed", "Notebook incarnation changed")
    # Only an owner revocation may skip unavailable content. It returns no
    # document data and still checks the live session/resource/incarnation/CAS.
    if not verify_source and not owner:
        raise ValueError("source bypass is restricted to owner revocation")
    documents = _documents(connection, row, source_policy) if verify_source else None
    return row, grant, documents


def _descriptor(resource, actor, grant=None):
    return {"protocol": PROTOCOL, "id": resource["id"], "incarnation": resource["incarnation"],
            "owner_account_id": resource["owner_account_id"], "space_id": resource["space_id"],
            "note_id": resource["note_id"], "canonical_document_id": resource["canonical_document_id"],
            "metadata_document_id": resource["metadata_document_id"], "lineage": resource["lineage"],
            "state": resource["state"], "resource_version": resource["resource_version"],
            "acl_version": resource["acl_version"], "role": "owner" if actor == resource["owner_account_id"] else grant["role"],
            "access_version": resource["acl_version"] if actor == resource["owner_account_id"] else grant["version"],
            "writer_version": resource["resource_version"] if actor == resource["owner_account_id"] else grant["version"],
            "capabilities": {"read_documents": True, "write_documents": False, "read_blobs": True,
                             "manage_acl": actor == resource["owner_account_id"]}}


def _replay(connection, actor, key, resource_id, digest):
    row = connection.execute("SELECT * FROM notebook_receipts WHERE actor_account_id=? AND idempotency_key=?", (actor, key)).fetchone()
    if row is None:
        return None
    if row["resource_id"] != resource_id or row["request_hash"] != digest:
        fail(422, "idempotency_key_reused", "Idempotency key was used for another request")
    return row["status_code"], json.loads(row["response_json"])


def _receipt(connection, actor, key, resource_id, digest, status, payload, now):
    count = connection.execute("SELECT count(*) FROM notebook_receipts WHERE actor_account_id=?", (actor,)).fetchone()[0]
    if count >= MAX_RECEIPTS:
        fail(429, "idempotency_capacity", "Operation history capacity reached")
    connection.execute("INSERT INTO notebook_receipts(actor_account_id,idempotency_key,resource_id,request_hash,status_code,response_json,created_at) VALUES(?,?,?,?,?,?,?)",
                       (actor, key, resource_id, digest, status, canonical_json(payload), timestamp(now)))
    return status, payload


def _acl_cas(resource, expected):
    if resource["acl_version"] != expected:
        fail(409, "acl_version_conflict", "Access changed; read the current descriptor before retrying")


def _bump_acl(connection, resource, now):
    value = _next(resource["acl_version"])
    connection.execute("UPDATE notebook_resources SET acl_version=?,updated_at=? WHERE id=?", (value, timestamp(now), resource["id"]))
    return value


def register(db, token, expected_account, csrf, resource_id, body, key, clock, *, source_policy=None, retention_settings=None):
    digest = request_digest("notebook-register@1", resource_id, canonical_json(body))
    authority = RequestAuthority(token, expected_account, csrf, clock)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        existing = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
        if existing is not None:
            resource, _, _ = _resource(connection, resource_id, actor, owner=True, source_policy=source_policy)
            replay = _replay(connection, actor, key, resource_id, digest)
            if replay:
                authority.check(connection)
                return replay
            fail(409, "notebook_exists", "Notebook resource is already registered")
        # Check key reuse even though no resource exists yet. No receipt is saved
        # until its foreign-key resource and the two exact source checks succeed.
        _replay(connection, actor, key, resource_id, digest)
        resource = {"id": resource_id, "owner_account_id": actor, "space_id": body["space_id"], "note_id": body["note_id"],
                    "canonical_document_id": body["canonical_document_id"], "metadata_document_id": body["metadata_document_id"], "lineage": body["lineage"]}
        documents = _documents(connection, resource, source_policy)
        for document, name in zip(documents, ("canonical", "metadata")):
            proof = body[name]
            checksum = hashlib.sha256(canonical_json(document["content"]).encode("utf-8")).hexdigest()
            if document["version"] != proof["version"] or checksum != proof["sha256"]:
                fail(409, "notebook_source_changed", "The source changed before managed admission")
        collision = connection.execute("SELECT 1 FROM notebook_resources WHERE owner_account_id=? AND space_id=? AND (canonical_document_id=? OR metadata_document_id=? OR note_id=?)",
                                       (actor, body["space_id"], body["canonical_document_id"], body["metadata_document_id"], body["note_id"])).fetchone()
        if collision:
            fail(409, "notebook_identity_exists", "The source already has a managed resource")
        created = timestamp(now)
        resource.update(incarnation=str(uuid4()), state="active", resource_version=1, acl_version=1, created_at=created, updated_at=created)
        connection.execute("INSERT INTO notebook_resources(id,incarnation,owner_account_id,space_id,note_id,canonical_document_id,metadata_document_id,lineage,state,resource_version,acl_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           tuple(resource[field] for field in ("id", "incarnation", "owner_account_id", "space_id", "note_id", "canonical_document_id", "metadata_document_id", "lineage", "state", "resource_version", "acl_version", "created_at", "updated_at")))
        from .notebook_retention import capture_admission
        capture_admission(connection, retention_settings, source_policy, resource, body, actor, authority)
        _, now = authority.check(connection)
        return _receipt(connection, actor, key, resource_id, digest, 201, _descriptor(resource, actor), now)


def read(db, token, expected_account, resource_id, clock, *, documents=False, source_policy=None):
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, _ = authority.check(connection)
        resource, grant, verified_documents = _resource(connection, resource_id, actor, source_policy=source_policy)
        result = _descriptor(resource, actor, grant)
        if documents:
            result["documents"] = verified_documents
        authority.check(connection)
        return result


def invite(db, token, expected_account, csrf, resource_id, invitation_id, body, key, clock, *, source_policy=None):
    digest = request_digest("notebook-invite@1", resource_id, invitation_id, canonical_json(body))
    authority = RequestAuthority(token, expected_account, csrf, clock)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        resource, _, _ = _resource(connection, resource_id, actor, owner=True, incarnation=body["incarnation"], source_policy=source_policy)
        _, now = authority.check(connection)
        invitation = connection.execute("SELECT * FROM notebook_invitations WHERE id=?", (invitation_id,)).fetchone()
        if invitation is not None:
            if invitation["resource_id"] != resource_id:
                fail(409, "invitation_exists", "Invitation identity is already used")
            if invitation["state"] == "revoked" or datetime.fromisoformat(invitation["expires_at"]) <= now:
                fail(410, "invitation_inactive", "Invitation is no longer active")
        replay = _replay(connection, actor, key, resource_id, digest)
        if replay:
            authority.check(connection, expires_at=invitation["expires_at"] if invitation else None)
            return replay
        _acl_cas(resource, body["base_acl_version"])
        if invitation is not None:
            fail(409, "invitation_exists", "Invitation identity is already used")
        recipient = body["recipient_account_id"]
        if recipient == actor or connection.execute("SELECT 1 FROM accounts WHERE id=?", (recipient,)).fetchone() is None:
            fail(422, "invalid_recipient", "Recipient must be another existing account")
        count = connection.execute("SELECT count(*) FROM notebook_invitations WHERE resource_id=?", (resource_id,)).fetchone()[0]
        if count >= MAX_MEMBERS:
            fail(429, "notebook_access_capacity", "Notebook invitation capacity reached")
        created, expires = timestamp(now), timestamp(now + timedelta(seconds=body["ttl_seconds"]))
        connection.execute("INSERT INTO notebook_invitations(id,resource_id,recipient_account_id,role,state,version,created_at,expires_at,updated_at) VALUES(?,?,?,?,'pending',1,?,?,?)",
                           (invitation_id, resource_id, recipient, body["role"], created, expires, created))
        acl_version = _bump_acl(connection, resource, now)
        payload = {"id": invitation_id, "resource_id": resource_id, "incarnation": resource["incarnation"], "recipient_account_id": recipient,
                   "role": body["role"], "state": "pending", "version": 1, "expires_at": expires, "acl_version": acl_version}
        _, now = authority.check(connection, expires_at=expires)
        return _receipt(connection, actor, key, resource_id, digest, 201, payload, now)


def accept(db, token, expected_account, csrf, resource_id, invitation_id, body, key, clock, *, source_policy=None):
    digest = request_digest("notebook-accept@1", resource_id, invitation_id, canonical_json(body))
    authority = RequestAuthority(token, expected_account, csrf, clock)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        invitation = connection.execute("SELECT * FROM notebook_invitations WHERE id=? AND resource_id=? AND recipient_account_id=?", (invitation_id, resource_id, actor)).fetchone()
        resource = connection.execute("SELECT * FROM notebook_resources WHERE id=?", (resource_id,)).fetchone()
        if invitation is None or resource is None:
            fail(404, "invitation_not_found", "Invitation not found")
        if resource["state"] != "active" or resource["incarnation"] != body["incarnation"]:
            fail(410, "notebook_inactive", "Notebook invitation is no longer active")
        if invitation["state"] == "revoked" or invitation["version"] != body["invitation_version"] or datetime.fromisoformat(invitation["expires_at"]) <= now:
            fail(410, "invitation_inactive", "Invitation is no longer active")
        _documents(connection, resource, source_policy)
        _, now = authority.check(connection, expires_at=invitation["expires_at"])
        grant = connection.execute("SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=?", (resource_id, actor)).fetchone()
        if invitation["state"] == "accepted":
            # A revoked/replaced grant can never be recreated by replaying an
            # old accept, even with another key or after a fresh invitation.
            if grant is None or grant["revoked_at"] is not None or grant["source_invitation_id"] != invitation_id or grant["version"] != invitation["accepted_grant_version"]:
                fail(403, "invitation_access_revoked", "The accepted access is no longer current")
        replay = _replay(connection, actor, key, resource_id, digest)
        if replay:
            authority.check(connection, expires_at=invitation["expires_at"])
            return replay
        if invitation["state"] == "accepted":
            fail(409, "invitation_already_accepted", "Use the original operation receipt")
        # Changing a current grant requires a separate owner revocation first.
        if grant is not None and grant["revoked_at"] is None:
            fail(409, "notebook_access_exists", "Access already exists; the owner must revoke it explicitly")
        version = _next(grant["version"]) if grant else 1
        changed = timestamp(now)
        connection.execute("INSERT INTO notebook_grants(resource_id,account_id,role,version,source_invitation_id,created_at,updated_at,revoked_at) VALUES(?,?,?,?,?,?,?,NULL) "
                           "ON CONFLICT(resource_id,account_id) DO UPDATE SET role=excluded.role,version=excluded.version,source_invitation_id=excluded.source_invitation_id,updated_at=excluded.updated_at,revoked_at=NULL",
                           (resource_id, actor, invitation["role"], version, invitation_id, changed, changed))
        connection.execute("UPDATE notebook_invitations SET state='accepted',accepted_grant_version=?,updated_at=? WHERE id=?", (version, changed, invitation_id))
        acl_version = _bump_acl(connection, resource, now)
        _, now = authority.check(connection, expires_at=invitation["expires_at"])
        return _receipt(connection, actor, key, resource_id, digest, 200,
                        {"resource_id": resource_id, "incarnation": resource["incarnation"], "role": invitation["role"], "access_version": version, "acl_version": acl_version}, now)


def revoke(db, token, expected_account, csrf, resource_id, target, body, key, clock, *, invitation=False, source_policy=None):
    digest = request_digest("notebook-revoke-invitation@1" if invitation else "notebook-revoke-grant@1", resource_id, target, canonical_json(body))
    authority = RequestAuthority(token, expected_account, csrf, clock)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        resource, _, _ = _resource(connection, resource_id, actor, owner=True, incarnation=body["incarnation"], source_policy=source_policy, verify_source=False)
        replay = _replay(connection, actor, key, resource_id, digest)
        if replay:
            authority.check(connection)
            return replay
        _acl_cas(resource, body["base_acl_version"])
        if invitation:
            row = connection.execute("SELECT * FROM notebook_invitations WHERE id=? AND resource_id=?", (target, resource_id)).fetchone()
            if row is None:
                fail(404, "invitation_not_found", "Invitation not found")
            recipient = row["recipient_account_id"]
        else:
            recipient = target
            row = connection.execute("SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=?", (resource_id, recipient)).fetchone()
            if row is None:
                fail(404, "notebook_access_not_found", "Notebook access not found")
        changed = timestamp(now)
        grant = connection.execute("SELECT * FROM notebook_grants WHERE resource_id=? AND account_id=?", (resource_id, recipient)).fetchone()
        if grant is not None and grant["revoked_at"] is None and (not invitation or grant["source_invitation_id"] == target):
            connection.execute("UPDATE notebook_grants SET version=?,revoked_at=?,updated_at=? WHERE resource_id=? AND account_id=?", (_next(grant["version"]), changed, changed, resource_id, recipient))
        invitations = connection.execute("SELECT id,version FROM notebook_invitations WHERE resource_id=? AND recipient_account_id=? AND state<>'revoked'" + (" AND id=?" if invitation else ""), (resource_id, recipient, target) if invitation else (resource_id, recipient)).fetchall()
        for previous in invitations:
            connection.execute("UPDATE notebook_invitations SET state='revoked',version=?,updated_at=? WHERE id=?", (_next(previous["version"]), changed, previous["id"]))
        acl_version = _bump_acl(connection, resource, now)
        _, now = authority.check(connection)
        return _receipt(connection, actor, key, resource_id, digest, 200, {"resource_id": resource_id, "target_id": target, "revoked": True, "acl_version": acl_version}, now)


def invitations(db, token, expected_account, clock, after, limit):
    authority = RequestAuthority(token, expected_account, None, clock, mutation=False)
    with db.transaction() as connection:
        actor, now = authority.check(connection)
        rows = connection.execute("SELECT i.id,i.resource_id,i.role,i.version,i.expires_at,r.incarnation FROM notebook_invitations i "
                                  "JOIN notebook_resources r ON r.id=i.resource_id WHERE i.recipient_account_id=? AND i.state='pending' AND r.state='active' AND i.expires_at>? AND i.id>? ORDER BY i.id LIMIT ?",
                                  (actor, timestamp(now), after, limit + 1)).fetchall()
        _, now = authority.check(connection)
        active = [row for row in rows[:limit] if datetime.fromisoformat(row["expires_at"]) > now]
        return {"items": [dict(row) for row in active], "has_more": len(rows) > limit, "next_after": rows[limit - 1]["id"] if len(rows) > limit else None}


def private_write_is_managed(connection, account_id, space_id, document_type, document_id):
    field = "canonical_document_id" if document_type == "whiteboard" else "metadata_document_id" if document_type == "notesMarkdown" else None
    return bool(field and connection.execute(f"SELECT 1 FROM notebook_resources WHERE owner_account_id=? AND space_id=? AND {field}=?", (account_id, space_id, document_id)).fetchone())
