# Debian-based, not -alpine: Playwright's browser binaries need glibc (musl,
# what Alpine ships, doesn't work without a lot of extra fuss) — this same
# image now runs the e2e test suite too, not just the dev server/pipeline.
FROM node:22-bookworm

# Ships an npm that predates the `min-release-age` config (see .npmrc) that
# enforces this project's dependency-cooldown policy.
RUN npm install -g npm@12.0.2

WORKDIR /app
