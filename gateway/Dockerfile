# Tangerine SSO gateway.
#
# Terminates OpenID Connect for Tangerine and answers Traefik's forwardAuth
# requests with a base64 JSON identity header that Pulp reads via
# JSONHeaderRemoteAuthentication.
#
#   docker build -f gateway/Dockerfile -t registry.example.com/tangerine-gateway:1.0 gateway

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY tangerine_gateway ./tangerine_gateway
COPY scripts ./scripts
RUN pip install --no-cache-dir .

RUN useradd --uid 1000 --create-home gateway \
    && mkdir -p /run/tangerine/secrets \
    && chown -R gateway:gateway /run/tangerine

USER 1000

ENV TANGERINE_SECRETS_DIR=/run/tangerine/secrets

EXPOSE 8080

CMD ["uvicorn", "tangerine_gateway.main:app", "--host", "0.0.0.0", "--port", "8080"]
