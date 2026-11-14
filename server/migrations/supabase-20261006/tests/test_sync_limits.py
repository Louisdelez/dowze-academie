from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app

def test_sync_limit_is_per_account_not_shared_gateway(tmp_path):
    origin='https://app.example.invalid'
    app=create_app(Settings(environment='test',database_path=tmp_path/'db',package_dir=tmp_path/'packages',allowed_origins=(origin,),request_limit_per_minute=20,sync_request_limit_per_minute=60))
    clients=[]
    for name in ('first','second'):
        client=TestClient(app)
        credentials={'email':f'{name}@example.com','password':'synthetic-password-123'}
        assert client.post('/v1/accounts',headers={'Origin':origin},json=credentials).status_code==201
        assert client.post('/v1/sessions',headers={'Origin':origin},json=credentials).status_code==201
        clients.append(client)
    for _ in range(60):assert clients[0].get('/v1/spaces').status_code==200
    assert clients[0].get('/v1/spaces').status_code==429
    assert clients[1].get('/v1/spaces').status_code==200
    # Anonymous/auth routes retain their independent, lower abuse limit.
    assert clients[0].get('/health').status_code==200
