# The roua CLI (including `roua mcp`) as a container, built from this repository.
#   docker run --rm -e ADMIN_DATABASE_URL ghcr.io/promisegithub/roua audit --all
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && npx tsc -b packages/core packages/cli \
 && mkdir /pkgs \
 && npm pack -w packages/core -w packages/cli --pack-destination /pkgs

FROM node:22-alpine
LABEL org.opencontainers.image.title="roua" \
      org.opencontainers.image.description="ROUA: create, audit and verify read-only database accounts" \
      org.opencontainers.image.source="https://github.com/PromiseGithub/roua" \
      org.opencontainers.image.url="https://kaizam.com" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=build /pkgs /tmp/pkgs
WORKDIR /opt/roua
RUN npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund /tmp/pkgs/*.tgz \
 && rm -rf /tmp/pkgs /root/.npm \
 && ln -s /opt/roua/node_modules/@roua-dev/cli/dist/bin.js /usr/local/bin/roua
USER node
WORKDIR /work
ENTRYPOINT ["node", "/opt/roua/node_modules/@roua-dev/cli/dist/bin.js"]
CMD ["--help"]
