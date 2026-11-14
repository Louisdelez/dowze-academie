import json
import hashlib
import pytest
from fastapi.testclient import TestClient
from app.backup_bundle import create_bundle, restore_bundle
from app.config import Settings
from app.main import create_app
from test_sync import make_app, authenticated_client, create_space, mutation_headers, put_document


def test_bundle_restores_session_document_and_private_blob(tmp_path):
    app, settings = make_app(tmp_path/'live')
    client, csrf = authenticated_client(app, 'backup@example.com')
    create_space(client, csrf, 'year-a')
    body = b'synthetic-photo'
    uploaded = client.post('/v1/spaces/year-a/blobs', headers={
        **mutation_headers(csrf, 'photo1'), 'Content-Type':'image/jpeg',
        'X-Content-SHA256':hashlib.sha256(body).hexdigest()}, content=body)
    assert uploaded.status_code == 201
    blob_id = uploaded.json()['id']
    assert put_document(client, csrf, 'year-a', 'notesMarkdown', 'note1', 0,
        {'text':'note synthétique', 'blob_ids':[blob_id]}, 'note1').status_code in (200,201)
    from test_packages import make_zip
    from app.catalog import publish_package
    package = tmp_path/'course.zip'
    make_zip(package)
    publish_package(app.state.db, settings.package_dir, package, 'synthetic-course', '1.0.0', 'Synthetic')
    manifest = create_bundle(settings, tmp_path/'snapshot')
    assert len(manifest['files']) == 3
    result = restore_bundle(tmp_path/'snapshot', tmp_path/'restored')
    assert result['files'] == 3
    restored_settings = Settings(**{**settings.__dict__, 'database_path':tmp_path/'restored/api.sqlite3',
        'blob_dir':tmp_path/'restored/blobs','package_dir':tmp_path/'restored/packages'})
    restored = TestClient(create_app(restored_settings))
    restored.cookies.update(client.cookies)
    assert restored.get('/v1/catalog/synthetic-course/1.0.0/package').content == package.read_bytes()
    assert restored.get('/v1/me').json()['email'] == 'backup@example.com'
    assert restored.get(f'/v1/spaces/year-a/blobs/{blob_id}').content == body
    with restored.app.state.db.connect() as connection:
        assert 'note synthétique' in connection.execute('SELECT content_json FROM sync_documents').fetchone()[0]
    with pytest.raises(FileExistsError):
        restore_bundle(tmp_path/'snapshot', tmp_path/'restored')


def test_corruption_cannot_publish_restore_directory(tmp_path):
    app, settings = make_app(tmp_path/'live')
    create_bundle(settings, tmp_path/'snapshot')
    with (tmp_path/'snapshot/api.sqlite3').open('ab') as stream:
        stream.write(b'tampering')
    with pytest.raises(ValueError):
        restore_bundle(tmp_path/'snapshot', tmp_path/'restored')
    assert not (tmp_path/'restored').exists()


def test_restore_rejects_manifest_traversal(tmp_path):
    app, settings = make_app(tmp_path/'live')
    create_bundle(settings, tmp_path/'snapshot')
    path = tmp_path/'snapshot/manifest.json'
    manifest = json.loads(path.read_text())
    manifest['files']['blobs/../escape'] = {'size':1,'sha256':'0'*64}
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        restore_bundle(tmp_path/'snapshot', tmp_path/'restored')
    assert not (tmp_path/'restored').exists()
