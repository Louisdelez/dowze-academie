FROM dowze-academie-api:sqlite-before-supabase-20261006
USER root
COPY postgres-requirements.lock /tmp/postgres-requirements.lock
RUN pip install --no-cache-dir --no-deps --require-hashes -r /tmp/postgres-requirements.lock && rm /tmp/postgres-requirements.lock
COPY --chown=10001:10001 app /srv/dowze/app/app
USER 10001:10001
LABEL org.dowze.database="supabase-postgresql" org.dowze.api.version="0.4.1"
