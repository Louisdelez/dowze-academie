--
-- PostgreSQL database dump
--

\restrict Mw0haufAmu2U5qlmRGQwhWSnp5gPLqFVEEnpeva6razu9pYaIa3apDnyoJCJvAd

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: dowze_academie; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA dowze_academie;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.accounts (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: annual_spaces; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.annual_spaces (
    account_id text NOT NULL,
    id text NOT NULL,
    formation_id text NOT NULL,
    academic_year text NOT NULL,
    title text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: app_metadata; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.app_metadata (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: catalog_packages; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.catalog_packages (
    formation_id text NOT NULL,
    version text NOT NULL,
    title text NOT NULL,
    package_size bigint NOT NULL,
    package_sha256 text NOT NULL,
    manifest_json text NOT NULL,
    stored_path text NOT NULL,
    published_at text NOT NULL,
    CONSTRAINT catalog_packages_package_size_check CHECK ((package_size > 0))
);


--
-- Name: notebook_admission_nonces; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_admission_nonces (
    incarnation text NOT NULL,
    resource_id text NOT NULL,
    owner_account_id text NOT NULL,
    packet_sha256 text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: notebook_grants; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_grants (
    resource_id text NOT NULL,
    account_id text NOT NULL,
    role text NOT NULL,
    version bigint NOT NULL,
    source_invitation_id text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    revoked_at text,
    CONSTRAINT notebook_grants_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'commenter'::text, 'editor'::text]))),
    CONSTRAINT notebook_grants_version_check CHECK ((version > 0))
);


--
-- Name: notebook_invitations; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_invitations (
    id text NOT NULL,
    resource_id text NOT NULL,
    recipient_account_id text NOT NULL,
    role text NOT NULL,
    state text NOT NULL,
    version bigint NOT NULL,
    accepted_grant_version bigint,
    created_at text NOT NULL,
    expires_at text NOT NULL,
    updated_at text NOT NULL,
    CONSTRAINT notebook_invitations_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'commenter'::text, 'editor'::text]))),
    CONSTRAINT notebook_invitations_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text]))),
    CONSTRAINT notebook_invitations_version_check CHECK ((version > 0))
);


--
-- Name: notebook_receipts; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_receipts (
    actor_account_id text NOT NULL,
    idempotency_key text NOT NULL,
    resource_id text NOT NULL,
    request_hash text NOT NULL,
    status_code bigint NOT NULL,
    response_json text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: notebook_resources; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_resources (
    id text NOT NULL,
    incarnation text NOT NULL,
    owner_account_id text NOT NULL,
    space_id text NOT NULL,
    note_id text NOT NULL,
    canonical_document_id text NOT NULL,
    metadata_document_id text NOT NULL,
    lineage text NOT NULL,
    state text NOT NULL,
    resource_version bigint NOT NULL,
    acl_version bigint NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    CONSTRAINT notebook_resources_acl_version_check CHECK ((acl_version > 0)),
    CONSTRAINT notebook_resources_resource_version_check CHECK ((resource_version > 0)),
    CONSTRAINT notebook_resources_state_check CHECK ((state = ANY (ARRAY['active'::text, 'trashed'::text, 'purged'::text])))
);


--
-- Name: notebook_trash_cycles; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_trash_cycles (
    resource_id text NOT NULL,
    incarnation text NOT NULL,
    trash_resource_version bigint NOT NULL,
    source_canonical_version bigint NOT NULL,
    source_metadata_version bigint NOT NULL,
    canonical_tombstone_version bigint NOT NULL,
    metadata_tombstone_version bigint NOT NULL,
    canonical_source_sha256 text NOT NULL,
    metadata_source_sha256 text NOT NULL,
    manifest_sha256 text NOT NULL,
    trashed_at text NOT NULL,
    restore_until text NOT NULL,
    restored_at text,
    restored_resource_version bigint,
    restored_canonical_version bigint,
    restored_metadata_version bigint,
    CONSTRAINT notebook_trash_cycles_canonical_tombstone_version_check CHECK ((canonical_tombstone_version > 0)),
    CONSTRAINT notebook_trash_cycles_metadata_tombstone_version_check CHECK ((metadata_tombstone_version > 0)),
    CONSTRAINT notebook_trash_cycles_source_canonical_version_check CHECK ((source_canonical_version > 0)),
    CONSTRAINT notebook_trash_cycles_source_metadata_version_check CHECK ((source_metadata_version > 0)),
    CONSTRAINT notebook_trash_cycles_trash_resource_version_check CHECK ((trash_resource_version > 0))
);


--
-- Name: notebook_uploads; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_uploads (
    blob_id text NOT NULL,
    resource_id text NOT NULL,
    actor_account_id text NOT NULL,
    incarnation text NOT NULL,
    resource_version bigint NOT NULL,
    writer_version bigint NOT NULL,
    receipt_key text NOT NULL,
    created_at text NOT NULL,
    expires_at text NOT NULL,
    published_at text,
    CONSTRAINT notebook_uploads_resource_version_check CHECK ((resource_version > 0)),
    CONSTRAINT notebook_uploads_writer_version_check CHECK ((writer_version > 0))
);


--
-- Name: notebook_version_blobs; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_version_blobs (
    resource_id text NOT NULL,
    canonical_version bigint NOT NULL,
    metadata_version bigint NOT NULL,
    blob_id text NOT NULL
);


--
-- Name: notebook_version_sources; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_version_sources (
    resource_id text NOT NULL,
    canonical_version bigint NOT NULL,
    metadata_version bigint NOT NULL,
    canonical_source_json text NOT NULL,
    metadata_source_json text NOT NULL,
    canonical_source_bytes bigint NOT NULL,
    metadata_source_bytes bigint NOT NULL,
    canonical_source_sha256 text NOT NULL,
    metadata_source_sha256 text NOT NULL,
    canonical_codec text NOT NULL,
    body_id text,
    captured_at text NOT NULL,
    CONSTRAINT notebook_version_sources_canonical_codec_check CHECK ((canonical_codec = ANY (ARRAY['inline'::text, 'gzip'::text]))),
    CONSTRAINT notebook_version_sources_canonical_source_bytes_check CHECK ((canonical_source_bytes > 0)),
    CONSTRAINT notebook_version_sources_check CHECK ((((canonical_codec = 'inline'::text) AND (body_id IS NULL)) OR ((canonical_codec = 'gzip'::text) AND (body_id IS NOT NULL)))),
    CONSTRAINT notebook_version_sources_metadata_source_bytes_check CHECK ((metadata_source_bytes > 0))
);


--
-- Name: notebook_versions; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.notebook_versions (
    resource_id text NOT NULL,
    canonical_version bigint NOT NULL,
    metadata_version bigint NOT NULL,
    canonical_sha256 text NOT NULL,
    metadata_sha256 text NOT NULL,
    manifest_json text NOT NULL,
    actor_account_id text NOT NULL,
    created_at text NOT NULL,
    CONSTRAINT notebook_versions_canonical_version_check CHECK ((canonical_version > 0)),
    CONSTRAINT notebook_versions_metadata_version_check CHECK ((metadata_version > 0))
);


--
-- Name: sessions; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.sessions (
    id text NOT NULL,
    account_id text NOT NULL,
    token_hash text NOT NULL,
    csrf_hash text NOT NULL,
    created_at text NOT NULL,
    expires_at text NOT NULL,
    revoked_at text
);


--
-- Name: sync_blob_refs; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.sync_blob_refs (
    blob_id text NOT NULL,
    account_id text NOT NULL,
    space_id text NOT NULL,
    document_type text NOT NULL,
    document_id text NOT NULL
);


--
-- Name: sync_blobs; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.sync_blobs (
    id text NOT NULL,
    account_id text NOT NULL,
    space_id text NOT NULL,
    stored_name text NOT NULL,
    media_type text NOT NULL,
    size bigint NOT NULL,
    sha256 text NOT NULL,
    created_at text NOT NULL,
    CONSTRAINT sync_blobs_size_check CHECK ((size > 0))
);


--
-- Name: sync_changes; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.sync_changes (
    sequence bigint NOT NULL,
    account_id text NOT NULL,
    space_id text NOT NULL,
    document_type text NOT NULL,
    document_id text NOT NULL,
    version bigint NOT NULL,
    content_json text,
    deleted bigint NOT NULL,
    changed_at text NOT NULL,
    CONSTRAINT sync_changes_deleted_check CHECK ((deleted = ANY (ARRAY[(0)::bigint, (1)::bigint])))
);


--
-- Name: sync_changes_sequence_seq; Type: SEQUENCE; Schema: dowze_academie; Owner: -
--

CREATE SEQUENCE dowze_academie.sync_changes_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sync_changes_sequence_seq; Type: SEQUENCE OWNED BY; Schema: dowze_academie; Owner: -
--

ALTER SEQUENCE dowze_academie.sync_changes_sequence_seq OWNED BY dowze_academie.sync_changes.sequence;


--
-- Name: sync_documents; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.sync_documents (
    account_id text NOT NULL,
    space_id text NOT NULL,
    document_type text NOT NULL,
    document_id text NOT NULL,
    version bigint NOT NULL,
    content_json text,
    content_bytes bigint NOT NULL,
    deleted bigint NOT NULL,
    updated_at text NOT NULL,
    CONSTRAINT sync_documents_content_bytes_check CHECK ((content_bytes >= 0)),
    CONSTRAINT sync_documents_deleted_check CHECK ((deleted = ANY (ARRAY[(0)::bigint, (1)::bigint]))),
    CONSTRAINT sync_documents_version_check CHECK ((version > 0))
);


--
-- Name: sync_idempotency; Type: TABLE; Schema: dowze_academie; Owner: -
--

CREATE TABLE dowze_academie.sync_idempotency (
    account_id text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    status_code bigint NOT NULL,
    response_json text NOT NULL,
    created_at text NOT NULL
);


--
-- Name: sync_changes sequence; Type: DEFAULT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_changes ALTER COLUMN sequence SET DEFAULT nextval('dowze_academie.sync_changes_sequence_seq'::regclass);


--
-- Name: accounts accounts_email_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.accounts
    ADD CONSTRAINT accounts_email_key UNIQUE (email);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: annual_spaces annual_spaces_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.annual_spaces
    ADD CONSTRAINT annual_spaces_pkey PRIMARY KEY (account_id, id);


--
-- Name: app_metadata app_metadata_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.app_metadata
    ADD CONSTRAINT app_metadata_pkey PRIMARY KEY (key);


--
-- Name: catalog_packages catalog_packages_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.catalog_packages
    ADD CONSTRAINT catalog_packages_pkey PRIMARY KEY (formation_id, version);


--
-- Name: catalog_packages catalog_packages_stored_path_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.catalog_packages
    ADD CONSTRAINT catalog_packages_stored_path_key UNIQUE (stored_path);


--
-- Name: notebook_admission_nonces notebook_admission_nonces_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_admission_nonces
    ADD CONSTRAINT notebook_admission_nonces_pkey PRIMARY KEY (incarnation);


--
-- Name: notebook_admission_nonces notebook_admission_nonces_resource_id_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_admission_nonces
    ADD CONSTRAINT notebook_admission_nonces_resource_id_key UNIQUE (resource_id);


--
-- Name: notebook_grants notebook_grants_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_grants
    ADD CONSTRAINT notebook_grants_pkey PRIMARY KEY (resource_id, account_id);


--
-- Name: notebook_invitations notebook_invitations_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_invitations
    ADD CONSTRAINT notebook_invitations_pkey PRIMARY KEY (id);


--
-- Name: notebook_receipts notebook_receipts_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_receipts
    ADD CONSTRAINT notebook_receipts_pkey PRIMARY KEY (actor_account_id, idempotency_key);


--
-- Name: notebook_resources notebook_resources_incarnation_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_incarnation_key UNIQUE (incarnation);


--
-- Name: notebook_resources notebook_resources_owner_account_id_space_id_canonical_docu_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_owner_account_id_space_id_canonical_docu_key UNIQUE (owner_account_id, space_id, canonical_document_id);


--
-- Name: notebook_resources notebook_resources_owner_account_id_space_id_metadata_docum_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_owner_account_id_space_id_metadata_docum_key UNIQUE (owner_account_id, space_id, metadata_document_id);


--
-- Name: notebook_resources notebook_resources_owner_account_id_space_id_note_id_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_owner_account_id_space_id_note_id_key UNIQUE (owner_account_id, space_id, note_id);


--
-- Name: notebook_resources notebook_resources_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_pkey PRIMARY KEY (id);


--
-- Name: notebook_trash_cycles notebook_trash_cycles_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_trash_cycles
    ADD CONSTRAINT notebook_trash_cycles_pkey PRIMARY KEY (resource_id, trash_resource_version);


--
-- Name: notebook_uploads notebook_uploads_actor_account_id_receipt_key_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_uploads
    ADD CONSTRAINT notebook_uploads_actor_account_id_receipt_key_key UNIQUE (actor_account_id, receipt_key);


--
-- Name: notebook_uploads notebook_uploads_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_uploads
    ADD CONSTRAINT notebook_uploads_pkey PRIMARY KEY (blob_id);


--
-- Name: notebook_version_blobs notebook_version_blobs_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_version_blobs
    ADD CONSTRAINT notebook_version_blobs_pkey PRIMARY KEY (resource_id, canonical_version, metadata_version, blob_id);


--
-- Name: notebook_version_sources notebook_version_sources_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_version_sources
    ADD CONSTRAINT notebook_version_sources_pkey PRIMARY KEY (resource_id, canonical_version, metadata_version);


--
-- Name: notebook_versions notebook_versions_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_versions
    ADD CONSTRAINT notebook_versions_pkey PRIMARY KEY (resource_id, canonical_version, metadata_version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_hash_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sessions
    ADD CONSTRAINT sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: sync_blob_refs sync_blob_refs_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_blob_refs
    ADD CONSTRAINT sync_blob_refs_pkey PRIMARY KEY (blob_id, account_id, space_id, document_type, document_id);


--
-- Name: sync_blobs sync_blobs_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_blobs
    ADD CONSTRAINT sync_blobs_pkey PRIMARY KEY (id);


--
-- Name: sync_blobs sync_blobs_stored_name_key; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_blobs
    ADD CONSTRAINT sync_blobs_stored_name_key UNIQUE (stored_name);


--
-- Name: sync_changes sync_changes_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_changes
    ADD CONSTRAINT sync_changes_pkey PRIMARY KEY (sequence);


--
-- Name: sync_documents sync_documents_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_documents
    ADD CONSTRAINT sync_documents_pkey PRIMARY KEY (account_id, space_id, document_type, document_id);


--
-- Name: sync_idempotency sync_idempotency_pkey; Type: CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_idempotency
    ADD CONSTRAINT sync_idempotency_pkey PRIMARY KEY (account_id, idempotency_key);


--
-- Name: accounts_email_lower; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE UNIQUE INDEX accounts_email_lower ON dowze_academie.accounts USING btree (lower(email));


--
-- Name: notebook_invitations_recipient; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE INDEX notebook_invitations_recipient ON dowze_academie.notebook_invitations USING btree (recipient_account_id, id);


--
-- Name: notebook_uploads_resource; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE INDEX notebook_uploads_resource ON dowze_academie.notebook_uploads USING btree (resource_id, blob_id);


--
-- Name: sessions_account_id; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE INDEX sessions_account_id ON dowze_academie.sessions USING btree (account_id);


--
-- Name: sessions_expires_at; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE INDEX sessions_expires_at ON dowze_academie.sessions USING btree (expires_at);


--
-- Name: sync_blobs_owner; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE INDEX sync_blobs_owner ON dowze_academie.sync_blobs USING btree (account_id, space_id);


--
-- Name: sync_changes_scope; Type: INDEX; Schema: dowze_academie; Owner: -
--

CREATE INDEX sync_changes_scope ON dowze_academie.sync_changes USING btree (account_id, space_id, sequence);


--
-- Name: annual_spaces annual_spaces_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.annual_spaces
    ADD CONSTRAINT annual_spaces_account_id_fkey FOREIGN KEY (account_id) REFERENCES dowze_academie.accounts(id) ON DELETE CASCADE;


--
-- Name: notebook_admission_nonces notebook_admission_nonces_owner_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_admission_nonces
    ADD CONSTRAINT notebook_admission_nonces_owner_account_id_fkey FOREIGN KEY (owner_account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_admission_nonces notebook_admission_nonces_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_admission_nonces
    ADD CONSTRAINT notebook_admission_nonces_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: notebook_grants notebook_grants_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_grants
    ADD CONSTRAINT notebook_grants_account_id_fkey FOREIGN KEY (account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_grants notebook_grants_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_grants
    ADD CONSTRAINT notebook_grants_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: notebook_invitations notebook_invitations_recipient_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_invitations
    ADD CONSTRAINT notebook_invitations_recipient_account_id_fkey FOREIGN KEY (recipient_account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_invitations notebook_invitations_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_invitations
    ADD CONSTRAINT notebook_invitations_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: notebook_receipts notebook_receipts_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_receipts
    ADD CONSTRAINT notebook_receipts_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_receipts notebook_receipts_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_receipts
    ADD CONSTRAINT notebook_receipts_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: notebook_resources notebook_resources_owner_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_owner_account_id_fkey FOREIGN KEY (owner_account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_resources notebook_resources_owner_account_id_space_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_resources
    ADD CONSTRAINT notebook_resources_owner_account_id_space_id_fkey FOREIGN KEY (owner_account_id, space_id) REFERENCES dowze_academie.annual_spaces(account_id, id) ON DELETE RESTRICT;


--
-- Name: notebook_trash_cycles notebook_trash_cycles_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_trash_cycles
    ADD CONSTRAINT notebook_trash_cycles_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: notebook_trash_cycles notebook_trash_cycles_resource_id_source_canonical_version_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_trash_cycles
    ADD CONSTRAINT notebook_trash_cycles_resource_id_source_canonical_version_fkey FOREIGN KEY (resource_id, source_canonical_version, source_metadata_version) REFERENCES dowze_academie.notebook_version_sources(resource_id, canonical_version, metadata_version) ON DELETE RESTRICT;


--
-- Name: notebook_uploads notebook_uploads_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_uploads
    ADD CONSTRAINT notebook_uploads_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_uploads notebook_uploads_blob_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_uploads
    ADD CONSTRAINT notebook_uploads_blob_id_fkey FOREIGN KEY (blob_id) REFERENCES dowze_academie.sync_blobs(id) ON DELETE RESTRICT;


--
-- Name: notebook_uploads notebook_uploads_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_uploads
    ADD CONSTRAINT notebook_uploads_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: notebook_version_blobs notebook_version_blobs_blob_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_version_blobs
    ADD CONSTRAINT notebook_version_blobs_blob_id_fkey FOREIGN KEY (blob_id) REFERENCES dowze_academie.sync_blobs(id) ON DELETE RESTRICT;


--
-- Name: notebook_version_blobs notebook_version_blobs_resource_id_canonical_version_metad_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_version_blobs
    ADD CONSTRAINT notebook_version_blobs_resource_id_canonical_version_metad_fkey FOREIGN KEY (resource_id, canonical_version, metadata_version) REFERENCES dowze_academie.notebook_versions(resource_id, canonical_version, metadata_version) ON DELETE RESTRICT;


--
-- Name: notebook_version_sources notebook_version_sources_body_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_version_sources
    ADD CONSTRAINT notebook_version_sources_body_id_fkey FOREIGN KEY (body_id) REFERENCES dowze_academie.sync_blobs(id) ON DELETE RESTRICT;


--
-- Name: notebook_version_sources notebook_version_sources_resource_id_canonical_version_met_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_version_sources
    ADD CONSTRAINT notebook_version_sources_resource_id_canonical_version_met_fkey FOREIGN KEY (resource_id, canonical_version, metadata_version) REFERENCES dowze_academie.notebook_versions(resource_id, canonical_version, metadata_version) ON DELETE RESTRICT;


--
-- Name: notebook_versions notebook_versions_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_versions
    ADD CONSTRAINT notebook_versions_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES dowze_academie.accounts(id) ON DELETE RESTRICT;


--
-- Name: notebook_versions notebook_versions_resource_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.notebook_versions
    ADD CONSTRAINT notebook_versions_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES dowze_academie.notebook_resources(id) ON DELETE RESTRICT;


--
-- Name: sessions sessions_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sessions
    ADD CONSTRAINT sessions_account_id_fkey FOREIGN KEY (account_id) REFERENCES dowze_academie.accounts(id) ON DELETE CASCADE;


--
-- Name: sync_blob_refs sync_blob_refs_account_id_space_id_document_type_document__fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_blob_refs
    ADD CONSTRAINT sync_blob_refs_account_id_space_id_document_type_document__fkey FOREIGN KEY (account_id, space_id, document_type, document_id) REFERENCES dowze_academie.sync_documents(account_id, space_id, document_type, document_id) ON DELETE CASCADE;


--
-- Name: sync_blob_refs sync_blob_refs_blob_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_blob_refs
    ADD CONSTRAINT sync_blob_refs_blob_id_fkey FOREIGN KEY (blob_id) REFERENCES dowze_academie.sync_blobs(id) ON DELETE RESTRICT;


--
-- Name: sync_blobs sync_blobs_account_id_space_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_blobs
    ADD CONSTRAINT sync_blobs_account_id_space_id_fkey FOREIGN KEY (account_id, space_id) REFERENCES dowze_academie.annual_spaces(account_id, id) ON DELETE CASCADE;


--
-- Name: sync_changes sync_changes_account_id_space_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_changes
    ADD CONSTRAINT sync_changes_account_id_space_id_fkey FOREIGN KEY (account_id, space_id) REFERENCES dowze_academie.annual_spaces(account_id, id) ON DELETE CASCADE;


--
-- Name: sync_documents sync_documents_account_id_space_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_documents
    ADD CONSTRAINT sync_documents_account_id_space_id_fkey FOREIGN KEY (account_id, space_id) REFERENCES dowze_academie.annual_spaces(account_id, id) ON DELETE CASCADE;


--
-- Name: sync_idempotency sync_idempotency_account_id_fkey; Type: FK CONSTRAINT; Schema: dowze_academie; Owner: -
--

ALTER TABLE ONLY dowze_academie.sync_idempotency
    ADD CONSTRAINT sync_idempotency_account_id_fkey FOREIGN KEY (account_id) REFERENCES dowze_academie.accounts(id) ON DELETE CASCADE;


--
-- Name: accounts; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: annual_spaces; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.annual_spaces ENABLE ROW LEVEL SECURITY;

--
-- Name: app_metadata; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.app_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_packages; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.catalog_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.accounts TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: annual_spaces server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.annual_spaces TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: app_metadata server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.app_metadata TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: catalog_packages server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.catalog_packages TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sessions server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.sessions TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sync_blob_refs server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.sync_blob_refs TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sync_blobs server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.sync_blobs TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sync_changes server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.sync_changes TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sync_documents server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.sync_documents TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sync_idempotency server_access; Type: POLICY; Schema: dowze_academie; Owner: -
--

CREATE POLICY server_access ON dowze_academie.sync_idempotency TO dowze_academie_api USING (true) WITH CHECK (true);


--
-- Name: sessions; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_blob_refs; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.sync_blob_refs ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_blobs; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.sync_blobs ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_changes; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.sync_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_documents; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.sync_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_idempotency; Type: ROW SECURITY; Schema: dowze_academie; Owner: -
--

ALTER TABLE dowze_academie.sync_idempotency ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Mw0haufAmu2U5qlmRGQwhWSnp5gPLqFVEEnpeva6razu9pYaIa3apDnyoJCJvAd

