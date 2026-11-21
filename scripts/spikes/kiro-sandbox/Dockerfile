# P0-04 spike image: Kiro CLI in a minimal, non-root container.
# Not the production sandbox image (that is P4-02 in integrations/kiro/sandbox-image).
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Install Kiro CLI with the official script, then move the binary out of the
# home directory so HOME can be a tmpfs at runtime.
RUN curl -fsSL https://cli.kiro.dev/install -o /tmp/kiro-install.sh \
 && sha256sum /tmp/kiro-install.sh > /kiro-install.sha256 \
 && bash /tmp/kiro-install.sh \
 && install -m 0755 "$(command -v kiro-cli || echo /root/.local/bin/kiro-cli)" /usr/local/bin/kiro-cli \
 && rm -rf /root/.local /tmp/kiro-install.sh \
 && kiro-cli --version > /kiro-version.txt

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin lathe
USER 10001:10001
ENV HOME=/home/lathe
WORKDIR /workspace/app
ENTRYPOINT ["kiro-cli"]
